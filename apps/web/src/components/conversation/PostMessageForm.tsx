"use client";

import { useActionState } from "react";

import { FileUploadField } from "@/components/FileUploadField";
import { Button } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_MESSAGE } from "./action-state";
import { postMessage } from "./actions";

/**
 * La caja de escribir del diseño (R20, G07, G08): el clip, el texto y
 * "Enviar" en una fila.
 *
 * RN-MSG-09 · un mensaje admite un adjunto. La categoría del archivo es
 * `requests_and_jobs`, que es la de RN-ARC-01 que describe lo que se
 * adjunta a una conversación de solicitud; no se inventa una categoría
 * nueva para esto.
 *
 * Sin restaurante no hay adjunto: todo archivo de Cuotly es de un
 * restaurante (RN-ARC-01), y un canal del equipo (RN-CAN-01) no cuelga de
 * ninguno. Se quita el clip en vez de ofrecer una subida que no tiene
 * dónde guardarse.
 */
export function PostMessageForm({
  conversationId,
  establishmentId,
}: {
  conversationId: string;
  establishmentId: string | null;
}) {
  const [state, action, pending] = useActionState(postMessage, INITIAL_MESSAGE);
  const campo = `mensaje-${conversationId}`;

  return (
    <form action={action}>
      <input type="hidden" name="conversationId" value={conversationId} />
      <div className="flex items-start gap-2 rounded-[10px] border border-border bg-surface p-2">
        {establishmentId === null ? null : (
          <FileUploadField
            establishmentId={establishmentId}
            category="requests_and_jobs"
            name="attachmentFileId"
            compact
          />
        )}
        <label htmlFor={campo} className="sr-only">
          {es.clientArea.messageLabel}
        </label>
        <textarea
          id={campo}
          name="body"
          rows={1}
          required
          placeholder={es.clientArea.messagePlaceholder}
          className="min-h-10 flex-1 resize-y rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-text-secondary focus:border-cuotly-green focus:ring-3 focus:ring-cuotly-green/15"
        />
        <Button type="submit" disabled={pending} className="h-10">
          {pending ? es.clientArea.messagePending : es.clientArea.messageSubmit}
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
