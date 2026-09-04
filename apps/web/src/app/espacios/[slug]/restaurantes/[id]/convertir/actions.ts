"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import type { ConvertState } from "./action-state";

/**
 * §68 · RN-MSG-10 — "Convertir en solicitud".
 *
 * Lo hace entero `convert_conversation_to_request()`: comprueba que la
 * conversación sea la general del restaurante (§66.3, la interna del
 * equipo no se convierte), que quien pulsa pueda leerla, pega los mensajes
 * señalados en el orden en que se escribieron y arrastra sus adjuntos. El
 * permiso de escribir lo vuelve a comprobar `create_request_draft()` por
 * dentro, así que el rol Consulta (RN-MSG-05) recibe un error aunque llame
 * a esta acción a mano.
 *
 * Lo que crea es un BORRADOR, y por eso esto termina en un `redirect` a la
 * pantalla de revisión en vez de en un "listo": §68 exige repasar alcance,
 * destinatario y archivos ANTES de enviar, y el contador de primera
 * atención no arranca hasta que se envía (RN-SLA-01).
 */
export async function convertConversationToRequest(
  _prev: ConvertState,
  formData: FormData,
): Promise<ConvertState> {
  const slug = String(formData.get("slug") ?? "");
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const conversationId = String(formData.get("conversationId") ?? "");
  const context = String(formData.get("context") ?? "").trim();
  const messageIds = formData.getAll("messageIds").map(String).filter(Boolean);

  if (messageIds.length === 0) {
    return { error: es.clientArea.convertValidationRequired };
  }

  const supabase = await createClient();
  const { data: requestId, error } = await supabase.rpc("convert_conversation_to_request", {
    p_conversation_id: conversationId,
    p_message_ids: messageIds,
    p_context: context || undefined,
  });

  if (error || !requestId) {
    return { error: error?.message ?? es.states.errorDescription };
  }

  revalidatePath("/espacios", "layout");
  redirect(`/espacios/${slug}/restaurantes/${establishmentId}/solicitudes/${requestId}/borrador`);
}
