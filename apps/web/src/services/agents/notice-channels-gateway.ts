/**
 * `src/services/agents/notice-channels-gateway.ts` · la mitad de Supabase de «Avisos a tus clientes» (Fase F; PRD de
 * agents §3.2, §6.11 y §8.6; decisiones 151 y 152).
 *
 * Aquí no se decide quién puede cambiar nada: lo dice `set_notice_channels()` en la base de datos (Propietario,
 * Encargado, Restavor y el soporte dentro de su sesión; nunca la tablet del local). Esto solo lee los tres interruptores
 * y llama a la función.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChannelSwitches } from "@/core/reservations/notices";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/** Cómo están los tres interruptores de un restaurante, o `null` si no se pudo leer (no es lo mismo que «apagados»). */
export async function loadNoticeChannels(client: Client, establishmentId: string): Promise<ChannelSwitches | null> {
  const { data, error } = await client
    .from("reservation_settings")
    .select("notify_email, notify_whatsapp, notify_sms")
    .eq("establishment_id", establishmentId)
    .maybeSingle();
  if (error || !data) return null;
  return { email: data.notify_email, whatsapp: data.notify_whatsapp, sms: data.notify_sms };
}

export async function saveNoticeChannels(client: Client, establishmentId: string, channels: ChannelSwitches): Promise<void> {
  const { error } = await client.rpc("set_notice_channels", {
    p_establishment_id: establishmentId,
    p_email: channels.email,
    p_whatsapp: channels.whatsapp,
    p_sms: channels.sms,
  });
  if (error) throw new Error(error.message);
}
