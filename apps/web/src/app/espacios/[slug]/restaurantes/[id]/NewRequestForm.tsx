"use client";

import { useActionState } from "react";

import { Button, Card, Field, TextArea } from "@/components/ui";
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
