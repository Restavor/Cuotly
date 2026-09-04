"use client";

import { useActionState, useState } from "react";

import { Button, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_MESSAGE } from "./action-state";
import { editMessage } from "./actions";

/**
 * RN-MSG-07 · corregir un mensaje propio dentro de los 10 minutos.
 *
 * Que el botón aparezca lo decide `canEditMessage()` (src/core/messages.ts)
 * en la pantalla que monta la conversación, que es el MISMO cálculo que
 * hace `edit_message()` en el servidor. Si alguien deja la pestaña abierta
 * once minutos el botón sigue ahí y al pulsarlo el servidor dice que no:
 * es lo correcto, y por eso el error se enseña en vez de esconderse
 * (CLAUDE.md: ocultar un botón NO es un control de acceso).
 */
export function EditMessageForm({ messageId, body }: { messageId: string; body: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(editMessage, INITIAL_MESSAGE);

  if (!open) {
    return (
      <div className="mt-2">
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          {es.space.messages.editAction}
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="messageId" value={messageId} />
      <TextArea
        label={es.space.messages.editLabel}
        name="body"
        rows={3}
        defaultValue={body}
        hint={es.space.messages.editWindowHint}
        required
      />
      {state.error ? (
        <p role="alert" className="mb-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? es.space.messages.editPending : es.space.messages.editSubmit}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          {es.space.messages.editCancel}
        </Button>
      </div>
    </form>
  );
}
