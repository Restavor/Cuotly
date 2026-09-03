import { Card, EmptyState } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

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
 */
export interface ConversationMessage {
  readonly id: string;
  readonly body: string;
  readonly senderDisplay: string;
  readonly senderName: string | null;
  readonly createdAt: string;
  readonly editCount: number;
  readonly isMine: boolean;
}

function authorLabel(message: ConversationMessage): string {
  if (message.isMine) return es.clientArea.you;
  if (message.senderDisplay === "maintenance_team") return es.clientArea.maintenanceTeam;
  return message.senderName ?? es.clientArea.maintenanceTeam;
}

export async function Conversation({
  conversationId,
  establishmentId,
  messages,
  readOnly,
}: {
  conversationId: string;
  establishmentId: string;
  messages: readonly ConversationMessage[];
  readOnly: boolean;
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

  return (
    <Card title={es.clientArea.conversationTitle}>
      {messages.length === 0 ? (
        <EmptyState
          title={es.clientArea.conversationEmptyTitle}
          description={es.clientArea.conversationEmptyReason}
        />
      ) : (
        <ul className="space-y-4">
          {messages.map((message) => (
            <li key={message.id} className="rounded-lg bg-soft-surface p-3">
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
            </li>
          ))}
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
