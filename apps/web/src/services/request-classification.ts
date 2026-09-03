import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import { classifyRequest } from "./ai-classifier";

/**
 * Clasificar una solicitud, de punta a punta: mover el estado, preguntarle
 * al clasificador y grabar lo que propuso.
 *
 * Vive aquí, y no dentro de una acción, porque **hay dos sitios que lo
 * hacen y tienen que hacerlo igual**: el envío del restaurante, donde
 * ocurre solo (RN-CLS-01, "al enviarse una solicitud"), y el botón
 * "Reintentar análisis" del equipo, para cuando ese primer intento falló.
 * Si fueran dos copias, se separarían.
 *
 * Los tres pasos, y por qué son tres:
 *
 *   1. `begin_request_analysis()` mueve `received -> analyzing`. Es
 *      idempotente y lo pueden dar el cliente (al enviar) y el equipo con
 *      `manage_requests` (al reintentar) — migración 20260902000044.
 *   2. `classifyRequest()` nunca lanza: si no hay clave de Anthropic, si
 *      falla o si tarda, cae al motor de reglas (RN-CLS-02).
 *   3. `record_classification()` graba la propuesta y deja la solicitud
 *      `pending_internal_validation`. Está reservada a `service_role`
 *      porque RN-CLS-01 dice que la clave nunca llega al cliente y
 *      RN-CLS-04 que se guarda qué propuso DE VERDAD la IA: eso no puede
 *      depender de lo que afirme el navegador. De ahí el cliente
 *      administrativo.
 *
 * Devuelve un resultado explícito en vez de lanzar (CLAUDE.md, "errores de
 * negocio como tipos de resultado explícitos"). Quién lo llama decide qué
 * hacer con un fallo: el envío lo ignora a propósito —RN-CLS-02, "el flujo
 * nunca se bloquea por la IA"— y el reintento lo enseña, porque ahí
 * alguien lo ha pedido y merece saber por qué no ha salido.
 */

export type ResultadoClasificacion =
  | { ok: true }
  | { ok: false; motivo: string };

export async function clasificarSolicitud(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entrada: {
    requestId: string;
    /** Quien queda en la auditoría: el cliente que envió, o quien reintenta. */
    actorId: string;
    description: string;
    context?: string | null;
  },
): Promise<ResultadoClasificacion> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const motivo =
      "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor: record_classification() " +
      "está reservada a service_role (RN-CLS-01) y sin ella no se puede grabar " +
      "la propuesta.";
    console.error("[clasificación]", motivo);
    return { ok: false, motivo };
  }

  try {
    const { error: analysisError } = await supabase.rpc("begin_request_analysis", {
      p_request_id: entrada.requestId,
    });
    if (analysisError) {
      console.error("[clasificación] begin_request_analysis falló", analysisError.message);
      return { ok: false, motivo: analysisError.message };
    }

    const propuesta = await classifyRequest(
      [entrada.description, entrada.context].filter(Boolean).join("\n\n"),
    );

    const { error: recordError } = await createAdminClient().rpc("record_classification", {
      p_request_id: entrada.requestId,
      p_actor_id: entrada.actorId,
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

    if (recordError) {
      console.error("[clasificación] record_classification falló", recordError.message);
      return { ok: false, motivo: recordError.message };
    }

    return { ok: true };
  } catch (fallo) {
    const motivo = fallo instanceof Error ? fallo.message : String(fallo);
    console.error("[clasificación] excepción al clasificar", motivo);
    return { ok: false, motivo };
  }
}
