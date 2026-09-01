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
 */
export async function beginAnalysis(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const requestId = String(formData.get("requestId") ?? "");
  return run((s) => s.rpc("begin_request_analysis", { p_request_id: requestId }));
}

/**
 * HU-13 y RN-CLS-03 · la validación humana. Hasta que alguien del equipo
 * valida, el restaurante no ve categoría ni resumen: la propuesta de la IA
 * nunca sale sola.
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
