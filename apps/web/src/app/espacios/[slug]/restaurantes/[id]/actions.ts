"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { classifyRequest } from "@/services/ai-classifier";
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

  await clasificar(supabase, requestId, establishmentId, description, context);

  revalidatePath(`/espacios`, "layout");
  return { error: null, created: true };
}

/**
 * RN-CLS-01: "**al enviarse una solicitud**, Cuotly llama a la API de
 * Anthropic desde el servidor para proponer categoría, consumo y un
 * resumen del alcance". Aquí, y no en una pantalla del equipo: la
 * clasificación es automática y va pegada al envío.
 *
 * Faltaba entera. `src/services/ai-classifier.ts` existía desde el Hito 4
 * con sus tests y no lo llamaba nadie, así que una solicitud enviada se
 * quedaba en "Recibida" para siempre: `validate_classification()` exige
 * `pending_internal_validation` y nada llevaba hasta ahí. El flujo
 * solicitar → aceptar era imposible de completar desde la interfaz.
 *
 * No devuelve error ni revierte nada, a propósito. RN-CLS-02: "el flujo
 * nunca se bloquea por la IA". La solicitud ya está enviada y el contador
 * de primera atención ya corre; si la clasificación no sale, se queda en
 * "Recibida" y el equipo puede empezarla a mano desde su pantalla. Hacer
 * fallar el envío por esto sería peor que no clasificar.
 *
 * `record_classification()` está reservada a `service_role` (migración
 * 20260830000018) porque RN-CLS-01 dice que la clave nunca se expone al
 * cliente y RN-CLS-04 que se guarda qué propuso de verdad la IA: eso no
 * puede depender de lo que afirme el navegador. De ahí el cliente
 * administrativo, y de ahí que el actor sea quien envió la solicitud —
 * esa función comprueba que el actor tenga acceso de escritura al
 * establecimiento, y quien lo tiene es el cliente.
 */
async function clasificar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestId: string,
  establishmentId: string,
  description: string,
  context: string,
) {
  // No devuelve error, pero tampoco se calla: cada salida deja dicho en la
  // consola del servidor POR QUÉ la solicitud se queda en "Recibida". Sin
  // esto la avería es invisible —la solicitud se envía, todo parece bien y
  // el equipo se encuentra una bandeja atascada— y cuesta una tarde
  // averiguar que faltaba una variable de entorno.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "[clasificación] Falta SUPABASE_SERVICE_ROLE_KEY: la solicitud se queda en 'Recibida'. " +
        "record_classification() está reservada a service_role (RN-CLS-01). " +
        "Ponla en apps/web/.env.local y reinicia el servidor de desarrollo.",
    );
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    console.error("[clasificación] Sin sesión al clasificar; la solicitud se queda en 'Recibida'.");
    return;
  }

  try {
    const { error: analysisError } = await supabase.rpc("begin_request_analysis", {
      p_request_id: requestId,
    });
    if (analysisError) {
      console.error("[clasificación] begin_request_analysis falló", analysisError.message);
      return;
    }

    const propuesta = await classifyRequest([description, context].filter(Boolean).join("\n\n"));

    const { error: recordError } = await createAdminClient().rpc("record_classification", {
      p_request_id: requestId,
      p_actor_id: user.id,
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
    }
  } catch (fallo) {
    console.error(
      "[clasificación] excepción al clasificar",
      fallo instanceof Error ? fallo.message : String(fallo),
    );
  }
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
