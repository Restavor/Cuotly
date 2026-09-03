"use server";

import { revalidatePath } from "next/cache";

import { isCivilDay, validateAbsenceRange } from "@/core/team-calendar";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import type { CalendarState } from "./action-state";

/**
 * Las acciones del calendario: pedir una ausencia (HU-30), decidirla
 * (HU-31), declarar disponibilidad (HU-30) y añadir un festivo (HU-32).
 *
 * Ninguna autoriza nada. Quién puede hacer cada cosa lo deciden
 * `request_absence()` (capacidad `perform_jobs`), `decide_absence()`
 * (`manage_absences`) y la política de INSERT de `holidays`
 * (`manage_holidays`), todas en el servidor. Lo que estas funciones
 * validan son las fechas, y solo para poder devolver un mensaje legible
 * antes de llamar: el servidor vuelve a comprobarlo (CLAUDE.md MUST).
 */

function mensajeDeFallo(fallo: unknown): string {
  return fallo instanceof Error ? fallo.message : String(fallo);
}

/** HU-30 · pedir una ausencia. */
export async function requestAbsence(
  _prev: CalendarState,
  formData: FormData,
): Promise<CalendarState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const desde = String(formData.get("startsOn") ?? "").trim();
  const hasta = String(formData.get("endsOn") ?? "").trim();
  const motivo = String(formData.get("reason") ?? "").trim();

  const rango = validateAbsenceRange(desde, hasta);
  if (!rango.ok) {
    const textos = {
      start_invalid: es.calendar.absenceStartInvalid,
      end_invalid: es.calendar.absenceEndInvalid,
      end_before_start: es.calendar.absenceEndBeforeStart,
      too_long: es.calendar.absenceTooLong,
    } as const;
    return { error: textos[rango.error], done: false };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("request_absence", {
      p_space_id: spaceId,
      p_starts_on: desde,
      p_ends_on: hasta,
      p_reason: motivo === "" ? undefined : motivo,
    });
    if (error) {
      console.error("[calendario] request_absence devolvió error", {
        spaceId,
        desde,
        hasta,
        message: error.message,
      });
      return { error: error.message, done: false };
    }
  } catch (fallo) {
    console.error("[calendario] request_absence lanzó", { spaceId, message: mensajeDeFallo(fallo) });
    return { error: mensajeDeFallo(fallo), done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/**
 * HU-31 · aprobar o rechazar. `decide_absence()` es idempotente: decidir
 * dos veces sobre la misma ausencia produce un único efecto (CA-17), así
 * que aquí no hace falta ninguna clave adicional.
 */
export async function decideAbsence(
  _prev: CalendarState,
  formData: FormData,
): Promise<CalendarState> {
  const absenceId = String(formData.get("absenceId") ?? "");
  const aprobar = String(formData.get("approve") ?? "") === "true";
  const nota = String(formData.get("note") ?? "").trim();

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("decide_absence", {
      p_absence_id: absenceId,
      p_approve: aprobar,
      p_note: nota === "" ? undefined : nota,
    });
    if (error) {
      console.error("[calendario] decide_absence devolvió error", {
        absenceId,
        aprobar,
        message: error.message,
      });
      return { error: error.message, done: false };
    }
  } catch (fallo) {
    console.error("[calendario] decide_absence lanzó", { absenceId, message: mensajeDeFallo(fallo) });
    return { error: mensajeDeFallo(fallo), done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/**
 * HU-30 · declarar disponibilidad. Va por la tabla y no por una función:
 * `worker_availability` tiene políticas de INSERT y UPDATE que exigen
 * `user_id = auth.uid()`, así que nadie puede declarar la disponibilidad
 * de otro ni escribiendo el uuid a mano en el formulario — de hecho el
 * uuid ni siquiera viaja, se lee de la sesión aquí.
 *
 * Sin fila = disponible (RN-ASG-10: no hay horario obligatorio), y por eso
 * el `upsert` sobre `(space_id, user_id)` es la operación correcta: la
 * primera declaración crea la fila y las siguientes la cambian.
 */
export async function setAvailability(
  _prev: CalendarState,
  formData: FormData,
): Promise<CalendarState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const disponible = String(formData.get("available") ?? "") === "true";
  const nota = String(formData.get("note") ?? "").trim();

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: es.states.noPermissionTitle, done: false };
    }

    const { error } = await supabase.from("worker_availability").upsert(
      {
        space_id: spaceId,
        user_id: user.id,
        available: disponible,
        note: nota === "" ? null : nota,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "space_id,user_id" },
    );

    if (error) {
      console.error("[calendario] worker_availability devolvió error", {
        spaceId,
        disponible,
        message: error.message,
      });
      return { error: error.message, done: false };
    }
  } catch (fallo) {
    console.error("[calendario] worker_availability lanzó", {
      spaceId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/**
 * HU-32 · añadir un festivo, con auditoría. La auditoría no la escribe
 * esta acción: la escribe un trigger sobre `holidays` desde la migración
 * 16, precisamente para que el dato no pueda entrar sin ella sea cual sea
 * el camino. Aquí solo se inserta.
 *
 * `created_by` tiene que ser quien firma la sesión porque la política de
 * INSERT lo exige (`created_by = auth.uid()`): mandarlo desde el
 * formulario sería regalar una forma de firmar en nombre de otro, así que
 * se lee del servidor.
 */
export async function addHoliday(
  _prev: CalendarState,
  formData: FormData,
): Promise<CalendarState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const dia = String(formData.get("holidayDate") ?? "").trim();
  const nombre = String(formData.get("name") ?? "").trim();

  if (!isCivilDay(dia)) {
    return { error: es.calendar.holidayDateInvalid, done: false };
  }
  if (nombre === "") {
    return { error: es.calendar.holidayNameRequired, done: false };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: es.states.noPermissionTitle, done: false };
    }

    const { error } = await supabase.from("holidays").insert({
      space_id: spaceId,
      holiday_date: dia,
      name: nombre,
      created_by: user.id,
    });

    if (error) {
      // `unique (space_id, holiday_date)`: repetir el día no es un fallo
      // del sistema, es que ya estaba. Se dice con sus palabras en vez de
      // enseñar el error de la restricción.
      if (error.code === "23505") {
        return { error: es.calendar.holidayDuplicate, done: false };
      }
      console.error("[calendario] holidays insert devolvió error", {
        spaceId,
        dia,
        message: error.message,
      });
      return { error: error.message, done: false };
    }
  } catch (fallo) {
    console.error("[calendario] holidays insert lanzó", { spaceId, message: mensajeDeFallo(fallo) });
    return { error: mensajeDeFallo(fallo), done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}
