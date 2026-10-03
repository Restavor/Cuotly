/**
 * `src/services/agents/device.ts` · la tablet del local, del lado del servidor
 * (EQU-02, RN-APP-08; PRD de agents §3.3).
 *
 * Qué dispositivo es el que pide esta página (cookie `httpOnly`, solo su hash en la base), si sigue
 * activo, y quién tiene abiertos los Ajustes (cookie firmada, dos minutos sin tocar). Nada de esto
 * autoriza una acción por sí solo: una acción de la tablet entra por `reservation_device_act`, que lo
 * vuelve a comprobar todo en la base de datos.
 *
 * Con una cookie de dispositivo válida **manda el dispositivo**: se ignora la sesión personal (para usarla,
 * primero se desactiva el dispositivo).
 */
import { cookies } from "next/headers";
import { cache } from "react";

import {
  DEVICE_COOKIE,
  ELEVATION_COOKIE,
  elevationSecondsLeft,
  isElevationLive,
  newElevation,
  type DeviceRole,
} from "@/core/reservations/device";
import { createAdminClient } from "@/lib/supabase/admin";

import { createDeviceClient } from "./device-client";
import { hashDeviceToken, isDeviceToken, readElevation, signElevation } from "./pin";

export { DEVICE_COOKIE, ELEVATION_COOKIE };

/** Una cookie de dispositivo dura lo que el navegador deje (400 días): la tablet no se vuelve a activar cada semana. */
const DEVICE_COOKIE_SECONDS = 400 * 24 * 60 * 60;

const COOKIE_BASE = { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" } as const;

export type DeviceState =
  /** Este navegador no es una tablet del local. */
  | { readonly kind: "none" }
  /** Trae la cookie de un dispositivo que ya no existe o se desactivó. */
  | { readonly kind: "revoked" }
  | {
      readonly kind: "active";
      readonly deviceId: string;
      readonly establishmentId: string;
      readonly name: string;
      readonly tokenHash: string;
    };

/** El dispositivo de esta petición. Una sola consulta por petición (la comparten el armazón y las pantallas). */
export const loadDevice = cache(async (): Promise<DeviceState> => {
  const jar = await cookies();
  const token = jar.get(DEVICE_COOKIE)?.value;
  if (!isDeviceToken(token)) return token === undefined ? { kind: "none" } : { kind: "revoked" };
  const tokenHash = hashDeviceToken(token);
  try {
    const { data, error } = await createAdminClient().rpc("reservation_device_resolve", { p_token_hash: tokenHash });
    if (error) return { kind: "none" };
    const value = (data ?? {}) as Record<string, unknown>;
    if (value.outcome !== "ok" || typeof value.device_id !== "string" || typeof value.establishment_id !== "string") {
      return { kind: "revoked" };
    }
    return {
      kind: "active",
      deviceId: value.device_id,
      establishmentId: value.establishment_id,
      name: typeof value.name === "string" ? value.name : "",
      tokenHash,
    };
  } catch {
    // No se ha podido mirar: ni se trata como tablet (se le dejaría actuar) ni como desactivada (se le borraría).
    return { kind: "none" };
  }
});

/** ¿Hay una cookie de dispositivo, valga o no? Para saber si tiene sentido preguntar. */
export async function hasDeviceCookie(): Promise<boolean> {
  return (await cookies()).has(DEVICE_COOKIE);
}

export interface DeviceElevation {
  readonly staffId: string;
  readonly role: Extract<DeviceRole, "manager" | "owner">;
  readonly name: string;
  readonly secondsLeft: number;
}

/**
 * Quién tiene abiertos los Ajustes en esta tablet, o `null`. Se lee la cookie firmada, se comprueba que
 * no ha caducado ni es de otro restaurante y se vuelve a preguntar a la base de datos que esa persona
 * siga siendo Encargado o Propietario: un PIN que se quita deja de valer en ese momento, y los Ajustes
 * que abrió también.
 */
export const loadElevation = cache(async (): Promise<DeviceElevation | null> => {
  const device = await loadDevice();
  if (device.kind !== "active") return null;
  const jar = await cookies();
  const payload = readElevation(jar.get(ELEVATION_COOKIE)?.value);
  if (payload === null || !isElevationLive(payload, device.establishmentId, Date.now())) return null;
  try {
    const { data, error } = await createAdminClient().rpc("reservation_device_vouch", {
      p_establishment_id: device.establishmentId,
      p_staff_id: payload.staffId,
    });
    if (error) return null;
    const value = (data ?? {}) as Record<string, unknown>;
    if (value.outcome !== "ok" || (value.role !== "manager" && value.role !== "owner")) return null;
    return {
      staffId: payload.staffId,
      role: value.role,
      name: typeof value.name === "string" ? value.name : "",
      secondsLeft: elevationSecondsLeft(payload, Date.now()),
    };
  } catch {
    return null;
  }
});

/** Pone (o renueva) la cookie de «Ajustes abiertos»: dos minutos desde ahora. Solo en acciones y rutas, no al pintar. */
export async function setElevationCookie(staffId: string, establishmentId: string): Promise<void> {
  const jar = await cookies();
  jar.set(ELEVATION_COOKIE, signElevation(newElevation(staffId, establishmentId, Date.now())), { ...COOKIE_BASE, maxAge: 120 });
}

/** «Ajustes abiertos con PIN» se renueva con cada cosa que se guarda: son 2 minutos sin tocar, no 2 minutos en total. */
export async function renewElevation(establishmentId: string): Promise<void> {
  const elevation = await loadElevation();
  if (elevation !== null) await setElevationCookie(elevation.staffId, establishmentId);
}

export async function clearElevationCookie(): Promise<void> {
  (await cookies()).delete(ELEVATION_COOKIE);
}

export async function setDeviceCookie(token: string): Promise<void> {
  (await cookies()).set(DEVICE_COOKIE, token, { ...COOKIE_BASE, maxAge: DEVICE_COOKIE_SECONDS });
}

export async function clearDeviceCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(DEVICE_COOKIE);
  jar.delete(ELEVATION_COOKIE);
}

/** El cliente de la tablet para esta petición, con la persona que la acompaña (PIN tecleado ahora o «Ajustes abiertos»). */
export function deviceClientFor(
  device: Extract<DeviceState, { kind: "active" }>,
  who: { readonly pinHmac: string | null; readonly staffId: string | null },
) {
  return createDeviceClient(createAdminClient(), {
    tokenHash: device.tokenHash,
    establishmentId: device.establishmentId,
    pinHmac: who.pinHmac,
    staffId: who.staffId,
  });
}
