"use client";

import { useActionState } from "react";

import { Button, Field, Select, TextArea } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

import { INITIAL_SCOPE } from "./action-state";
import { saveDraftScope } from "./actions";

/**
 * §68, punto 1 · el ALCANCE, detrás de "Editar contenido" (R07).
 *
 * El texto que trae un borrador convertido son los mensajes elegidos
 * pegados uno tras otro, que casi nunca es como uno redactaría lo que
 * pide. Reescribirlo es justo lo que §68 llama revisar, y cada cambio real
 * deja versión (RN-DAT-07): la 1 es la que salió de la conversación, y
 * sigue ahí.
 *
 * La prioridad y su motivo van aquí también (RN-REQ-05): un borrador que
 * sale de una conversación no los trae, y `submit_request()` no envía sin
 * ellos. Se abre solo cuando falta la prioridad, para que no haya que
 * buscar por qué no se envía.
 */
export function DraftScopeForm({
  requestId,
  description,
  context,
  priority,
  priorityReason,
  version,
}: {
  requestId: string;
  description: string;
  context: string | null;
  priority: string | null;
  priorityReason: string | null;
  version: number;
}) {
  const [state, action, pending] = useActionState(saveDraftScope, INITIAL_SCOPE);

  return (
    <details open={priority === null || state.error !== null} className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-field border border-cuotly-green bg-surface px-3.5 py-2 text-sm font-semibold text-cuotly-green hover:bg-cuotly-green/10">
        <Icon name="settings" className="h-4 w-4" />
        {es.panelRequests.editContent}
      </summary>
      <form action={action} className="mt-4 space-y-2 rounded-[10px] border border-border bg-soft-surface/40 p-4">
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="previousPriority" value={priority ?? ""} />
        <input type="hidden" name="previousPriorityReason" value={priorityReason ?? ""} />

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

        <Select
          label={es.clientArea.newPriorityLabel}
          name="priority"
          required
          hint={es.clientArea.newPriorityHelp}
          defaultValue={priority ?? "medium"}
          options={[
            { value: "high", label: es.clientArea.priorityLevels.high },
            { value: "medium", label: es.clientArea.priorityLevels.medium },
            { value: "low", label: es.clientArea.priorityLevels.low },
          ]}
        />

        <TextArea
          label={es.clientArea.newPriorityReasonLabel}
          name="priorityReason"
          rows={2}
          required
          maxLength={200}
          hint={es.clientArea.newPriorityReasonHelp}
          placeholder={es.clientArea.newPriorityReasonPlaceholder}
          defaultValue={priorityReason ?? ""}
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
    </details>
  );
}
