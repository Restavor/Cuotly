import { Card, EmptyState } from "@/components/ui";
import { es } from "@/i18n/es";

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

export function Conversation({
  conversationId,
  messages,
  readOnly,
}: {
  conversationId: string;
  messages: readonly ConversationMessage[];
  readOnly: boolean;
}) {
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
          <PostMessageForm conversationId={conversationId} />
        </div>
      )}
    </Card>
  );
}
