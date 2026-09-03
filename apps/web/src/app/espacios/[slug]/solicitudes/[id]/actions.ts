"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { clasificarSolicitud } from "@/services/request-classification";
import type { RequestActionState } from "./action-state";

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
 * HU-12 · **Reintentar el análisis**, y solo eso.
 *
 * Decisión de producto (Bosco, 02/09/2026): el análisis se intenta solo al
 * enviarse la solicitud (RN-CLS-01), y este botón existe únicamente para
 * cuando ESE intento falló — una caída de la IA, una clave que faltaba, la
 * red. En el camino normal nadie lo ve, porque la solicitud no se queda en
 * "Recibida"; la pantalla solo lo pinta en ese estado y solo a quien tiene
 * `manage_requests`.
 *
 * Hace lo mismo que el envío, con la misma rutina, para que no puedan
 * separarse: mover a análisis, preguntar al clasificador y grabar la
 * propuesta. La diferencia está en el fallo — el envío lo ignora (RN-CLS-02,
 * "el flujo nunca se bloquea por la IA") y aquí se enseña, porque alguien
 * lo ha pedido a mano y merece saber por qué no ha salido.
 *
 * El permiso lo comprueba el servidor, no esta capa ni la pantalla: la
 * migración 20260902000044 le dio a `begin_request_analysis()` y a
 * `record_classification()` la alternativa de `manage_requests`. Ocultar
 * el botón no es un control de acceso (CLAUDE.md).
 */
export async function retryAnalysis(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const requestId = String(formData.get("requestId") ?? "");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: es.actions.notAuthenticated, done: false };

  // La descripción sale de la base, no del formulario: lo que se clasifica
  // tiene que ser lo que el restaurante escribió, no lo que llegue en una
  // petición.
  const { data: request, error: readError } = await supabase
    .from("requests")
    .select("description, context")
    .eq("id", requestId)
    .maybeSingle();

  if (readError || !request) {
    return { error: readError?.message ?? es.states.errorDescription, done: false };
  }

  const resultado = await clasificarSolicitud(supabase, {
    requestId,
    actorId: user.id,
    description: request.description,
    context: request.context,
  });

  if (!resultado.ok) return { error: resultado.motivo, done: false };

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
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
