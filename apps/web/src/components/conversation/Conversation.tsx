import { Card, EmptyState } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { canEditMessage, resolveAuthorLabel } from "@/core/messages";
import { instanteRelativo } from "@/i18n/dates";
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
  timeZone,
  bare = false,
}: {
  conversationId: string;
  establishmentId: string;
  /**
   * La zona del espacio (CLAUDE.md). La hora de un mensaje es la del
   * espacio, no la del servidor: quien escribe y quien lee tienen que ver
   * la misma.
   */
  timeZone: string;
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
  /**
   * Sin tarjeta ni título: para la bandeja global (G07, G08), que ya pinta
   * su propia cabecera encima de la conversación.
   */
  bare?: boolean;
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

  const contenido = (
    <>
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
            const firma = authorLabel(message);
            const adjuntos = attachmentsByMessage.get(message.id) ?? [];

            return (
              <li key={message.id}>
                {message.id === firstUnreadId ? (
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cuotly-green">
                    {es.space.messages.unreadSeparator}
                  </p>
                ) : null}

                {/*
                  Las burbujas del diseño: lo propio a la derecha en verde,
                  lo de los demás a la izquierda con su inicial. La del
                  equipo de mantenimiento, cuando quien mira es el
                  restaurante, es un edificio y no la cara de nadie (P7).
                */}
                <div className={`flex items-start gap-3 ${message.isMine ? "flex-row-reverse" : ""}`}>
                  {message.isMine ? null : (
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-soft-surface text-sm font-semibold text-primary-dark"
                    >
                      {message.senderDisplay === "maintenance_team" ? (
                        <Icon name="building" className="h-5 w-5" />
                      ) : (
                        (firma.trim()[0] ?? "·").toUpperCase()
                      )}
                    </span>
                  )}
                  <div className={`flex min-w-0 max-w-[85%] flex-col ${message.isMine ? "items-end" : "items-start"}`}>
                    <p className="text-xs text-text-secondary">
                      <span className="font-semibold text-text">{firma}</span>
                      {" · "}
                      {instanteRelativo(message.createdAt, timeZone, now, (hora) => hora)}
                      {message.editCount > 0 ? ` · ${es.clientArea.edited}` : ""}
                    </p>
                    <div
                      className={`mt-1 rounded-[12px] px-3.5 py-2.5 ${
                        message.isMine ? "bg-cuotly-green/10" : "border border-border bg-surface"
                      }`}
                    >
                      <p className="whitespace-pre-wrap text-sm text-text">{message.body}</p>
                      {adjuntos.length > 0 ? (
                        <ul className="mt-2 space-y-1.5">
                          {adjuntos.map((file) => (
                            <li key={file.id}>
                              {/* RN-ARC-08: el enlace no apunta al objeto sino a una
                                  ruta que comprueba el permiso y firma una URL de
                                  unos minutos. */}
                              <a
                                href={`/api/archivos/${file.id}`}
                                className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-text hover:bg-soft-surface"
                              >
                                <Icon name="document" className="h-5 w-5 shrink-0 text-danger" />
                                <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
                                <Icon name="download" className="h-4 w-4 shrink-0 text-text-secondary" />
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    {editable ? <EditMessageForm messageId={message.id} body={message.body} /> : null}
                  </div>
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
    </>
  );

  return bare ? <div>{contenido}</div> : <Card title={title ?? es.clientArea.conversationTitle}>{contenido}</Card>;
}
