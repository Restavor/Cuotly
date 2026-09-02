"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
import { classifyRequest } from "@/services/ai-classifier";
import { createAdminClient } from "@/lib/supabase/admin";
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
 * Y a continuación clasifica, que es la mitad que faltaba. `src/services/
 * ai-classifier.ts` existía con sus tests desde el Hito 4 y no lo llamaba
 * nadie: `begin_request_analysis()` dejaba la solicitud en `analyzing` y
 * `validate_classification()` exige `pending_internal_validation`, así que
 * el salto entre las dos no lo daba nadie y una solicitud enviada se
 * quedaba atascada. Desde la interfaz, el flujo solicitar → aceptar era
 * imposible de completar.
 *
 * Se graba con `record_classification()`, reservada a `service_role`
 * (migración 20260830000018): RN-CLS-01 dice que lo que propuso la IA no
 * puede depender de lo que afirme el cliente, así que lo escribe el
 * servidor con sus propias credenciales, nunca la sesión del usuario. Por
 * eso hace falta `SUPABASE_SERVICE_ROLE_KEY`, y por eso se comprueba antes
 * y se dice en claro: sin ella el fallo salía como un error críptico de
 * PostgREST.
 *
 * `classifyRequest()` nunca lanza: sin `ANTHROPIC_API_KEY`, o con la API
 * caída, cae al motor de reglas (RN-CLS-02). El análisis no depende de que
 * Anthropic esté disponible.
 */
export async function beginAnalysis(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const requestId = String(formData.get("requestId") ?? "");

  const empezado = await run((s) => s.rpc("begin_request_analysis", { p_request_id: requestId }));
  if (empezado.error) return empezado;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: es.teamArea.requests.classifyNoServiceKey, done: false };
  }

  const supabase = await createClient();
  const { data: solicitud } = await supabase
    .from("requests")
    .select("description, context, created_by")
    .eq("id", requestId)
    .maybeSingle();

  if (!solicitud) {
    return { error: es.teamArea.requests.classifyNotFound, done: false };
  }

  const propuesta = await classifyRequest(
    [solicitud.description, solicitud.context].filter(Boolean).join("\n\n"),
  );

  // El actor es quien ENVIÓ la solicitud, no quien pulsa aquí:
  // `record_classification()` comprueba que ese actor tenga acceso de
  // escritura al establecimiento, y quien lo tiene es el cliente.
  const { error } = await createAdminClient().rpc("record_classification", {
    p_request_id: requestId,
    p_actor_id: solicitud.created_by,
    p_source: propuesta.source,
    p_category: propuesta.category,
    p_summary: propuesta.summary,
    p_matched_keywords: propuesta.matchedKeywords ? [...propuesta.matchedKeywords] : undefined,
    p_model: propuesta.model,
    p_input_tokens: propuesta.usage?.inputTokens,
    p_output_tokens: propuesta.usage?.outputTokens,
    p_estimated_cost_cents: propuesta.estimatedCostCents,
    p_fallback_reason: propuesta.fallbackReason,
  });

  if (error) return { error: error.message, done: false };

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
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
