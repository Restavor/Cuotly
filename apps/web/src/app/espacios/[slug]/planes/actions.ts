"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import type { PlansState } from "./action-state";

function mensajeDeFallo(fallo: unknown): string {
  return fallo instanceof Error ? fallo.message : String(fallo);
}

/**
 * HU-07 · las seis acciones de planes y servicios (§6 del PRD).
 *
 * Ninguna autoriza nada. `manage_clients` lo hace cumplir cada función del
 * servidor —`create_plan_subscription()`, `create_service_subscription()`,
 * `change_plan_immediately()`, `schedule_plan_change()`,
 * `cancel_scheduled_plan_change()` y `plan_change_preview()`—, y las reglas
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
      return { error: error.message, done: false, preview: null };
    }
  } catch (fallo) {
    console.error("[planes] create_plan_subscription lanzó", {
      establishmentId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false, preview: null };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true, preview: null };
}

/**
 * RN-COM-18 · lo que costaría la mejora, sin ejecutarla. Es una lectura:
 * `plan_change_preview()` no escribe nada.
 */
export async function previewPlanChange(
  _prev: PlansState,
  formData: FormData,
): Promise<PlansState> {
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const planId = String(formData.get("planId") ?? "");

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("plan_change_preview", {
      p_subscription_id: subscriptionId,
      p_new_plan_id: planId,
    });
    if (error) {
      console.error("[planes] plan_change_preview devolvió error", {
        subscriptionId,
        message: error.message,
      });
      return { error: error.message, done: false, preview: null };
    }

    const fila = data?.[0];
    if (!fila) {
      // P6: sin ciclo abierto no hay fracción que prorratear, y decirlo es
      // mejor que enseñar un cero que parecería "gratis".
      return { error: null, done: false, preview: null };
    }

    return {
      error: null,
      done: false,
      preview: {
        differenceCents: fila.difference_cents,
        // `fraction` viene como numeric: llega en texto o en número según
        // el driver, así que se normaliza aquí y se redondea solo para
        // enseñarlo. El dinero no se recalcula con ella.
        fractionPercent: Math.round(Number(fila.fraction) * 100),
        extraSmall: fila.extra_small,
        extraPhoto: fila.extra_photo,
        extraMedium: fila.extra_medium,
        extraLarge: fila.extra_large,
        targetPlanId: planId,
      },
    };
  } catch (fallo) {
    console.error("[planes] plan_change_preview lanzó", {
      subscriptionId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false, preview: null };
  }
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
      return { error: error.message, done: false, preview: null };
    }
  } catch (fallo) {
    console.error("[planes] change_plan_immediately lanzó", {
      subscriptionId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false, preview: null };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true, preview: null };
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
      return { error: error.message, done: false, preview: null };
    }
  } catch (fallo) {
    console.error("[planes] schedule_plan_change lanzó", {
      subscriptionId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false, preview: null };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true, preview: null };
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
      return { error: error.message, done: false, preview: null };
    }
  } catch (fallo) {
    console.error("[planes] cancel_scheduled_plan_change lanzó", {
      subscriptionId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false, preview: null };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true, preview: null };
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
      return { error: error.message, done: false, preview: null };
    }
  } catch (fallo) {
    console.error("[planes] create_service_subscription lanzó", {
      establishmentId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false, preview: null };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true, preview: null };
}
