"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { agentsPageHref } from "@/core/reservations/agents-routes";
import { isPin } from "@/core/reservations/device";
import { es } from "@/i18n/es";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  clearDeviceCookie,
  clearElevationCookie,
  loadDevice,
  loadElevation,
  renewElevation,
  setDeviceCookie,
  setElevationCookie,
} from "@/services/agents/device";
import { hashDeviceToken, newDeviceToken, pinHmac, PinSecretMissingError } from "@/services/agents/pin";

import type { SearchResult } from "@/components/shell/AppShell";

import type { DeviceFeedback } from "./device-state";

/**
 * Las acciones de la tablet del local (Fase D, EQU-02; PRD de agents §3.3): activar un dispositivo, abrir
 * Ajustes con el PIN de un Encargado o Propietario y cerrarlos. Ninguna autoriza nada por sí sola:
 * `activate_reservation_device()` comprueba quién es la persona, y el PIN lo comprueba
 * `reservation_device_identify()` con el bloqueo escalado.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * «Usar este dispositivo como tablet del local»: solo desde la cuenta de un Propietario o Encargado, en su propio
 * navegador. El token se genera aquí, va a la cookie `httpOnly` y a la base solo llega su hash.
 */
export async function activateDeviceAction(input: { establishmentId: string; name: string }): Promise<DeviceFeedback> {
  const t = es.agents.team.devices;
  const name = input.name.trim();
  if (!UUID.test(input.establishmentId)) return { ok: false, message: t.errors.failed };
  if (name === "" || name.length > 80) return { ok: false, message: t.errors.name };
  // Activarlo desde otra tablet no tendría sentido: una tablet no es una cuenta.
  if ((await loadDevice()).kind === "active") return { ok: false, message: t.onlyAccount };

  const token = newDeviceToken();
  const supabase = await createClient();
  const { error } = await supabase.rpc("activate_reservation_device", {
    p_establishment_id: input.establishmentId,
    p_name: name,
    p_token_hash: hashDeviceToken(token),
  });
  if (error) {
    return { ok: false, message: /^(Solo un Propietario|Reservas no está|Hace falta|Este restaurante ya tiene)/.test(error.message) ? error.message : t.errors.failed };
  }
  await setDeviceCookie(token);
  // En un dispositivo activado se ignora la sesión personal (PRD §3.3): se cierra aquí, en este navegador, para que la
  // cuenta de quien lo activó no quede abierta en la tablet del local (ni en Restavor web ni en Mi cuenta).
  await supabase.auth.signOut({ scope: "local" });
  revalidatePath(`/agents/${input.establishmentId}`, "layout");
  return { ok: true, message: null, href: agentsPageHref(input.establishmentId, "today") };
}

/**
 * «Ajustes con PIN» en la tablet (PRD §3.3): el PIN de un Encargado o de un Propietario abre los Ajustes
 * durante 2 minutos sin tocar. El del Equipo no sirve para esto.
 */
export async function unlockSettingsAction(input: { establishmentId: string; pin: string }): Promise<DeviceFeedback> {
  const t = es.agents.device;
  const device = await loadDevice();
  if (device.kind !== "active" || device.establishmentId !== input.establishmentId) {
    return { ok: false, message: t.denied.noDevice, device: { code: "no_device" } };
  }
  // Un PIN que no son 4 cifras ni se prueba: no gasta un intento del bloqueo.
  if (!isPin(input.pin)) return { ok: false, message: t.denied.wrongPin(), device: { code: "wrong_pin" } };

  let hmac: string;
  try {
    hmac = pinHmac(input.pin);
  } catch (error) {
    if (error instanceof PinSecretMissingError) return { ok: false, message: t.pinSecretMissing };
    throw error;
  }

  const { data, error } = await createAdminClient().rpc("reservation_device_identify", {
    p_token_hash: device.tokenHash,
    p_pin_hmac: hmac,
  });
  if (error) return { ok: false, message: t.unlock.failed };

  const value = (data ?? {}) as Record<string, unknown>;
  switch (value.outcome) {
    case "ok": {
      if ((value.role !== "manager" && value.role !== "owner") || typeof value.staff_id !== "string") {
        return { ok: false, message: t.unlock.notManager, device: { code: "forbidden" } };
      }
      await setElevationCookie(value.staff_id, input.establishmentId);
      revalidatePath(`/agents/${input.establishmentId}`, "layout");
      return { ok: true, message: null, href: agentsPageHref(input.establishmentId, "settings") };
    }
    case "wrong": {
      const remaining = typeof value.remaining === "number" ? value.remaining : undefined;
      return { ok: false, message: t.denied.wrongPin(remaining), device: { code: "wrong_pin", ...(remaining !== undefined ? { remaining } : {}) } };
    }
    case "locked": {
      const until = typeof value.locked_until === "string" ? value.locked_until : undefined;
      const minutes = until ? Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / 60_000)) : null;
      return { ok: false, message: t.denied.locked(minutes), device: { code: "locked", ...(until ? { lockedUntil: until } : {}) } };
    }
    default:
      return { ok: false, message: t.denied.noDevice, device: { code: "no_device" } };
  }
}

/** Cada vez que se toca algo en Ajustes se renuevan los 2 minutos: «sin tocar», no «en total». */
export async function renewSettingsAction(input: { establishmentId: string }): Promise<{ ok: boolean }> {
  if (!UUID.test(input.establishmentId)) return { ok: false };
  if ((await loadElevation()) === null) return { ok: false };
  await renewElevation(input.establishmentId);
  return { ok: true };
}

/** «Salir de Ajustes»: se cierra ya, sin esperar a los 2 minutos. */
export async function lockSettingsAction(input: { establishmentId: string }): Promise<void> {
  await clearElevationCookie();
  if (UUID.test(input.establishmentId)) revalidatePath(`/agents/${input.establishmentId}`, "layout");
}

/**
 * La búsqueda global del armazón no existe en la tablet (no es una cuenta): el armazón no la pinta, pero su contrato
 * pide una función de servidor. Devuelve vacío; la búsqueda de reservas es la pantalla «Buscar».
 */
export async function noSearchAction(): Promise<readonly SearchResult[]> {
  return [];
}

/**
 * «Entrar con mi cuenta» en un dispositivo que ya se desactivó: se borra su cookie (que ya no vale) y se va a entrar.
 * Sin esto, la cookie vieja seguiría diciéndole al servidor que aquí manda un dispositivo.
 */
export async function forgetDeviceAction(): Promise<void> {
  await clearDeviceCookie();
  redirect("/login");
}
