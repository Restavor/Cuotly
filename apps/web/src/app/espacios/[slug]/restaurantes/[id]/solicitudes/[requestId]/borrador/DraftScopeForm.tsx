"use client";

import { useActionState } from "react";

import { Button, Card, Field, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_SCOPE } from "./action-state";
import { saveDraftScope } from "./actions";

/**
 * §68, punto 1 · el ALCANCE.
 *
 * El texto que trae el borrador son los mensajes elegidos pegados uno tras
 * otro, que casi nunca es como uno redactaría lo que pide. Reescribirlo es
 * justo lo que §68 llama revisar, y cada cambio real deja versión
 * (RN-DAT-07): la 1 es la que salió de la conversación, y sigue ahí.
 */
export function DraftScopeForm({
  requestId,
  description,
  context,
  version,
}: {
  requestId: string;
  description: string;
  context: string | null;
  version: number;
}) {
  const [state, action, pending] = useActionState(saveDraftScope, INITIAL_SCOPE);

  return (
    <Card title={es.clientArea.draftScopeTitle}>
      <form action={action} className="space-y-2">
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="version" value={version} />

        <TextArea
          label={es.clientArea.newDescriptionLabel}
          name="description"
          defaultValue={description}
          rows={6}
          required
          hint={es.clientArea.draftScopeHint}
        />

        <Field
          label={es.clientArea.convertContextLabel}
          name="context"
          defaultValue={context ?? ""}
          hint={es.clientArea.convertContextHelp}
        />

        <p className="text-sm text-text-secondary">{es.clientArea.draftScopeVersion(version)}</p>

        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        {state.saved ? <p className="text-sm text-cuotly-green">{es.clientArea.draftScopeSaved}</p> : null}

        {state.unchanged ? (
          <p className="text-sm text-text-secondary">{es.clientArea.draftScopeUnchanged}</p>
        ) : null}

        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? es.clientArea.draftScopeSaving : es.clientArea.draftScopeSave}
        </Button>
      </form>
    </Card>
  );
}
