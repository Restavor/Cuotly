"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { MessageState } from "./action-state";

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
 *
 * El adjunto se engancha **después** de publicar, porque
 * `attach_file_to_message()` necesita el mensaje ya creado. Si esa segunda
 * llamada falla, el mensaje se queda publicado sin adjunto: no se puede
 * deshacer (RN-MSG-08, "los mensajes no se eliminan nunca"), así que se
 * devuelve `sent: true` con el error a la vista para que quien escribe
 * sepa exactamente qué pasó y pueda volver a mandar el archivo.
 */
export async function postMessage(
  _prev: MessageState,
  formData: FormData,
): Promise<MessageState> {
  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  // RN-MSG-09 · el adjunto llega ya subido y registrado; por aquí viaja
  // solo su identificador. Es opcional: un mensaje sin archivo es lo
  // normal.
  const attachmentFileId = String(formData.get("attachmentFileId") ?? "").trim();

  if (!body) return { error: null, sent: false };

  const supabase = await createClient();
  const minute = new Date().toISOString().slice(0, 16);
  const { data: messageId, error } = await supabase.rpc("post_message", {
    p_conversation_id: conversationId,
    p_body: body,
    p_idempotency_key: `ui:${minute}:${body.slice(0, 64)}`,
  });

  if (error) return { error: error.message, sent: false };

  if (attachmentFileId && messageId) {
    // `attach_file_to_message()` comprueba tres cosas que esta capa no
    // puede: que el mensaje sea tuyo, que puedas ver ese archivo
    // (`can_read_file()`) y que el archivo sea del mismo establecimiento
    // que la conversación. Si dice que no, el mensaje ya está publicado y
    // RN-MSG-08 prohíbe borrarlo: se cuenta que el adjunto no se enganchó
    // en vez de fingir que todo fue bien.
    const { error: fallo } = await supabase.rpc("attach_file_to_message", {
      p_message_id: messageId,
      p_file_id: attachmentFileId,
    });

    if (fallo) {
      revalidatePath("/espacios", "layout");
      return { error: fallo.message, sent: true };
    }
  }

  revalidatePath("/espacios", "layout");
  return { error: null, sent: true };
}
