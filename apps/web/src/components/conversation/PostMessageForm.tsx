"use client";

import { useActionState } from "react";

import { Button, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_MESSAGE } from "./action-state";
import { postMessage } from "./actions";

export function PostMessageForm({ conversationId }: { conversationId: string }) {
  const [state, action, pending] = useActionState(postMessage, INITIAL_MESSAGE);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      <TextArea label={es.clientArea.messageLabel} name="body" rows={3} required />
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
