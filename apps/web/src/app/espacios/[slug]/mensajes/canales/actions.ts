"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import type { ChannelState } from "./action-state";

/**
 * §38, RN-CAN · las acciones de los canales internos.
 *
 * Ninguna decide nada. `create_channel()`, `add_channel_member()`,
 * `remove_channel_member()` y `archive_channel()` exigen `manage_space`
 * por su cuenta, y la de añadir comprueba además que quien entra sea del
 * equipo del espacio (RN-CAN-02: el cliente no entra en un canal, nunca).
 */
async function run(
  llamada: (
    supabase: Awaited<ReturnType<typeof createClient>>,
  ) => PromiseLike<{ error: { message: string } | null }>,
): Promise<ChannelState> {
  try {
    const supabase = await createClient();
    const { error } = await llamada(supabase);
    if (error) return { error: error.message, done: false };
    revalidatePath("/espacios", "layout");
    return { error: null, done: true };
  } catch (fallo) {
    console.error("[canales] la llamada falló", { message: String(fallo) });
    return { error: es.states.errorDescription, done: false };
  }
}

export async function createChannel(
  _prev: ChannelState,
  formData: FormData,
): Promise<ChannelState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!name) return { error: es.teamArea.channels.nameRequired, done: false };

  return run((s) => s.rpc("create_channel", { p_space_id: spaceId, p_name: name }));
}

export async function addChannelMember(
  _prev: ChannelState,
  formData: FormData,
): Promise<ChannelState> {
  const conversationId = String(formData.get("conversationId") ?? "");
  const userId = String(formData.get("userId") ?? "");

  if (!userId) return { error: es.teamArea.channels.memberRequired, done: false };

  return run((s) =>
    s.rpc("add_channel_member", { p_conversation_id: conversationId, p_user_id: userId }),
  );
}

export async function removeChannelMember(
  _prev: ChannelState,
  formData: FormData,
): Promise<ChannelState> {
  const conversationId = String(formData.get("conversationId") ?? "");
  const userId = String(formData.get("userId") ?? "");

  return run((s) =>
    s.rpc("remove_channel_member", { p_conversation_id: conversationId, p_user_id: userId }),
  );
}

/** RN-CAN-05 · se archiva, no se borra. Y se desarchiva. */
export async function setChannelArchived(
  _prev: ChannelState,
  formData: FormData,
): Promise<ChannelState> {
  const conversationId = String(formData.get("conversationId") ?? "");
  const archived = String(formData.get("archived") ?? "") === "true";

  return run((s) =>
    s.rpc("archive_channel", { p_conversation_id: conversationId, p_archived: archived }),
  );
}
