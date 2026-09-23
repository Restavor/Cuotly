"use server";

import { revalidatePath } from "next/cache";

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
