"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import type { NewRequestDraftState } from "./action-state";

/**
 * R06 · "Guardar borrador" y "Revisar solicitud" hacen lo mismo en el
 * servidor —`create_request_draft()`— y se distinguen por a dónde llevan:
 * el primero al listado, donde el borrador espera con su estado, y el
 * segundo a R07, que es donde se revisa y se envía (§68).
 *
 * Hasta aquí nada se envía: el equipo no ve la solicitud y el contador de
 * primera atención no corre (RN-SLA-01). Lo hará `submit_request()` al
 * confirmar en R07. Que el nivel de prioridad sea uno de los tres y que
 * el motivo quepa en 200 lo comprueba `create_request_draft()`; que no
 * falten al enviar, `submit_request()` (RN-REQ-05). Aquí no se repite
 * ninguna de las dos reglas.
 *
 * El adjunto llega ya subido (`FileUploadField`) y solo viaja su
 * identificador; enlazarlo lo decide `attach_file_to_request_draft()`,
 * que comprueba que el archivo es de este restaurante.
 */
export async function createRequestDraft(
  _prev: NewRequestDraftState,
  formData: FormData,
): Promise<NewRequestDraftState> {
  const slug = String(formData.get("slug") ?? "");
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const intent = String(formData.get("intent") ?? "review");
  const values = {
    kind: String(formData.get("kind") ?? "change"),
    description: String(formData.get("description") ?? "").trim(),
    context: String(formData.get("context") ?? "").trim(),
    priority: String(formData.get("priority") ?? "").trim(),
    priorityReason: String(formData.get("priorityReason") ?? "").trim(),
  };
  const attachment = String(formData.get("attachmentFileId") ?? "").trim();

  if (!values.description) {
    return { error: es.clientArea.newValidationRequired, values };
  }

  const supabase = await createClient();
  const { data: requestId, error } = await supabase.rpc("create_request_draft", {
    p_establishment_id: establishmentId,
    p_description: values.description,
    p_context: values.context || undefined,
    p_priority: values.priority || undefined,
    p_priority_reason: values.priorityReason || undefined,
  });

  if (error || typeof requestId !== "string") {
    return { error: error?.message ?? es.states.errorDescription, values };
  }

  // RN-REQ-09 · el borrador nace como cambio; si es una incidencia, se dice
  // aquí. Quién puede y cuándo lo decide `set_request_kind()`.
  if (values.kind === "incident") {
    const { error: tipo } = await supabase.rpc("set_request_kind", {
      p_request_id: requestId,
      p_kind: "incident",
    });
    if (tipo) {
      revalidatePath("/espacios", "layout");
      redirect(`/espacios/${slug}/restaurantes/${establishmentId}/solicitudes/${requestId}/borrador`);
    }
  }

  if (attachment) {
    const { error: adjunto } = await supabase.rpc("attach_file_to_request_draft", {
      p_request_id: requestId,
      p_file_id: attachment,
    });
    // El borrador ya existe: si el adjunto no entra, se dice en R07, donde
    // se puede volver a añadir, en vez de perder lo escrito aquí.
    if (adjunto) {
      revalidatePath("/espacios", "layout");
      redirect(`/espacios/${slug}/restaurantes/${establishmentId}/solicitudes/${requestId}/borrador?adjunto=fallo`);
    }
  }

  revalidatePath("/espacios", "layout");
  redirect(
    intent === "save"
      ? `/espacios/${slug}/restaurantes/${establishmentId}/solicitudes`
      : `/espacios/${slug}/restaurantes/${establishmentId}/solicitudes/${requestId}/borrador`,
  );
}
