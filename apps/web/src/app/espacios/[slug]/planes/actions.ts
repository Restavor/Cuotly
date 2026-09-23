"use server";

import { revalidatePath } from "next/cache";

import { readPlanTermsForm, readServiceTermsForm } from "@/core/plan-catalogue";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import type { PlansState, TermsState } from "./action-state";

function mensajeDeFallo(fallo: unknown): string {
  return fallo instanceof Error ? fallo.message : String(fallo);
}

/**
 * HU-07 · las acciones de planes y servicios (§6 del PRD).
 *
 * Ninguna autoriza nada. `manage_clients` lo hace cumplir cada función del
 * servidor —`create_plan_subscription()`, `create_service_subscription()`,
 * `change_plan_immediately()`, `schedule_plan_change()` y
 * `cancel_scheduled_plan_change()`—, y las reglas
 * que rodean cada una (RN-COM-15 sobre la reducción, RN-COM-17 sobre la
 * permanencia, RN-COM-13 sobre el servicio repetido) también. Aquí solo se
 * traduce la negativa del servidor a un mensaje en pantalla.
 *
 * Por eso no hay ni una comprobación de permisos escrita en este archivo:
 * escribirla aquí daría la impresión de que la puerta está en el navegador.
 */
export async function assignPlan(_prev: PlansState, formData: FormData): Promise<PlansState> {
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const planId = String(formData.get("planId") ?? "");

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("create_plan_subscription", {
      p_establishment_id: establishmentId,
      p_plan_id: planId,
    });
    if (error) {
      console.error("[planes] create_plan_subscription devolvió error", {
        establishmentId,
        message: error.message,
      });
      return { error: error.message, done: false };
    }
  } catch (fallo) {
    console.error("[planes] create_plan_subscription lanzó", {
      establishmentId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/** RN-COM-15 · mejora inmediata: se cobra la diferencia prorrateada. */
export async function upgradePlanNow(_prev: PlansState, formData: FormData): Promise<PlansState> {
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const planId = String(formData.get("planId") ?? "");

  try {
    const supabase = await createClient();
    // Sin clave propia: la que se inventa `change_plan_immediately()` por
    // defecto —suscripción + plan destino— ya es la que hace falta para que
    // pulsar dos veces no cobre dos veces (CA-17, RN-DAT-09).
    const { error } = await supabase.rpc("change_plan_immediately", {
      p_subscription_id: subscriptionId,
      p_new_plan_id: planId,
    });
    if (error) {
      console.error("[planes] change_plan_immediately devolvió error", {
        subscriptionId,
        message: error.message,
      });
      return { error: error.message, done: false };
    }
  } catch (fallo) {
    console.error("[planes] change_plan_immediately lanzó", {
      subscriptionId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/** RN-COM-16 y RN-COM-17 · el cambio que espera a la renovación. */
export async function schedulePlanChange(
  _prev: PlansState,
  formData: FormData,
): Promise<PlansState> {
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const planId = String(formData.get("planId") ?? "");

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("schedule_plan_change", {
      p_subscription_id: subscriptionId,
      p_new_plan_id: planId,
    });
    if (error) {
      console.error("[planes] schedule_plan_change devolvió error", {
        subscriptionId,
        message: error.message,
      });
      return { error: error.message, done: false };
    }
  } catch (fallo) {
    console.error("[planes] schedule_plan_change lanzó", {
      subscriptionId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/** Deshacer el cambio programado. No borra la fila: la deja en `cancelled`. */
export async function cancelScheduledPlanChange(
  _prev: PlansState,
  formData: FormData,
): Promise<PlansState> {
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const motivo = String(formData.get("reason") ?? "").trim();

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("cancel_scheduled_plan_change", {
      p_subscription_id: subscriptionId,
      p_reason: motivo === "" ? undefined : motivo,
    });
    if (error) {
      console.error("[planes] cancel_scheduled_plan_change devolvió error", {
        subscriptionId,
        message: error.message,
      });
      return { error: error.message, done: false };
    }
  } catch (fallo) {
    console.error("[planes] cancel_scheduled_plan_change lanzó", {
      subscriptionId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/** RN-COM-11 y RN-COM-13 · contratar un servicio adicional. */
export async function contractService(_prev: PlansState, formData: FormData): Promise<PlansState> {
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const serviceId = String(formData.get("serviceId") ?? "");

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("create_service_subscription", {
      p_establishment_id: establishmentId,
      p_service_id: serviceId,
    });
    if (error) {
      console.error("[planes] create_service_subscription devolvió error", {
        establishmentId,
        message: error.message,
      });
      return { error: error.message, done: false };
    }
  } catch (fallo) {
    console.error("[planes] create_service_subscription lanzó", {
      establishmentId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/**
 * Maqueta 13 · publicar una versión nueva de las condiciones de un plan o
 * servicio (RN-DAT-07). `manage_space` lo comprueba la función; aquí solo
 * se elige cuál de las dos llamar según el sujeto.
 */
export async function publishConditions(_prev: TermsState, formData: FormData): Promise<TermsState> {
  const subjectType = String(formData.get("subjectType") ?? "");
  const subjectId = String(formData.get("subjectId") ?? "");
  const conditions = String(formData.get("conditions") ?? "");

  try {
    const supabase = await createClient();
    const { error } =
      subjectType === "service"
        ? await supabase.rpc("publish_service_conditions", {
            p_service_id: subjectId,
            p_conditions: conditions,
          })
        : await supabase.rpc("publish_plan_conditions", {
            p_plan_id: subjectId,
            p_conditions: conditions,
          });
    if (error) {
      console.error("[planes] publicar condiciones devolvió error", { subjectId, message: error.message });
      return { error: error.message, done: false };
    }
  } catch (fallo) {
    return { error: mensajeDeFallo(fallo), done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/**
 * Maqueta 13 · opción (b) de la decisión del 12/09/2026: el equipo
 * registra que el restaurante aceptó fuera, con fecha y contrato. La
 * fecha viaja como día (`YYYY-MM-DD`) y el servidor la fija en la zona del
 * espacio; el contrato tiene que ser un archivo de ese restaurante, y eso
 * también lo comprueba la función, no este formulario.
 */
export async function recordExternalAcceptance(
  _prev: TermsState,
  formData: FormData,
): Promise<TermsState> {
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const acceptedOn = String(formData.get("acceptedOn") ?? "");
  const fileId = String(formData.get("fileId") ?? "");

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("record_external_terms_acceptance", {
      p_subscription_id: subscriptionId,
      p_version_id: versionId,
      p_accepted_on: acceptedOn,
      p_file_id: fileId,
    });
    if (error) {
      console.error("[planes] record_external_terms_acceptance devolvió error", {
        subscriptionId,
        message: error.message,
      });
      return { error: error.message, done: false };
    }
  } catch (fallo) {
    return { error: mensajeDeFallo(fallo), done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

// ---------------------------------------------------------------------
// Decisión 72 · crear, editar, renombrar y archivar (RN-COM-19 a 21, 27)
// ---------------------------------------------------------------------
//
// Igual que las de arriba: ninguna comprueba permisos. `create_plan()` y
// compañía exigen `manage_space` (RN-COM-19) y deciden por su cuenta si la
// edición va en el sitio o crea versión (RN-COM-20/21). Aquí solo se leen
// los números del formulario y se traduce la respuesta.

type RpcResult = { error: { message: string } | null };

async function run(etiqueta: string, llamada: () => PromiseLike<RpcResult>): Promise<PlansState> {
  try {
    const { error } = await llamada();
    if (error) {
      console.error(`[planes] ${etiqueta} devolvió error`, { message: error.message });
      return { error: error.message, done: false };
    }
  } catch (fallo) {
    console.error(`[planes] ${etiqueta} lanzó`, { message: mensajeDeFallo(fallo) });
    return { error: mensajeDeFallo(fallo), done: false };
  }
  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

export async function createPlan(_prev: PlansState, formData: FormData): Promise<PlansState> {
  const terms = readPlanTermsForm(formData);
  if (!terms.ok) return { error: es.plansPage.edit.errors[terms.error], done: false };
  const v = terms.value;
  const supabase = await createClient();
  return run("create_plan", () =>
    supabase.rpc("create_plan", {
      p_space_id: String(formData.get("spaceId") ?? ""),
      p_name: String(formData.get("name") ?? ""),
      p_price_cents: v.priceCents,
      p_included_small: v.includedSmall,
      p_included_photo: v.includedPhoto,
      p_included_medium: v.includedMedium,
      p_included_large: v.includedLarge,
      p_start_sla_hours: v.startSlaHours,
      p_execution_sla_small: v.executionSlaSmall,
      p_execution_sla_photo: v.executionSlaPhoto,
      p_execution_sla_medium: v.executionSlaMedium,
      p_execution_sla_large: v.executionSlaLarge,
      p_can_order_requests: v.canOrderRequests,
      p_grants_priority: v.grantsPriority,
      p_queue_rank: v.queueRank,
      p_report_level: v.reportLevel,
      p_watches_reviews: v.watchesReviews,
      p_idempotency_key: String(formData.get("idempotencyKey") ?? ""),
    }),
  );
}

export async function revisePlan(_prev: PlansState, formData: FormData): Promise<PlansState> {
  const terms = readPlanTermsForm(formData);
  if (!terms.ok) return { error: es.plansPage.edit.errors[terms.error], done: false };
  const v = terms.value;
  const supabase = await createClient();
  return run("revise_plan", () =>
    supabase.rpc("revise_plan", {
      p_plan_id: String(formData.get("planId") ?? ""),
      p_price_cents: v.priceCents,
      p_included_small: v.includedSmall,
      p_included_photo: v.includedPhoto,
      p_included_medium: v.includedMedium,
      p_included_large: v.includedLarge,
      p_start_sla_hours: v.startSlaHours,
      p_execution_sla_small: v.executionSlaSmall,
      p_execution_sla_photo: v.executionSlaPhoto,
      p_execution_sla_medium: v.executionSlaMedium,
      p_execution_sla_large: v.executionSlaLarge,
      p_can_order_requests: v.canOrderRequests,
      p_grants_priority: v.grantsPriority,
      p_queue_rank: v.queueRank,
      p_report_level: v.reportLevel,
      p_watches_reviews: v.watchesReviews,
      p_idempotency_key: String(formData.get("idempotencyKey") ?? ""),
    }),
  );
}

export async function renamePlan(_prev: PlansState, formData: FormData): Promise<PlansState> {
  const supabase = await createClient();
  return run("rename_plan", () =>
    supabase.rpc("rename_plan", {
      p_plan_id: String(formData.get("planId") ?? ""),
      p_name: String(formData.get("name") ?? ""),
    }),
  );
}

export async function archivePlan(_prev: PlansState, formData: FormData): Promise<PlansState> {
  if (formData.get("confirm") !== "on") return { error: es.plansPage.edit.archiveConfirmMissing, done: false };
  const supabase = await createClient();
  return run("archive_plan", () =>
    supabase.rpc("archive_plan", { p_plan_id: String(formData.get("planId") ?? "") }),
  );
}

export async function createService(_prev: PlansState, formData: FormData): Promise<PlansState> {
  const terms = readServiceTermsForm(formData);
  if (!terms.ok) return { error: es.plansPage.edit.errors[terms.error], done: false };
  const supabase = await createClient();
  return run("create_service", () =>
    supabase.rpc("create_service", {
      p_space_id: String(formData.get("spaceId") ?? ""),
      p_name: String(formData.get("name") ?? ""),
      p_kind: String(formData.get("kind") ?? "other"),
      p_price_cents: terms.value.priceCents,
      p_price_premium_cents: terms.value.pricePremiumCents,
      p_included_updates: terms.value.includedUpdates,
      p_idempotency_key: String(formData.get("idempotencyKey") ?? ""),
    }),
  );
}

export async function reviseService(_prev: PlansState, formData: FormData): Promise<PlansState> {
  const terms = readServiceTermsForm(formData);
  if (!terms.ok) return { error: es.plansPage.edit.errors[terms.error], done: false };
  const supabase = await createClient();
  return run("revise_service", () =>
    supabase.rpc("revise_service", {
      p_service_id: String(formData.get("serviceId") ?? ""),
      p_price_cents: terms.value.priceCents,
      p_price_premium_cents: terms.value.pricePremiumCents,
      p_included_updates: terms.value.includedUpdates,
      p_idempotency_key: String(formData.get("idempotencyKey") ?? ""),
    }),
  );
}

export async function renameService(_prev: PlansState, formData: FormData): Promise<PlansState> {
  const supabase = await createClient();
  return run("rename_service", () =>
    supabase.rpc("rename_service", {
      p_service_id: String(formData.get("serviceId") ?? ""),
      p_name: String(formData.get("name") ?? ""),
    }),
  );
}

export async function archiveService(_prev: PlansState, formData: FormData): Promise<PlansState> {
  if (formData.get("confirm") !== "on") return { error: es.plansPage.edit.archiveConfirmMissing, done: false };
  const supabase = await createClient();
  return run("archive_service", () =>
    supabase.rpc("archive_service", { p_service_id: String(formData.get("serviceId") ?? "") }),
  );
}

/** RN-COM-23 · el restaurante aceptó fuera de Cuotly una versión que le perjudica. */
export async function recordRevisionAcceptance(_prev: TermsState, formData: FormData): Promise<TermsState> {
  const supabase = await createClient();
  return run("record_external_revision_acceptance", () =>
    supabase.rpc("record_external_revision_acceptance", {
      p_subscription_id: String(formData.get("subscriptionId") ?? ""),
      p_accepted_on: String(formData.get("acceptedOn") ?? ""),
      p_file_id: String(formData.get("fileId") ?? ""),
    }),
  );
}
