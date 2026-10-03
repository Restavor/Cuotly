"use server";

import { revalidatePath } from "next/cache";

import { parseEurosToMicros } from "@/core/agents/balance";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { setMessagingRate, setSpaceReservationsEnabled } from "@/services/agents/platform-reservations-gateway";

import type { AdminActionState } from "../action-state";

/**
 * Lo que Administración hace con Reservas (PRD de agents §11.3): encender o apagar Reservas en un espacio y cambiar las
 * tarifas de mensajería. Ninguna autoriza nada: `set_space_reservations_enabled()` y `set_messaging_rate()` exigen
 * `is_platform_owner()` (Bosco, con el segundo paso hecho); aquí se traduce lo que contestan a un mensaje.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function failure(error: unknown): AdminActionState {
  const t = es.agents.platform;
  const text = error instanceof Error ? error.message : "";
  if (/Solo Restavor web/i.test(text)) return { error: t.notAllowed, done: false };
  if (/Ya hay una tarifa/i.test(text)) return { error: t.rateDuplicate, done: false };
  if (/desde hoy/i.test(text)) return { error: t.ratePast, done: false };
  return { error: t.failed, done: false };
}

export async function setReservationsEnabledAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!UUID.test(spaceId)) return { error: es.agents.platform.failed, done: false };
  try {
    await setSpaceReservationsEnabled(await createClient(), spaceId, enabled);
    revalidatePath("/administracion/reservas");
    return { error: null, done: true };
  } catch (error) {
    return failure(error);
  }
}

export async function setMessagingRateAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const t = es.agents.platform;
  const channel = String(formData.get("channel") ?? "");
  const country = String(formData.get("country") ?? "").trim().toUpperCase();
  const validFrom = String(formData.get("validFrom") ?? "");
  const price = parseEurosToMicros(String(formData.get("price") ?? ""));
  if (channel !== "whatsapp_utility" && channel !== "sms") return { error: t.failed, done: false };
  if (!/^[A-Z]{2}$/.test(country)) return { error: t.countryInvalid, done: false };
  if (!DATE.test(validFrom)) return { error: t.dateInvalid, done: false };
  if (!price.ok) return { error: t.priceInvalid, done: false };
  try {
    await setMessagingRate(await createClient(), { channel, country, priceMicros: price.micros, validFrom });
    revalidatePath("/administracion/reservas");
    return { error: null, done: true };
  } catch (error) {
    return failure(error);
  }
}
