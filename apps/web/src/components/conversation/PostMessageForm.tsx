"use client";

import { useActionState } from "react";

import { FileUploadField } from "@/components/FileUploadField";
import { Button, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_MESSAGE } from "./action-state";
import { postMessage } from "./actions";

/**
 * RN-MSG-09 · un mensaje admite un adjunto. La categoría del archivo es
 * `requests_and_jobs`, que es la de RN-ARC-01 que describe lo que se
 * adjunta a una conversación de solicitud; no se inventa una categoría
 * nueva para esto.
 */
export function PostMessageForm({
  conversationId,
  establishmentId,
}: {
  conversationId: string;
  establishmentId: string;
}) {
  const [state, action, pending] = useActionState(postMessage, INITIAL_MESSAGE);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      <TextArea label={es.clientArea.messageLabel} name="body" rows={3} required />
      <FileUploadField
        establishmentId={establishmentId}
        category="requests_and_jobs"
        name="attachmentFileId"
      />
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? es.clientArea.messagePending : es.clientArea.messageSubmit}
      </Button>
    </form>
  );
}
