import { Card, EmptyState, StatusBadge } from "@/components/ui";
import { es } from "@/i18n/es";
import type { EstablishmentNotes } from "@/app/espacios/[slug]/mensajes/[id]/notes-load";

import { ArchiveNoteButton } from "./ArchiveNoteButton";
import { NewNoteForm } from "./NewNoteForm";

/**
 * Maqueta 18 · la columna derecha: las notas internas del restaurante
 * (RN-EST-13).
 *
 * **La insignia "Solo equipo" no es decoración.** RN-MSG-04 llama fallo
 * grave a mezclar lo interno con lo que ve el cliente, y el panel vive al
 * lado de una conversación que el restaurante sí lee: quien escribe tiene
 * que saber, sin pensarlo, en cuál de las dos está.
 *
 * Y cuando quien mira no tiene nada que ver con estas notas, el panel **no
 * se pinta en absoluto** — ni siquiera vacío. Una caja titulada "Notas
 * internas" diciendo "no hay ninguna" ya le cuenta al cliente que existen.
 */
export function NotesPanel({
  establishmentId,
  notes,
}: {
  establishmentId: string;
  notes: EstablishmentNotes;
}) {
  if (!notes.canRead) return null;

  const t = es.notes;

  return (
    <Card
      title={t.title}
      action={
        <StatusBadge tone="neutral" icon="lock">
          {t.teamOnly}
        </StatusBadge>
      }
    >
      <NewNoteForm establishmentId={establishmentId} canRestrict={notes.canRestrict} />

      <div className="mt-4">
        {notes.notes.length === 0 ? (
          <EmptyState title={t.emptyTitle} description={t.emptyReason} />
        ) : (
          <ul className="space-y-3">
            {notes.notes.map((note) => (
              <li key={note.id} className="rounded-[10px] bg-soft-surface p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-primary-dark">
                    {note.authorName ?? t.unknownAuthor}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {new Intl.DateTimeFormat("es-ES", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(note.createdAt))}
                  </span>
                </div>

                {/*
                  RN-EST-13 · una nota reservada se marca. Sin la marca,
                  quien la escribió no sabría si su compañero la está
                  leyendo, que es justo lo que el interruptor decide.
                */}
                {note.operational ? null : (
                  <p className="mt-1">
                    <StatusBadge tone="warning">{t.restrictedBadge}</StatusBadge>
                  </p>
                )}

                <p className="mt-2 whitespace-pre-wrap text-text">{note.body}</p>

                {/*
                  Archivar, no borrar (CLAUDE.md). Se le ofrece a quien la
                  escribió y a quien gestiona clientes; quien no pueda
                  recibe el "no" del servidor.
                */}
                {note.mine || notes.canRestrict ? (
                  <div className="mt-2">
                    <ArchiveNoteButton noteId={note.id} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
