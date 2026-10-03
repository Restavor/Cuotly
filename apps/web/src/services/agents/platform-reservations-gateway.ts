/**
 * `src/services/agents/platform-reservations-gateway.ts` · la parte de Reservas del panel de Administración
 * (Fase E2; PRD de agents §11.3): qué espacios ofrecen Reservas, y las tarifas de mensajería. Solo la
 * plataforma. Aquí no se autoriza nada: `platform_reservations_spaces()` y `set_messaging_rate()` comprueban
 * quién llama (`is_platform_member()` y `is_platform_owner()`, con el segundo paso).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export interface PlatformReservationsSpace {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly reservationsEnabled: boolean;
}

export async function listReservationsSpaces(client: Client): Promise<readonly PlatformReservationsSpace[]> {
  const { data, error } = await client.rpc("platform_reservations_spaces");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ id: row.space_id, name: row.name, slug: row.slug, reservationsEnabled: row.reservations_enabled }));
}

export async function setSpaceReservationsEnabled(client: Client, spaceId: string, enabled: boolean): Promise<void> {
  const { error } = await client.rpc("set_space_reservations_enabled", { p_space_id: spaceId, p_enabled: enabled });
  if (error) throw new Error(error.message);
}

export interface MessagingRate {
  readonly id: string;
  readonly channel: "whatsapp_utility" | "sms";
  readonly country: string;
  readonly priceMicros: number;
  readonly validFrom: string;
}

export async function listMessagingRates(client: Client): Promise<readonly MessagingRate[]> {
  const { data, error } = await client
    .from("messaging_rates")
    .select("id, channel, country, price_micros, valid_from")
    .order("valid_from", { ascending: false })
    .order("channel", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((row) =>
    row.channel === "whatsapp_utility" || row.channel === "sms"
      ? [{ id: row.id, channel: row.channel, country: row.country, priceMicros: row.price_micros, validFrom: row.valid_from } satisfies MessagingRate]
      : [],
  );
}

export async function setMessagingRate(
  client: Client,
  input: { channel: string; country: string; priceMicros: number; validFrom: string },
): Promise<void> {
  const { error } = await client.rpc("set_messaging_rate", {
    p_channel: input.channel,
    p_country: input.country,
    p_price_micros: input.priceMicros,
    p_valid_from: input.validFrom,
  });
  if (error) throw new Error(error.message);
}
