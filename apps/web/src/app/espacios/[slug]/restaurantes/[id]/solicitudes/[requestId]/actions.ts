"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ClientRequestState = { error: string | null; done: boolean };

export const INITIAL_CLIENT_REQUEST: ClientRequestState = { error: null, done: false };

async function run(
  fn: (
    supabase: Awaited<ReturnType<typeof createClient>>,
  ) => PromiseLike<{ error: { message: string } | null }>,
): Promise<ClientRequestState> {
  const supabase = await createClient();
  const { error } = await fn(supabase);
  if (error) return { error: error.message, done: false };
  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/** HU-14 · el restaurante no sigue adelante con el alcance propuesto. */
export async function declineRequest(
  _prev: ClientRequestState,
  formData: FormData,
): Promise<ClientRequestState> {
  const requestId = String(formData.get("requestId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  return run((s) => s.rpc("decline_request", { p_request_id: requestId, p_reason: reason || undefined }));
}

/** HU-12 · responder a una petición de información. Reanuda el contador. */
export async function provideInformation(
  _prev: ClientRequestState,
  formData: FormData,
): Promise<ClientRequestState> {
  const requestId = String(formData.get("requestId") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  return run((s) =>
    s.rpc("provide_additional_information", { p_request_id: requestId, p_message: message }),
  );
}

/** RN-SLA-08 · aceptar un alcance revisado. Reinicia el plazo de inicio. */
export async function acceptRevised(
  _prev: ClientRequestState,
  formData: FormData,
): Promise<ClientRequestState> {
  const requestId = String(formData.get("requestId") ?? "");
  return run((s) => s.rpc("accept_revised_request", { p_request_id: requestId }));
}

/**
 * RN-COR-01 y RN-COR-02 · la corrección mínima gratuita.
 *
 * Una por trabajo, dentro de la ventana que se abre al publicar. Las dos
 * condiciones las comprueba `request_free_correction()`: esta acción no
 * sabe si queda corrección ni si la ventana sigue abierta, y no debe
 * saberlo.
 */
export async function requestCorrection(
  _prev: ClientRequestState,
  formData: FormData,
): Promise<ClientRequestState> {
  const jobId = String(formData.get("jobId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  return run((s) => s.rpc("request_free_correction", { p_job_id: jobId, p_description: description }));
}
