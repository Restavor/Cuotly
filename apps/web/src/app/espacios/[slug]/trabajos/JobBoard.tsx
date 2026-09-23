import Link from "next/link";

import { Avatar, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import {
  jobHeadline,
  type BoardDeadline,
  type JobBoardColumn,
} from "@/core/job-board";
import { tiempoRestante } from "@/i18n/duration";
import { es } from "@/i18n/es";

import type { JobListRow } from "./list-query";

type CategoryKey = keyof typeof es.naming.categories;
type Tone = "success" | "warning" | "info" | "neutral" | "danger";

const t = es.teamArea.jobs;

/** El punto de color de cada columna, del mismo tono que su insignia. */
const PUNTO: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  neutral: "bg-text-secondary/40",
  danger: "bg-danger",
};

/**
 * M09 · la vista Tablero: una columna por estado, con los mismos trabajos
 * que la lista. Cada tarjeta dice lo que dice su fila: qué es, de qué
 * restaurante, quién lo lleva, su categoría, su puesto y, si lo tiene, el
 * aviso de plazo que calcula el reloj laborable.
 *
 * **No se arrastra.** Mover un trabajo de columna es cambiar su estado, y
 * cada cambio tiene su regla, su evento y su auditoría (RN-JOB); un
 * arrastre saltaría todo eso. La tarjeta abre el trabajo, que es donde
 * están los botones que el servidor comprueba.
 */
export function JobBoard({
  columns,
  unknown,
  deadlines,
  establishmentName,
  personName,
  href,
  tone,
}: {
  columns: readonly JobBoardColumn<JobListRow>[];
  unknown: readonly JobListRow[];
  deadlines: ReadonlyMap<string, BoardDeadline>;
  establishmentName: ReadonlyMap<string, string>;
  personName: ReadonlyMap<string, string>;
  href: (id: string) => string;
  tone: (state: string) => Tone;
}) {
  return (
    // `relative`: los textos `sr-only` van posicionados y, sin esto, se
    // escapan del desplazamiento y ensanchan la página entera.
    <div className="relative flex gap-4 overflow-x-auto pb-3">
      {columns.map((columna) => {
        const tono = tone(columna.state);
        return (
          <section
            key={columna.state}
            aria-label={es.naming.states.job[columna.state]}
            // Las vacías se ven —una columna vacía es un dato, no un hueco
            // (`job-board.ts`)—, pero más estrechas: once columnas anchas
            // obligaban a desplazarse por encima de las que no tienen nada.
            className={`flex shrink-0 flex-col rounded-card bg-soft-surface/70 p-2.5 ${
              columna.jobs.length === 0 ? "w-48" : "w-72"
            }`}
          >
            <header className="mb-2.5 flex items-center gap-2 px-1.5 pt-1">
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${PUNTO[tono]}`}
              />
              <h2
                title={es.naming.states.job[columna.state]}
                className="flex-1 truncate text-sm font-semibold text-text"
              >
                {es.naming.states.job[columna.state]}
              </h2>
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-text">
                <span className="sr-only">
                  {t.boardColumnCount(columna.jobs.length)}
                </span>
                <span aria-hidden="true">{columna.jobs.length}</span>
              </span>
            </header>

            {columna.jobs.length === 0 ? (
              <p className="rounded-[10px] border border-dashed border-border p-3 text-center text-xs text-text-secondary">
                {t.boardColumnEmpty}
              </p>
            ) : (
              <ul className="space-y-2">
                {columna.jobs.map((job) => (
                  <li key={job.id}>
                    <Tarjeta
                      job={job}
                      deadline={deadlines.get(job.id) ?? null}
                      establishment={
                        establishmentName.get(job.establishment_id) ?? "—"
                      }
                      person={
                        job.assigned_to
                          ? (personName.get(job.assigned_to) ?? "—")
                          : null
                      }
                      href={href(job.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {/* Un trabajo con un estado fuera de los once no debería existir
          —la base lo impide con un CHECK—, pero si existiera, esconderlo
          sería hacerlo desaparecer de la bandeja del equipo. */}
      {unknown.length === 0 ? null : (
        <section className="w-72 shrink-0 rounded-card bg-danger/5 p-2.5">
          <header className="mb-2 px-1.5 pt-1">
            <StatusBadge tone="danger">{t.boardUnknownTitle}</StatusBadge>
            <p className="mt-1 text-xs text-text-secondary">
              {t.boardUnknownHint}
            </p>
          </header>
          <ul className="space-y-2">
            {unknown.map((job) => (
              <li
                key={job.id}
                className="rounded-[12px] border border-border bg-surface p-3"
              >
                <Link
                  href={href(job.id)}
                  className="text-sm font-semibold text-cuotly-green underline"
                >
                  {job.code}
                </Link>
                <p className="mt-1 text-xs text-text-secondary">{job.state}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Tarjeta({
  job,
  deadline,
  establishment,
  person,
  href,
}: {
  job: JobListRow;
  deadline: BoardDeadline | null;
  establishment: string;
  person: string | null;
  href: string;
}) {
  const titulo = jobHeadline(job) ?? t.boardNoTitle;
  return (
    <Link
      href={href}
      className={`block rounded-[12px] border bg-surface p-3 shadow-sm transition-colors hover:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green ${
        deadline?.kind === "out_of_deadline"
          ? "border-danger/50"
          : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="whitespace-nowrap rounded-md bg-soft-surface px-1.5 py-0.5 text-[11px] font-semibold text-text-secondary">
          {job.code}
        </span>
        {deadline === null ? null : deadline.kind === "out_of_deadline" ? (
          <StatusBadge tone="danger">{es.space.jobs.outOfDeadline}</StatusBadge>
        ) : (
          <StatusBadge tone="warning">
            {deadline.counter === "t3"
              ? es.spaceHome.attention.remainingToDeliver(
                  tiempoRestante(deadline.remainingMinutes),
                )
              : es.spaceHome.attention.remainingToStart(
                  tiempoRestante(deadline.remainingMinutes),
                )}
          </StatusBadge>
        )}
      </div>

      <p className="mt-2 line-clamp-2 text-sm font-semibold text-text">
        {titulo}
      </p>

      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-text-secondary">
        <Icon name="building" className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{establishment}</span>
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-text">
          {person ? (
            <>
              <Avatar name={person} size={22} />
              <span className="truncate">{person}</span>
            </>
          ) : (
            <span className="text-text-secondary">{t.unassigned}</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {job.category ? (
            <span className="rounded-full bg-cuotly-green/10 px-2 py-0.5 text-[11px] font-medium text-primary-dark">
              {es.naming.categories[job.category as CategoryKey] ??
                job.category}
            </span>
          ) : null}
          {job.priority_rank === null ? null : (
            <span className="rounded-full bg-info/15 px-2 py-0.5 text-[11px] font-semibold text-primary-dark">
              {t.priorityShort(job.priority_rank)}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}
