import { Card, EmptyState } from "@/components/ui";
import { canEditMessage, resolveAuthorLabel } from "@/core/messages";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { EditMessageForm } from "./EditMessageForm";
import { PostMessageForm } from "./PostMessageForm";

/**
 * Una conversación, tal como la ve quien la abre (§66, RN-MSG).
 *
 * Quién aparece como autor no lo decide esta pantalla: lo decide
 * `list_conversation_messages()` en el servidor. Al equipo le devuelve la
 * persona; al restaurante, "Equipo de mantenimiento" y `sender_id` en
 * null. La columna `sender_id` ni siquiera es legible con un SELECT
 * normal, así que no hay forma de que este componente enseñe la identidad
 * individual de nadie del equipo aunque quisiera (CLAUDE.md MUST NOT).
 *
 * `sender_display` llega como identificador ('client', 'person',
 * 'maintenance_team'), nunca como texto: los literales viven en i18n.
 *
 * Este componente lo montan las cuatro pantallas que enseñan una
 * conversación —las dos de solicitud, la interna de trabajo y la general
 * del restaurante—, y todas le pasan lo que carga `loadConversation()`.
 * Es a propósito: es el único sitio donde se decide qué se enseña de un
 * mensaje, así que las cuatro no pueden divergir.
 */
export interface ConversationMessage {
  readonly id: string;
  readonly body: string;
  readonly senderDisplay: string;
  readonly senderName: string | null;
  readonly createdAt: string;
  readonly editCount: number;
  readonly isMine: boolean;
  /** RN-MSG-06 · lo calcula el servidor: escrito por otra persona después de tu última lectura. */
  readonly isUnread: boolean;
}

/**
 * Las dos identidades que `canEditMessage()` necesita comparar. No son
 * identificadores de nadie: la comparación de verdad —`sender_id` contra
 * `auth.uid()`— la hace `edit_message()` en el servidor, y aquí solo se
 * traduce lo que el servidor ya contestó en `is_mine`.
 */
const YO = "self";
const OTRA_PERSONA = "other";

/**
 * RN-MSG-02 · quién firma cada mensaje. La decisión es de
 * `resolveAuthorLabel()` (src/core/messages.ts), que la toma sin depender
 * de React ni de Supabase y tiene sus propios tests; aquí solo se traduce
 * la clave que devuelve al literal en español.
 */
function authorLabel(message: ConversationMessage): string {
  switch (
    resolveAuthorLabel({
      isMine: message.isMine,
      senderDisplay: message.senderDisplay,
      hasResolvedName: message.senderName !== null,
    })
  ) {
    case "you":
      return es.clientArea.you;
    case "person":
      return message.senderName ?? es.clientArea.maintenanceTeam;
    case "establishment":
      return es.space.messages.establishmentSide;
    case "maintenance_team":
      return es.clientArea.maintenanceTeam;
  }
}

export async function Conversation({
  conversationId,
  establishmentId,
  messages,
  readOnly,
  title,
  notice,
  emptyTitle,
  emptyReason,
}: {
  conversationId: string;
  establishmentId: string;
  messages: readonly ConversationMessage[];
  readOnly: boolean;
  /**
   * Qué conversación es. La de una solicitud no necesita decirlo —la
   * pantalla entera va de esa solicitud—, pero la interna de un trabajo y
   * la general de un restaurante SÍ: quien escribe tiene que saber en
   * cuál de las dos está antes de escribir (RN-MSG-04).
   */
  title?: string;
  notice?: string;
  emptyTitle?: string;
  emptyReason?: string;
}) {
  // RN-MSG-09 · los adjuntos de estos mensajes. Se piden aquí y no en cada
  // pantalla que monta una conversación para que las dos —la del equipo y
  // la del restaurante— enseñen exactamente lo mismo y no puedan
  // divergir.
  //
  // Quién ve qué lo deciden las políticas: `file_links` y `files` se
  // filtran con `can_read_file()`, así que un adjunto que no corresponda
  // sencillamente no vuelve. Las columnas se enumeran porque las dos
  // tablas tienen privilegios de columna y `select *` daría 403.
  const supabase = await createClient();
  const messageIds = messages.map((message) => message.id);

  const { data: links } = messageIds.length
    ? await supabase
        .from("file_links")
        .select("file_id, entity_id")
        .eq("entity_type", "message")
        .in("entity_id", messageIds)
    : { data: [] };

  const fileIds = [...new Set((links ?? []).map((link) => link.file_id))];
  const { data: files } = fileIds.length
    ? await supabase.from("files").select("id, name").in("id", fileIds)
    : { data: [] };

  const fileById = new Map((files ?? []).map((file) => [file.id, file]));
  const attachmentsByMessage = new Map<string, { id: string; name: string }[]>();
  for (const link of links ?? []) {
    const file = fileById.get(link.file_id);
    if (!file) continue;
    attachmentsByMessage.set(link.entity_id, [
      ...(attachmentsByMessage.get(link.entity_id) ?? []),
      { id: file.id, name: file.name },
    ]);
  }

  // RN-MSG-06 · dónde va la marca "Mensajes nuevos": justo antes del
  // primero que llegó sin leer. Los mensajes vienen ordenados por fecha,
  // así que es el primero con `isUnread`.
  const firstUnreadId = messages.find((message) => message.isUnread)?.id ?? null;

  const now = new Date();

  return (
    <Card title={title ?? es.clientArea.conversationTitle}>
      {notice ? (
        <p className="mb-4 rounded-lg border border-border bg-soft-surface p-3 text-sm text-text-secondary">
          {notice}
        </p>
      ) : null}

      {messages.length === 0 ? (
        <EmptyState
          title={emptyTitle ?? es.clientArea.conversationEmptyTitle}
          description={emptyReason ?? es.clientArea.conversationEmptyReason}
        />
      ) : (
        <ul className="space-y-4">
          {messages.map((message) => {
            // RN-MSG-07 · el mismo cálculo que hace `edit_message()`. No
            // autoriza nada: se adelanta a la decisión del servidor, que
            // vuelve a tomarla al ejecutar.
            //
            // La autoría la ha contestado ya el servidor con `is_mine`
            // —esta pantalla no recibe `sender_id` cuando quien mira es
            // el restaurante—, así que a `canEditMessage()` se le pasa esa
            // respuesta como identidad y lo que comprueba de verdad es lo
            // que falta: la ventana de 10 minutos y el cierre de la
            // conversación.
            const autor = message.isMine ? YO : OTRA_PERSONA;
            const editable = canEditMessage({
              message: { senderId: autor, createdAt: new Date(message.createdAt) },
              actorId: YO,
              now,
              conversationIsReadOnly: readOnly,
            }).ok;

            return (
              <li key={message.id}>
                {message.id === firstUnreadId ? (
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cuotly-green">
                    {es.space.messages.unreadSeparator}
                  </p>
                ) : null}

                <div className="rounded-lg bg-soft-surface p-3">
                  <p className="text-xs font-semibold text-text-secondary">
                    {authorLabel(message)}
                    {" · "}
                    {new Intl.DateTimeFormat("es-ES", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(message.createdAt))}
                    {message.editCount > 0 ? ` · ${es.clientArea.edited}` : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-text">{message.body}</p>
                  {(attachmentsByMessage.get(message.id) ?? []).length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm">
                      {(attachmentsByMessage.get(message.id) ?? []).map((file) => (
                        <li key={file.id}>
                          {/* RN-ARC-08: el enlace no apunta al objeto sino a una
                              ruta que comprueba el permiso y firma una URL de
                              unos minutos. */}
                          <a href={`/api/archivos/${file.id}`} className="text-cuotly-green underline">
                            {file.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {editable ? <EditMessageForm messageId={message.id} body={message.body} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {readOnly ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-4 text-center">
          <p className="font-semibold text-text">{es.clientArea.conversationClosedTitle}</p>
          <p className="mt-1 text-sm text-text-secondary">
            {es.clientArea.conversationClosedReason}
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <PostMessageForm conversationId={conversationId} establishmentId={establishmentId} />
        </div>
      )}
    </Card>
  );
}
