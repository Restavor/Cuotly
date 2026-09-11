"use client";

import { useActionState } from "react";

import { es } from "@/i18n/es";

import { archiveNote } from "@/app/espacios/[slug]/mensajes/[id]/notes-actions";
import { INITIAL_NOTE } from "@/app/espacios/[slug]/mensajes/[id]/notes-state";

/**
 * Maqueta 18 · el "…" de cada nota, que aquí es una acción sola:
 * archivarla. No hay borrar — CLAUDE.md no borra registros de negocio— y
 * por eso el botón dice lo que hace de verdad.
 */
export function ArchiveNoteButton({ noteId }: { noteId: string }) {
  const [state, action, pending] = useActionState(archiveNote, INITIAL_NOTE);

  return (
    <form action={action}>
      <input type="hidden" name="noteId" value={noteId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-text-secondary underline transition-colors hover:text-text focus:outline focus:outline-2 focus:outline-cuotly-green disabled:opacity-60"
      >
        {pending ? es.notes.archivePending : es.notes.archiveSubmit}
      </button>
      {state.error ? <p className="mt-1 text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}
