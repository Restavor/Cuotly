"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { checkOnBehalfRequest, needsAiClassification } from "@/core/request-on-behalf";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { clasificarSolicitud } from "@/services/request-classification";

import type { OnBehalfRequestState } from "./action-state";

const t = es.teamArea.requests.onBehalf;

/**
 * M77 · "Enviar solicitud". Todo lo que importa lo hace
 * `create_request_on_behalf()` en una transacción: comprueba que quien
 * llama tiene `manage_requests`, crea la solicitud ya enviada con su marca
 * y su motivo, enlaza el adjunto, arranca T1, audita y avisa (RN-REQ-08,
 * decisión 73). La clave de idempotencia la genera la página en el
 * servidor: dos pulsaciones devuelven la misma solicitud.
 *
 * `checkOnBehalfRequest()` solo adelanta el motivo de un "no" que el
 * servidor va a dar igual; no autoriza nada.
 *
 * Si no se eligió categoría, la clasifica la IA como al enviar el
 * restaurante (RN-CLS-01), y un fallo no bloquea: la solicitud ya existe y
 * su ficha ofrece "Reintentar análisis" (RN-CLS-02).
 */
export async function createRequestOnBehalf(
  _prev: OnBehalfRequestState,
  formData: FormData,
): Promise<OnBehalfRequestState> {
  const slug = String(formData.get("slug") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  const values = {
    establishmentId: String(formData.get("establishmentId") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    context: String(formData.get("context") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim(),
    priority: String(formData.get("priority") ?? "").trim(),
    priorityReason: String(formData.get("priorityReason") ?? "").trim(),
    onBehalfReason: String(formData.get("onBehalfReason") ?? "").trim(),
  };
  const attachment = String(formData.get("attachmentFileId") ?? "").trim();

  const revisada = checkOnBehalfRequest(values);
  if (!revisada.ok) return { error: t.errors[revisada.error], values };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: es.actions.notAuthenticated, values };

  const { data: requestId, error } = await supabase.rpc("create_request_on_behalf", {
    p_establishment_id: revisada.value.establishmentId,
    p_description: revisada.value.description,
    p_priority: revisada.value.priority,
    p_priority_reason: revisada.value.priorityReason,
    p_on_behalf_reason: revisada.value.onBehalfReason,
    p_idempotency_key: idempotencyKey,
    p_context: values.context || undefined,
    p_category: revisada.value.category ?? undefined,
    p_file_ids: attachment ? [attachment] : undefined,
  });

  if (error || typeof requestId !== "string") {
    return { error: error?.message ?? es.states.errorDescription, values };
  }

  if (needsAiClassification(revisada.value)) {
    // Una segunda pulsación devuelve la misma solicitud: si la primera ya
    // la mandó a analizar, no se le pregunta otra vez a la IA.
    const { data: actual } = await supabase
      .from("requests")
      .select("state")
      .eq("id", requestId)
      .maybeSingle();

    if (actual?.state === "received") {
      await clasificarSolicitud(supabase, {
        requestId,
        actorId: user.id,
        description: revisada.value.description,
        context: values.context,
      });
    }
  }

  revalidatePath("/espacios", "layout");
  redirect(`/espacios/${slug}/solicitudes/${requestId}`);
}
