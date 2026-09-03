"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import type { SettingsState } from "./action-state";

function mensajeDeFallo(fallo: unknown): string {
  return fallo instanceof Error ? fallo.message : String(fallo);
}

/**
 * HU-36 · las acciones de Ajustes (§124, §125 y las preferencias de aviso).
 *
 * Ninguna autoriza nada. `manage_space` lo hacen cumplir `set_space_name()`
 * y `set_space_timezone()`, que además son la ÚNICA puerta: desde la
 * migración 49 `spaces` no tiene política de UPDATE, así que ni siquiera
 * un propietario puede cambiar el nombre o la zona horaria por PostgREST
 * saltándose la auditoría. Aquí solo se traduce la negativa del servidor a
 * un mensaje en pantalla.
 */
export async function saveSpaceName(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const name = String(formData.get("name") ?? "");

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_space_name", {
      p_space_id: spaceId,
      p_name: name,
    });
    if (error) {
      console.error("[ajustes] set_space_name devolvió error", {
        spaceId,
        message: error.message,
      });
      return { error: error.message, done: false, unchanged: false };
    }

    revalidatePath("/espacios", "layout");
    return { error: null, done: data === true, unchanged: data !== true };
  } catch (fallo) {
    console.error("[ajustes] set_space_name lanzó", { spaceId, message: mensajeDeFallo(fallo) });
    return { error: mensajeDeFallo(fallo), done: false, unchanged: false };
  }
}

/**
 * §125 · la zona horaria contractual. El motivo no es decoración: viaja a
 * la columna `reason` de la auditoría, y el servidor rechaza el cambio sin
 * él (§21.1, acciones sensibles).
 */
export async function changeSpaceTimezone(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const timezone = String(formData.get("timezone") ?? "");
  const reason = String(formData.get("reason") ?? "");

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_space_timezone", {
      p_space_id: spaceId,
      p_timezone: timezone,
      p_reason: reason,
    });
    if (error) {
      console.error("[ajustes] set_space_timezone devolvió error", {
        spaceId,
        message: error.message,
      });
      return { error: error.message, done: false, unchanged: false };
    }

    revalidatePath("/espacios", "layout");
    return { error: null, done: data === true, unchanged: data !== true };
  } catch (fallo) {
    console.error("[ajustes] set_space_timezone lanzó", {
      spaceId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false, unchanged: false };
  }
}

/**
 * Las preferencias de aviso de quien mira (§123 · Notificaciones). Son
 * suyas y de este espacio, no del espacio entero: por eso
 * `set_notification_preference()` no admite un tercero como destinatario y
 * escribe siempre sobre `auth.uid()`.
 *
 * Se llama una vez por aviso CAMBIADO, no por los veintidós: el formulario
 * trae el valor anterior de cada uno y aquí se comparan. Guardar lo mismo
 * veintidós veces no rompería nada —la función es un upsert— pero serían
 * veintidós viajes para no cambiar nada.
 *
 * RN-NOT-03 (los avisos que no se pueden desactivar) lo hace cumplir la
 * función del servidor, que rechaza el intento. El formulario los pinta
 * bloqueados por cortesía, no por seguridad.
 */
export async function saveNotificationPreferences(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const eventTypes = formData.getAll("eventType").map(String);

  try {
    const supabase = await createClient();

    for (const eventType of eventTypes) {
      const inApp = formData.get(`inApp:${eventType}`) === "on";
      const email = formData.get(`email:${eventType}`) === "on";
      const anterior = String(formData.get(`previous:${eventType}`) ?? "");

      if (anterior === `${inApp ? "1" : "0"}${email ? "1" : "0"}`) continue;

      const { error } = await supabase.rpc("set_notification_preference", {
        p_space_id: spaceId,
        p_event_type: eventType,
        p_in_app: inApp,
        p_email: email,
      });
      if (error) {
        console.error("[ajustes] set_notification_preference devolvió error", {
          eventType,
          message: error.message,
        });
        return { error: error.message, done: false, unchanged: false };
      }
    }
  } catch (fallo) {
    console.error("[ajustes] set_notification_preference lanzó", {
      spaceId,
      message: mensajeDeFallo(fallo),
    });
    return { error: mensajeDeFallo(fallo), done: false, unchanged: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true, unchanged: false };
}
