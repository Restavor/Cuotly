"use client";

import { useActionState } from "react";

import { Button, Card } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_COPY } from "./action-state";
import { copyDraftToEstablishment } from "./actions";

/**
 * R07 · RN-REQ-04 — "copiar y pegar dentro del mismo grupo".
 *
 * El desplegable solo enseña los hermanos del grupo porque es lo que la
 * regla permite; el servidor lo vuelve a comprobar, así que esto es una
 * comodidad, no el control. Cuando no hay ninguno —un restaurante sin
 * grupo, o el único del suyo— la pantalla no aparece vacía: dice cuál es
 * el motivo (CLAUDE.md: nada de rellenos).
 */
export function CopyDraftForm({
  slug,
  requestId,
  siblings,
}: {
  slug: string;
  requestId: string;
  siblings: readonly { id: string; name: string }[];
}) {
  const [formState, action, pending] = useActionState(copyDraftToEstablishment, INITIAL_COPY);

  return (
    <Card title={es.clientArea.draftCopyTitle}>
      <p className="mb-3 text-sm text-text-secondary">{es.clientArea.draftCopyHint}</p>

      {siblings.length === 0 ? (
        <p className="text-sm text-text-secondary">{es.clientArea.draftCopyNoSiblings}</p>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="requestId" value={requestId} />

          <label
            className="block text-sm font-semibold text-text"
            htmlFor={`copiar-${requestId}`}
          >
            {es.clientArea.draftCopyLabel}
          </label>
          <select
            id={`copiar-${requestId}`}
            name="targetEstablishmentId"
            defaultValue=""
            className="w-full rounded-[10px] border border-border bg-surface p-2 text-sm text-text"
          >
            <option value="">{es.clientArea.draftCopyChoose}</option>
            {siblings.map((hermano) => (
              <option key={hermano.id} value={hermano.id}>
                {hermano.name}
              </option>
            ))}
          </select>

          {formState.error ? (
            <p role="alert" className="text-sm text-danger">
              {formState.error}
            </p>
          ) : null}

          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? es.clientArea.draftCopyPending : es.clientArea.draftCopySubmit}
          </Button>
        </form>
      )}
    </Card>
  );
}
