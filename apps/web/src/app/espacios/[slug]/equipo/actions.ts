"use server";

import { revalidatePath } from "next/cache";

import { civilDayStartInZone, isCivilDay, nextDay, supervisionWindow } from "@/core/team-calendar";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import type { TeamState } from "./action-state";

function mensajeDeFallo(fallo: unknown): string {
  return fallo instanceof Error ? fallo.message : String(fallo);
}

/**
 * HU-29 y RN-SUP · las cuatro acciones de supervisión: nombrar principal,
 * nombrar sustituto, cambiar la fecha de fin de una sustitución y
 * retirarla.
 *
 * Ninguna autoriza nada. RN-SUP-05 —"solo el propietario del espacio crea
 * o cambia relaciones de supervisión"— lo hace cumplir
 * `has_capability(space, 'manage_space')` dentro de cada función del
 * servidor, y lo mismo con RN-SUP-01 (que el supervisor sea administrador)
 * y RN-SUP-02 (un único principal, revocando el anterior en la misma
 * transacción). Aquí solo se convierten días civiles en instantes y se
 * traduce la negativa del servidor a un mensaje en pantalla.
 */
export async function setPrincipalSupervisor(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const workerId = String(formData.get("workerId") ?? "");
  const adminId = String(formData.get("adminId") ?? "");

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_principal_supervisor", {
      p_space_id: spaceId,
      p_worker_id: workerId,
      p_admin_id: adminId,
    });
    if (error) {
      console.error("[equipo] set_principal_supervisor devolvió error", {
        workerId,
        adminId,
        message: error.message,
      });
      return { error: error.message, done: false };
    }
  } catch (fallo) {
    console.error("[equipo] set_principal_supervisor lanzó", {
      workerId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

export async function setSubstituteSupervisor(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const workerId = String(formData.get("workerId") ?? "");
  const adminId = String(formData.get("adminId") ?? "");
  const desde = String(formData.get("startsAt") ?? "").trim();
  const hasta = String(formData.get("endsAt") ?? "").trim();

  try {
    const supabase = await createClient();

    // La zona se lee del espacio, no del formulario. Mandarla desde el
    // navegador dejaría al cliente decidir en qué huso empieza y acaba una
    // sustitución, y el cliente no es la autoridad de nada (CLAUDE.md).
    const { data: space } = await supabase
      .from("spaces")
      .select("timezone")
      .eq("id", spaceId)
      .maybeSingle();

    // Los dos campos son días civiles y la función del servidor espera
    // `timestamptz`. La conversión se hace en la zona del ESPACIO y con el
    // "hasta" incluido: ver `supervisionWindow()`.
    const ventana = supervisionWindow(desde, hasta, space?.timezone ?? "Europe/Madrid");
    if (ventana === null) {
      return { error: es.teamPage.substituteWindowInvalid, done: false };
    }

    const { error } = await supabase.rpc("set_substitute_supervisor", {
      p_space_id: spaceId,
      p_worker_id: workerId,
      p_admin_id: adminId,
      p_starts_at: ventana.startsAt,
      p_ends_at: ventana.endsAt,
    });
    if (error) {
      console.error("[equipo] set_substitute_supervisor devolvió error", {
        workerId,
        adminId,
        message: error.message,
      });
      return { error: error.message, done: false };
    }
  } catch (fallo) {
    console.error("[equipo] set_substitute_supervisor lanzó", {
      workerId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/**
 * RN-SUP-03 · "puede retirarse antes o ampliarse". Cambiar la fecha de fin
 * cubre las dos: acortarla es retirarla antes, alargarla es ampliarla.
 * Retirarla del todo es `revokeSupervision()`.
 */
export async function rescheduleSubstitute(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const supervisionId = String(formData.get("supervisionId") ?? "");
  const hasta = String(formData.get("endsAt") ?? "").trim();

  if (!isCivilDay(hasta)) {
    return { error: es.teamPage.substituteWindowInvalid, done: false };
  }

  try {
    const supabase = await createClient();

    // La zona sale del espacio de la propia sustitución, por el mismo
    // motivo que al nombrarla.
    const { data: supervision } = await supabase
      .from("supervisions")
      .select("spaces (timezone)")
      .eq("id", supervisionId)
      .maybeSingle();

    // Mismo criterio que al nombrarla: el día elegido queda cubierto
    // entero, así que la fecha de fin es el comienzo del día siguiente.
    const fin = civilDayStartInZone(nextDay(hasta), supervision?.spaces?.timezone ?? "Europe/Madrid");
    if (fin === null) {
      return { error: es.teamPage.substituteWindowInvalid, done: false };
    }

    const { error } = await supabase.rpc("reschedule_substitute_supervision", {
      p_supervision_id: supervisionId,
      p_ends_at: fin,
    });
    if (error) {
      console.error("[equipo] reschedule_substitute_supervision devolvió error", {
        supervisionId,
        message: error.message,
      });
      return { error: error.message, done: false };
    }
  } catch (fallo) {
    console.error("[equipo] reschedule_substitute_supervision lanzó", {
      supervisionId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/** RN-SUP · retirar no borra: marca `revoked_at` y la fila queda de historial. */
export async function revokeSupervision(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const supervisionId = String(formData.get("supervisionId") ?? "");
  const motivo = String(formData.get("reason") ?? "").trim();

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("revoke_supervision", {
      p_supervision_id: supervisionId,
      p_reason: motivo === "" ? undefined : motivo,
    });
    if (error) {
      console.error("[equipo] revoke_supervision devolvió error", {
        supervisionId,
        message: error.message,
      });
      return { error: error.message, done: false };
    }
  } catch (fallo) {
    console.error("[equipo] revoke_supervision lanzó", {
      supervisionId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}
