"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";
import { es } from "@/i18n/es";

import { createNote } from "@/app/espacios/[slug]/mensajes/[id]/notes-actions";
import { INITIAL_NOTE } from "@/app/espacios/[slug]/mensajes/[id]/notes-state";

/**
 * Maqueta 18 · "Nueva nota".
 *
 * El interruptor solo se pinta a quien puede moverlo (`manage_clients`).
 * No autoriza nada —`create_establishment_note()` lo comprueba por su
 * cuenta— pero enseñárselo a un trabajador sería ofrecerle escribir una
 * nota y perderla de vista en el acto.
 */
export function NewNoteForm({
  establishmentId,
  canRestrict,
}: {
  establishmentId: string;
  canRestrict: boolean;
}) {
  const [state, action, pending] = useActionState(createNote, INITIAL_NOTE);
  const t = es.notes;

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="establishmentId" value={establishmentId} />
      <label className="sr-only" htmlFor="nueva-nota">
        {t.newLabel}
      </label>
      <textarea
        id="nueva-nota"
        name="body"
        rows={3}
        maxLength={4000}
        placeholder={t.newPlaceholder}
        className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-secondary focus:outline focus:outline-2 focus:outline-cuotly-green"
      />

      {canRestrict ? (
        <label className="flex items-start gap-2 text-sm text-text-secondary">
          <input type="checkbox" name="restricted" className="mt-0.5" />
          <span>{t.restrictLabel}</span>
        </label>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? t.newPending : t.newSubmit}
      </Button>
      {state.error ? <p className="text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}
