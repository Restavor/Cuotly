"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type RequestActionState = { error: string | null; done: boolean };

export const INITIAL_REQUEST_ACTION: RequestActionState = { error: null, done: false };

/**
 * Las cuatro acciones hacen lo mismo: llamar a su función del servidor y
 * traducir el error. La regla la hace cumplir la función, no esta capa.
 */
async function run(
  fn: (
    supabase: Awaited<ReturnType<typeof createClient>>,
  ) => PromiseLike<{ error: { message: string } | null }>,
): Promise<RequestActionState> {
  const supabase = await createClient();
  const { error } = await fn(supabase);
  if (error) return { error: error.message, done: false };
  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/**
 * HU-12 · empezar el análisis. Arranca el estudio de la solicitud; el
 * servidor decide si el estado lo permite y quién puede hacerlo.
 *
 * OJO, y está sin resolver: `begin_request_analysis()` exige
 * `can_write_establishment()`, que es permiso de CLIENTE, así que el
 * equipo NO puede pulsar este botón — falla con "No tienes acceso de
 * escritura a este establecimiento". Las otras tres acciones de esta
 * pantalla (validar, pedir información, rechazar) sí piden
 * `manage_requests`, que es el permiso del equipo.
 *
 * No se ha "arreglado" cambiándole el permiso porque RN-CLS-01 dice que
 * la clasificación ocurre "al enviarse una solicitud", no cuando alguien
 * del equipo lo pide: el paso received -> analyzing es automático, y así
 * lo llama ahora el envío del cliente (restaurantes/[id]/actions.ts). Con
 * eso, una solicitud enviada no se queda en "Recibida" y este botón no
 * aparece en el camino normal.
 *
 * Lo que queda por decidir es si este botón debe existir. Si se queda,
 * necesita el permiso del equipo; si el paso es solo automático, sobra.
 * Es una decisión de producto, no de implementación.
 */
export async function beginAnalysis(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const requestId = String(formData.get("requestId") ?? "");
  return run((s) => s.rpc("begin_request_analysis", { p_request_id: requestId }));
}

/**
 * HU-12 · validar la clasificación. El equipo confirma (o corrige) la
 * categoría y el resumen que propuso la IA; `validate_classification()`
 * comprueba `manage_requests` y que la solicitud esté en
 * `pending_internal_validation`.
 */
export async function validateClassification(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const requestId = String(formData.get("requestId") ?? "");
  const category = String(formData.get("category") ?? "");
  const summary = String(formData.get("summary") ?? "").trim();
  return run((s) =>
    s.rpc("validate_classification", {
      p_request_id: requestId,
      p_category: category,
      p_summary: summary,
    }),
  );
}

/** HU-12 · pedir información. Detiene el contador de primera atención. */
export async function requestMoreInformation(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const requestId = String(formData.get("requestId") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  return run((s) =>
    s.rpc("request_more_information", { p_request_id: requestId, p_message: message }),
  );
}

/** HU-14 · rechazar, con motivo. El restaurante lee ese motivo. */
export async function rejectRequest(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const requestId = String(formData.get("requestId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  return run((s) => s.rpc("reject_request", { p_request_id: requestId, p_reason: reason }));
}
