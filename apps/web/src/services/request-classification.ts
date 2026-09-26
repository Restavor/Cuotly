import { classifyByRules } from "@/core/classification-rules";
import { valuationMode } from "@/core/credits";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import { classifyRequest } from "./ai-classifier";
import { valuateRequest } from "./ai-credit-valuator";

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

    const texto = [entrada.description, entrada.context].filter(Boolean).join("\n\n");
    const admin = createAdminClient();

    // PRD §41 · con créditos, la IA valora y la solicitud va directa al
    // restaurante (RN-CRE-09); si falla, al equipo (RN-CRE-10).
    if ((await modoDeValoracion(admin, entrada.requestId)) === "credits") {
      return await valorarEnCreditos(admin, entrada.requestId, entrada.actorId, texto);
    }

    const propuesta = await classifyRequest(texto);

    const { error: recordError } = await admin.rpc("record_classification", {
      p_request_id: entrada.requestId,
      p_actor_id: entrada.actorId,
      p_source: propuesta.source,
      p_category: propuesta.category,
      p_summary: propuesta.summary,
      p_matched_keywords: propuesta.matchedKeywords ? [...propuesta.matchedKeywords] : undefined,
      p_model: propuesta.model,
      p_input_tokens: propuesta.usage?.inputTokens,
      p_output_tokens: propuesta.usage?.outputTokens,
      p_estimated_cost_millicents: propuesta.estimatedCostMillicents,
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

type Admin = ReturnType<typeof createAdminClient>;

/**
 * El plan vigente del restaurante decide si se valora en créditos o por
 * categorías (`valuationMode()`, PRD §41). Se lee con el cliente
 * administrativo porque quien envía puede no ver las columnas del plan.
 */
async function modoDeValoracion(admin: Admin, requestId: string) {
  const { data: solicitud } = await admin
    .from("requests")
    .select("kind, establishment_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!solicitud) return "categories" as const;

  const { data: suscripcion } = await admin
    .from("subscriptions")
    .select("plan_id")
    .eq("establishment_id", solicitud.establishment_id)
    .eq("kind", "plan")
    .eq("status", "active")
    .maybeSingle();

  const { data: plan } = suscripcion?.plan_id
    ? await admin
        .from("plans")
        .select("included_credits_half, included_small, included_photo, included_medium, included_large")
        .eq("id", suscripcion.plan_id)
        .maybeSingle()
    : { data: null };

  return valuationMode({
    kind: solicitud.kind,
    plan: plan
      ? {
          creditsHalf: plan.included_credits_half,
          categoryUnits: plan.included_small + plan.included_photo + plan.included_medium + plan.included_large,
        }
      : null,
  });
}

/**
 * RN-CRE-09 y RN-CRE-10. Si la IA valora, `record_credit_valuation()` deja
 * la solicitud pendiente de aceptar. Si no, se graba como antes, con el
 * motivo, para que el equipo la vea en validación interna y fije los
 * créditos a mano: el motor de reglas solo aporta una categoría
 * orientativa, que en créditos no decide nada.
 */
async function valorarEnCreditos(
  admin: Admin,
  requestId: string,
  actorId: string,
  texto: string,
): Promise<ResultadoClasificacion> {
  const valoracion = await valuateRequest(texto);

  if (valoracion.ok) {
    const { error } = await admin.rpc("record_credit_valuation", {
      p_request_id: requestId,
      p_actor_id: actorId,
      p_credits_half: valoracion.creditsHalf,
      p_breakdown: {
        items: valoracion.items.map((i) => ({ description: i.description, credits_half: i.creditsHalf })),
      },
      p_summary: valoracion.summary,
      p_model: valoracion.model,
      p_input_tokens: valoracion.usage.inputTokens,
      p_output_tokens: valoracion.usage.outputTokens,
      p_estimated_cost_millicents: valoracion.costMillicents,
      p_prompt_version: valoracion.promptVersion,
    });
    if (error) {
      console.error("[créditos] record_credit_valuation falló", error.message);
      return { ok: false, motivo: error.message };
    }
    return { ok: true };
  }

  const reglas = classifyByRules(texto);
  const motivo = valoracion.note ? `${valoracion.reason}: ${valoracion.note}` : valoracion.reason;
  const { error } = await admin.rpc("record_classification", {
    p_request_id: requestId,
    p_actor_id: actorId,
    p_source: "rules",
    p_category: reglas.category,
    p_summary: "Sin valoración automática en créditos: la fija el equipo.",
    p_matched_keywords: [...reglas.matchedKeywords],
    p_fallback_reason: `credits:${motivo}`.slice(0, 500),
  });
  if (error) {
    console.error("[créditos] record_classification falló", error.message);
    return { ok: false, motivo: error.message };
  }
  return { ok: true };
}
