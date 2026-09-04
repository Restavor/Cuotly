import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import type { ConversationMessage } from "./Conversation";

/**
 * Cargar una conversación para pintarla (§66, RN-MSG-02, RN-MSG-06,
 * RN-MSG-07).
 *
 * Por qué vive aquí y no en cada pantalla. Esto mismo estaba copiado en
 * las dos pantallas de solicitud —la del equipo y la del restaurante— y
 * la bandeja de §66.2 traía la tercera y la cuarta. Cuatro copias de
 * "quién aparece como autor, qué está sin leer y hasta cuándo se puede
 * editar" son cuatro sitios donde una puede quedarse atrás; y en esta
 * función concreta, quedarse atrás significa enseñar la identidad de
 * alguien del equipo a un restaurante (CLAUDE.md MUST NOT).
 *
 * Ninguna decisión de permisos se toma aquí. `list_conversation_messages()`
 * es la que decide qué devuelve según quién pregunta: al equipo la
 * persona, al restaurante `sender_display = 'maintenance_team'` y
 * `sender_id` en null. Esta función solo traduce identificadores a nombres
 * para los que ya vinieron con identidad.
 */
export async function loadConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string,
): Promise<{ messages: ConversationMessage[]; readOnly: boolean }> {
  const [{ data: rows }, { data: closed }] = await Promise.all([
    supabase.rpc("list_conversation_messages", { p_conversation_id: conversationId }),
    supabase.rpc("conversation_is_read_only", { p_conversation_id: conversationId }),
  ]);

  // Solo se resuelven los nombres de los mensajes que YA traían
  // `sender_id`. Cuando quien mira es el restaurante no viene ninguno, así
  // que esta consulta ni se hace: no hay ningún camino por el que un
  // cliente acabe pidiendo un perfil del equipo.
  const authorIds = (rows ?? [])
    .map((row) => row.sender_id)
    .filter((value): value is string => value !== null);

  const { data: people } = authorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", authorIds)
    : { data: [] };

  const personName = new Map((people ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]));

  const messages: ConversationMessage[] = (rows ?? []).map((row) => ({
    id: row.id,
    body: row.body,
    senderDisplay: row.sender_display,
    senderName: row.sender_id ? (personName.get(row.sender_id) ?? null) : null,
    createdAt: row.created_at,
    editCount: row.edit_count,
    // RN-MSG-02 · "es tuyo" lo contesta el servidor (`is_mine`), no se
    // deduce comparando `sender_id`: al restaurante esa columna le llega
    // en null SIEMPRE, también en sus propios mensajes, así que la
    // comparación daba falso para todos y sus mensajes acababan firmados
    // como "Equipo de mantenimiento". Ver la migración 20260904000050.
    isMine: row.is_mine,
    isUnread: row.is_unread,
  }));

  // RN-MSG-06 · se marca leído DESPUÉS de haber leído las filas, no antes:
  // al revés, el separador de "Mensajes nuevos" no aparecería nunca en la
  // carga en la que llegan los mensajes nuevos, que es justo la carga en
  // la que hace falta.
  await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });

  return { messages, readOnly: Boolean(closed) };
}
