import type { SupabaseClient } from "@supabase/supabase-js";

import { encodeDeviceAuthFailure, isPin } from "@/core/reservations/device";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { deviceClientFor, loadDevice, loadElevation } from "@/services/agents/device";
import { pinHmac } from "@/services/agents/pin";

/**
 * El cliente de Supabase con el que Restavor agents lee y escribe en un restaurante.
 *
 * - **Una persona con cuenta** (Propietario, Encargado o soporte en sesión): su propio cliente, con su
 *   sesión. Es RLS y las funciones de la base de datos quienes deciden qué puede.
 * - **Una tablet del local** (cookie de dispositivo válida): manda el dispositivo y se ignora la sesión
 *   personal. Las lecturas van acotadas a SU restaurante y las escrituras entran por la puerta de la
 *   tablet, que valida el PIN. `pin` es el que se acaba de teclear para ESTA acción (PRD §3.3: cada
 *   acción que cambia algo pide «¿Quién eres?»); sin él, la persona de «Ajustes abiertos», si la hay.
 *
 * Una tablet nunca opera en un restaurante que no es el suyo, aunque la dirección diga otro.
 */
export async function agentsDb(
  establishmentId: string,
  options: { readonly pin?: string | null } = {},
): Promise<SupabaseClient<Database>> {
  const device = await loadDevice();
  if (device.kind !== "active") return createClient();

  if (device.establishmentId !== establishmentId) {
    throw new Error("No tienes permiso para manejar las reservas de este restaurante");
  }

  const typed = options.pin ?? null;
  if (typed !== null && typed !== "") {
    // Un PIN que no son 4 cifras ni se prueba: no gasta un intento del bloqueo.
    if (!isPin(typed)) throw new Error(encodeDeviceAuthFailure({ code: "wrong_pin" }));
    return deviceClientFor(device, { pinHmac: pinHmac(typed), staffId: null });
  }
  const elevation = await loadElevation();
  return deviceClientFor(device, { pinHmac: null, staffId: elevation?.staffId ?? null });
}
