"use client";

import { useActionState } from "react";

import { Button, Card } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_SUBMIT } from "./action-state";
import { submitDraft } from "./actions";

/**
 * §68 · enviar, que es lo que la revisión precede. Hasta aquí el equipo no
 * ha visto ninguna solicitud y el contador de primera atención no corre
 * (RN-SLA-01): los dos empiezan con este botón.
 *
 * No lleva el alcance en campos ocultos a propósito: lo que se envía es lo
 * que está GUARDADO, y eso lo lee la acción de la base. Si viajara por
 * aquí, escribir en el cuadro de texto sin pulsar "Guardar el alcance"
 * mandaría una solicitud que dice una cosa y se clasifica por otra.
 */
export function SubmitDraftForm({
  slug,
  establishmentId,
  requestId,
}: {
  slug: string;
  establishmentId: string;
  requestId: string;
}) {
  const [formState, action, pending] = useActionState(submitDraft, INITIAL_SUBMIT);

  return (
    <Card title={es.clientArea.draftSubmitTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="establishmentId" value={establishmentId} />
        <input type="hidden" name="requestId" value={requestId} />

        <p className="text-sm text-text-secondary">{es.clientArea.draftSubmitHint}</p>

        {formState.error ? (
          <p role="alert" className="text-sm text-danger">
            {formState.error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? es.clientArea.draftSubmitPending : es.clientArea.draftSubmit}
        </Button>
      </form>
    </Card>
  );
}
