"use client";

import { useActionState } from "react";

import { Button, Card, Field, Select, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { submitNewRequest, type RequestFormState } from "./actions";

const INITIAL: RequestFormState = { error: null, created: false };

export function NewRequestForm({ establishmentId }: { establishmentId: string }) {
  const [state, action, pending] = useActionState(submitNewRequest, INITIAL);

  return (
    <Card title={es.clientArea.newTitle}>
      <form action={action} className="space-y-4">
        <input type="hidden" name="establishmentId" value={establishmentId} />

        <TextArea
          label={es.clientArea.newDescriptionLabel}
          name="description"
          required
          hint={es.clientArea.newDescriptionHelp}
        />

        <Field
          label={es.clientArea.newContextLabel}
          name="context"
          hint={es.clientArea.newContextHelp}
        />

        {/*
          RN-REQ-05 · los dos obligatorios, como en la página 63 del
          diseño. El `required` es para no mandar el formulario a medias;
          quien lo mande por RPC recibe el "no" de `submit_request()`
          igual (CLAUDE.md: ocultar no es controlar).

          Sin opción vacía a propósito: un desplegable que empieza en
          "— Elige —" y es obligatorio produce un error que se podría
          haber evitado. Empieza en Media, que es lo que la mayoría de los
          cambios son, y quien tenga prisa lo sube.
        */}
        <Select
          label={es.clientArea.newPriorityLabel}
          name="priority"
          required
          hint={es.clientArea.newPriorityHelp}
          defaultValue="medium"
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
        />

        {/* RN-REQ-06 · que marcar "Alta" no adelanta el trabajo. */}
        <p className="text-sm text-text-secondary">{es.clientArea.newPriorityNotAPromise}</p>

        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? es.clientArea.newSubmitPending : es.clientArea.newSubmit}
        </Button>
      </form>
    </Card>
  );
}
