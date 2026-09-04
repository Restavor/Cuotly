"use client";

import { useActionState } from "react";

import { Button, Card, Field } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_CONVERT } from "./action-state";
import { convertConversationToRequest } from "./actions";

/**
 * §68 · elegir QUÉ mensajes van a la solicitud.
 *
 * "Los mensajes relevantes" del documento son una elección de quien pide,
 * no todo el hilo: una conversación general lleva dentro cosas que no
 * tienen nada que ver con lo que se pide ahora. Por eso hay casillas y no
 * un botón que se lo lleve todo.
 *
 * Ninguna casilla autoriza nada: la lista que llega la vuelve a filtrar
 * `convert_conversation_to_request()` contra la conversación, así que
 * mandar el identificador de un mensaje de otro hilo no lo mete en el
 * borrador.
 */
export interface ConvertibleMessage {
  readonly id: string;
  readonly body: string;
  readonly author: string;
  readonly createdAt: string;
  readonly attachments: number;
}

export function ConvertConversationForm({
  slug,
  establishmentId,
  conversationId,
  messages,
}: {
  slug: string;
  establishmentId: string;
  conversationId: string;
  messages: readonly ConvertibleMessage[];
}) {
  const [state, action, pending] = useActionState(convertConversationToRequest, INITIAL_CONVERT);

  return (
    <Card title={es.clientArea.convertChooseLabel}>
      <form action={action} className="space-y-4">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="establishmentId" value={establishmentId} />
        <input type="hidden" name="conversationId" value={conversationId} />

        <ul className="space-y-2">
          {messages.map((message) => (
            <li key={message.id}>
              <label className="flex gap-3 rounded-lg bg-soft-surface p-3">
                <input
                  type="checkbox"
                  name="messageIds"
                  value={message.id}
                  className="mt-1 h-4 w-4 accent-cuotly-green"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-text-secondary">
                    {message.author}
                    {" · "}
                    {message.createdAt}
                    {message.attachments > 0
                      ? ` · ${es.clientArea.convertAttachmentsNote(message.attachments)}`
                      : ""}
                  </span>
                  <span className="mt-1 block whitespace-pre-wrap text-text">{message.body}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <Field
          label={es.clientArea.convertContextLabel}
          name="context"
          hint={es.clientArea.convertContextHelp}
        />

        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? es.clientArea.convertPending : es.clientArea.convertSubmit}
        </Button>
      </form>
    </Card>
  );
}
