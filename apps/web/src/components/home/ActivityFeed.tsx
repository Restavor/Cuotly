import Link from "next/link";

import { dayDistance } from "@/core/home";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui";
import { es } from "@/i18n/es";

/**
 * "Actividad reciente" (§20.4).
 *
 * Sale de `state_events`, el libro inmutable de cambios de estado
 * (RN-DAT-05): no hay ningún resumen guardado aparte que pudiera acabar
 * contando otra cosa.
 *
 * **Sin identidad de nadie** (CLAUDE.md MUST NOT): cada línea dice QUÉ ha
 * pasado y en qué restaurante, nunca quién lo hizo. Quién hizo qué sale de
 * la auditoría, que tiene su propia pantalla y su propio permiso — y el
 * cliente no ve esta pantalla en ningún caso.
 *
 * La frase describe la transición; la insignia de al lado lleva el nombre
 * del estado, que sale de `naming.states` como en todas las demás
 * pantallas (CA-21).
 */
export interface ActivityEntry {
  readonly id: string;
  readonly entityType: "job" | "task";
  readonly toState: string;
  readonly occurredAt: string;
  readonly establishment: string | null;
  readonly deepLink: string | null;
}

type JobStateKey = keyof typeof es.naming.states.job;
type TaskStateKey = keyof typeof es.naming.states.task;

function frase(entry: ActivityEntry): string | null {
  if (entry.entityType === "job") {
    return es.spaceHome.activity.job[entry.toState as JobStateKey] ?? null;
  }
  return es.spaceHome.activity.task[entry.toState as TaskStateKey] ?? null;
}

function nombreDelEstado(entry: ActivityEntry): string | null {
  if (entry.entityType === "job") {
    return es.naming.states.job[entry.toState as JobStateKey] ?? null;
  }
  return es.naming.states.task[entry.toState as TaskStateKey] ?? null;
}

/** "Hoy, 10:24" · el día y la hora, en la zona horaria del espacio. */
function cuando(entry: ActivityEntry, timeZone: string, now: Date): string {
  const at = new Date(entry.occurredAt);
  const hora = new Intl.DateTimeFormat("es-ES", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);

  const distancia = dayDistance(at, now, timeZone);
  const dia =
    distancia === "today"
      ? es.spaceHome.activity.today
      : distancia === "yesterday"
        ? es.spaceHome.activity.yesterday
        : new Intl.DateTimeFormat("es-ES", { timeZone, dateStyle: "short" }).format(at);

  return es.spaceHome.activity.at(dia, hora);
}

export function ActivityFeed({
  entries,
  timeZone,
  now,
}: {
  entries: readonly ActivityEntry[];
  timeZone: string;
  now: Date;
}) {
  return (
    <ul className="flex flex-col">
      {entries.map((entry) => {
        const texto = frase(entry);
        const estado = nombreDelEstado(entry);
        // Un estado que esta pantalla no sabe nombrar no se pinta en
        // crudo: enseñar `in_correction` en inglés sería peor que no
        // enseñar la línea (CA-21).
        if (texto === null || estado === null) return null;

        const contenido = (
          <>
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-soft-surface text-text-secondary"
            >
              <Icon name={entry.entityType === "job" ? "job" : "task"} className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-text">{texto}</span>
              <span className="block truncate text-xs text-text-secondary">
                {entry.establishment === null
                  ? cuando(entry, timeZone, now)
                  : `${entry.establishment} · ${cuando(entry, timeZone, now)}`}
              </span>
            </span>
            <StatusBadge tone="neutral">{estado}</StatusBadge>
          </>
        );

        return (
          <li key={entry.id} className="border-b border-border last:border-b-0">
            {entry.deepLink === null ? (
              <div className="flex items-center gap-3 px-2 py-3">{contenido}</div>
            ) : (
              <Link
                href={entry.deepLink}
                className="flex items-center gap-3 rounded-[10px] px-2 py-3 hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
              >
                {contenido}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
