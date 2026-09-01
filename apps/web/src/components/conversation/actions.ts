"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type MessageState = { error: string | null; sent: boolean };

export const INITIAL_MESSAGE: MessageState = { error: null, sent: false };

/**
 * Publicar un mensaje (HU-13, HU-35).
 *
 * El rol con el que se publica —equipo o restaurante— lo decide
 * `post_message()` mirando quién llama, no este formulario: si lo decidiera
 * el navegador, un cliente podría publicar un mensaje que se presentara
 * como del equipo de mantenimiento.
 *
 * La clave de idempotencia la compone el servidor con el texto y el
 * minuto: pulsar dos veces no publica dos mensajes, y RN-MSG-08 prohíbe
 * borrar el duplicado si se colara.
 */
export async function postMessage(
  _prev: MessageState,
  formData: FormData,
): Promise<MessageState> {
  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!body) return { error: null, sent: false };

  const supabase = await createClient();
  const minute = new Date().toISOString().slice(0, 16);
  const { error } = await supabase.rpc("post_message", {
    p_conversation_id: conversationId,
    p_body: body,
    p_idempotency_key: `ui:${minute}:${body.slice(0, 64)}`,
  });

  if (error) return { error: error.message, sent: false };

  revalidatePath("/espacios", "layout");
  return { error: null, sent: true };
}
