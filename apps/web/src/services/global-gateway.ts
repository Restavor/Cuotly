/**
 * `src/services/global-gateway.ts` — la mitad de Supabase del contexto
 * global (PRD §36, RN-GLO; migración 98).
 *
 * Aquí no se decide nada, y menos que en ningún otro sitio: RN-GLO-01 dice
 * que el contexto global **no trae ninguna capacidad nueva**, así que las
 * tres funciones que hay detrás se apoyan en las políticas de siempre
 * —`can_read_conversation()`, `is_space_member()`,
 * `is_establishment_client()`— y esto solo traduce lo que devuelven.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;
type Functions = Database["public"]["Functions"];

async function rpc<F extends keyof Functions>(
  client: Client,
  fn: F,
  args: Functions[F]["Args"],
): Promise<Functions[F]["Returns"]> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as Functions[F]["Returns"];
}

export type ContextRow = Functions["my_contexts"]["Returns"][number];
export type GlobalConversationRow = Functions["list_my_conversations"]["Returns"][number];
export type ClientAttentionRow = Functions["my_client_attention"]["Returns"][number];
export type NotificationPreferenceRow =
  Functions["my_notification_preferences"]["Returns"][number];

/** RN-GLO-03 · mis espacios y mis paneles de restaurante, de una vez. */
export function myContexts(client: Client): Promise<readonly ContextRow[]> {
  return rpc(client, "my_contexts", undefined as never);
}

/** RN-GLO-05 · las conversaciones de todos mis contextos. */
export function myConversations(client: Client): Promise<readonly GlobalConversationRow[]> {
  return rpc(client, "list_my_conversations", undefined as never);
}

/** RN-GLO-02 · lo que espera al restaurante, en todos sus restaurantes. */
export function myClientAttention(client: Client): Promise<readonly ClientAttentionRow[]> {
  return rpc(client, "my_client_attention", undefined as never);
}

/** RN-GLO-06 · las preferencias de aviso que esta persona ha tocado. */
export function myNotificationPreferences(
  client: Client,
): Promise<readonly NotificationPreferenceRow[]> {
  return rpc(client, "my_notification_preferences", undefined as never);
}
