"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { clasificarSolicitud } from "@/services/request-classification";
import { es } from "@/i18n/es";

export type RequestFormState = { error: string | null; created: boolean };

/**
 * El cliente pide un cambio (HU-10). Dos pasos, los dos en el servidor:
 * `create_request_draft()` guarda el borrador y `submit_request()` lo envía
 * y arranca T1.
 *
 * Ni el estado ni el arranque del contador se deciden aquí: si el servicio
 * del restaurante está detenido, `submit_request()` lanza y esta acción
 * solo traduce el mensaje. Ocultar el formulario no es un control de
 * acceso (CLAUDE.md).
 */
export async function submitNewRequest(
  _prev: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const context = String(formData.get("context") ?? "").trim();

  if (!description) {
    return { error: es.clientArea.newValidationRequired, created: false };
  }

  const supabase = await createClient();

  const { data: requestId, error: draftError } = await supabase.rpc("create_request_draft", {
    p_establishment_id: establishmentId,
    p_description: description,
    p_context: context || undefined,
  });

  if (draftError || !requestId) {
    return { error: draftError?.message ?? es.states.errorDescription, created: false };
  }

  const { error: submitError } = await supabase.rpc("submit_request", {
    p_request_id: requestId,
  });

  if (submitError) {
    return { error: submitError.message, created: false };
  }

  // RN-CLS-01: la clasificación ocurre "al enviarse una solicitud", aquí
  // y no en una pantalla del equipo. Y no se comprueba el resultado a
  // propósito: RN-CLS-02 dice que el flujo NUNCA se bloquea por la IA. La
  // solicitud ya está enviada y el contador de primera atención ya corre;
  // si la clasificación no sale, la solicitud se queda en "Recibida" y el
  // equipo tiene un botón para reintentarla.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await clasificarSolicitud(supabase, {
      requestId,
      actorId: user.id,
      description,
      context,
    });
  }

  revalidatePath(`/espacios`, "layout");
  return { error: null, created: true };
}

export type AcceptState = { error: string | null; accepted: boolean };

/**
 * El cliente acepta (HU-14, RN-REQ-02). La transacción, el bloqueo de fila
 * y el consumo del crédito los hace `accept_request()` en el servidor: dos
 * clics seguidos no consumen dos créditos (CA-17).
 */
export async function acceptRequest(
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return { error: null, accepted: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_request", { p_request_id: requestId });

  if (error) {
    return { error: error.message, accepted: false };
  }

  revalidatePath(`/espacios`, "layout");
  return { error: null, accepted: true };
}
