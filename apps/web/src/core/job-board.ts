/**
 * `src/core/job-board.ts` — la bandeja de trabajos vista por estado (M09).
 * Lógica de dominio pura: sin Supabase, sin Next, sin React (CLAUDE.md).
 *
 * El tablero **no trae ningún dato nuevo**: son los mismos trabajos que la
 * lista, agrupados por su estado. Por eso lo único que hay aquí es el
 * agrupado, y está aquí y no en la pantalla por dos motivos que se leen
 * mejor juntos:
 *
 *   · **El orden de las columnas es el de PRD §11.1**, que es el orden en
 *     que un trabajo recorre su vida. Un tablero ordenado alfabéticamente o
 *     por cuántos trabajos tiene cada columna contaría otra historia cada
 *     día, y el tablero existe justo para ver dónde se atasca el trabajo.
 *   · **Dentro de cada columna mandan el orden de la lista.** La bandeja ya
 *     viene ordenada por `loadTeamJobs()` —prioridad del restaurante
 *     primero, después lo más reciente— y el tablero no lo vuelve a
 *     decidir: reordenarlo aquí sería una segunda copia de una regla que
 *     ya tiene dueño.
 *
 * Las once columnas se pintan **todas**, también las vacías. Esconder una
 * columna sin trabajos es esconder la pregunta que el tablero contesta
 * ("¿cuántos hay parados esperando al cliente?"), y una columna vacía dice
 * que está vacía, que es un dato, no un hueco.
 */

import { addBusinessMinutes, type WorkCalendar } from "./business-clock";
import { JOB_STATES, type JobState } from "./job-states";
import { requestHeadline } from "./requests";
import type { CounterStatus } from "./sla-timers";

export interface JobBoardColumn<T> {
  readonly state: JobState;
  readonly jobs: readonly T[];
}

/**
 * Reparte los trabajos en las once columnas de §11.1, en el orden del PRD y
 * conservando dentro de cada una el orden en que llegaron.
 *
 * Un estado que no sea de los once —no debería existir, la base lo impide
 * con un CHECK— no se pierde ni se inventa una columna para él: sale en
 * `unknown`, y la pantalla decide si lo enseña. Tragárselo en silencio sería
 * hacer desaparecer un trabajo de la vista del equipo.
 */
export function groupJobsByState<T extends { readonly state: string }>(
  jobs: readonly T[],
): { readonly columns: readonly JobBoardColumn<T>[]; readonly unknown: readonly T[] } {
  const porEstado = new Map<string, T[]>();
  const desconocidos: T[] = [];

  for (const job of jobs) {
    if (!(JOB_STATES as readonly string[]).includes(job.state)) {
      desconocidos.push(job);
      continue;
    }
    const cajon = porEstado.get(job.state);
    if (cajon) cajon.push(job);
    else porEstado.set(job.state, [job]);
  }

  return {
    columns: JOB_STATES.map((state) => ({ state, jobs: porEstado.get(state) ?? [] })),
    unknown: desconocidos,
  };
}

/**
 * El aviso de plazo de cada tarjeta del tablero. **No se calcula aquí**: lo
 * calcula `loadSpaceAttention()` con el reloj laborable, la misma función
 * que alimenta "Necesita atención" del Inicio del espacio, y aquí solo se
 * pasa de su lista a un mapa por trabajo. Dos cálculos del mismo plazo
 * acabarían diciendo cosas distintas en dos pantallas.
 */
export type BoardDeadline =
  | { readonly kind: "out_of_deadline" }
  | { readonly kind: "about_to_expire"; readonly remainingMinutes: number; readonly counter: string | null };

export function deadlinesByJob(
  items: readonly {
    readonly kind: string;
    readonly id: string;
    readonly remainingMinutes: number | null;
    readonly counter: string | null;
  }[],
): Map<string, BoardDeadline> {
  const mapa = new Map<string, BoardDeadline>();
  for (const item of items) {
    if (item.kind === "job_out_of_deadline") mapa.set(item.id, { kind: "out_of_deadline" });
    else if (item.kind === "job_about_to_expire")
      mapa.set(item.id, {
        kind: "about_to_expire",
        remainingMinutes: item.remainingMinutes ?? 0,
        counter: item.counter,
      });
  }
  return mapa;
}

/**
 * M09 · "Próximos vencimientos": cuándo vence el plazo que corre de un
 * trabajo, proyectado igual que la "Fecha estimada de fin" de su ficha
 * (`timers-load.ts`): desde ahora, sumando los minutos laborables que le
 * quedan en su calendario.
 *
 *   · **Vencido**: el reloj dice que se ha pasado (RN-SLA-17). No se
 *     inventa a qué hora venció.
 *   · **En pausa**: el contador está parado (RN-SLA-14) y lo que queda se
 *     conserva. Sumárselo a "ahora" daría una fecha distinta en cada
 *     recarga, así que no se da ninguna.
 *   · **Fecha**: corre, y vence en `at`.
 */
export type ProjectedDeadline =
  | { readonly kind: "overdue" }
  | { readonly kind: "paused" }
  | { readonly kind: "at"; readonly at: Date };

export function projectDeadline(
  status: CounterStatus,
  running: boolean,
  now: Date,
  calendar: WorkCalendar,
): ProjectedDeadline {
  if (status.overdue) return { kind: "overdue" };
  if (!running) return { kind: "paused" };
  return { kind: "at", at: addBusinessMinutes(now, Math.max(0, status.remainingMinutes), calendar) };
}

/**
 * Los próximos vencimientos, para la tarjeta: primero lo vencido, después
 * lo que vence antes. Lo que está en pausa no tiene fecha y no entra.
 */
export function upcomingDeadlines<T extends { readonly deadline: ProjectedDeadline }>(
  rows: readonly T[],
  limit = 5,
): T[] {
  const vencidos = rows.filter((r) => r.deadline.kind === "overdue");
  const conFecha = rows
    .filter((r) => r.deadline.kind === "at")
    .sort(
      (a, b) =>
        (a.deadline as { at: Date }).at.getTime() - (b.deadline as { at: Date }).at.getTime(),
    );
  return [...vencidos, ...conFecha].slice(0, limit);
}

/**
 * El título de un trabajo en la bandeja: el resumen validado de su
 * solicitud o, si no lo tiene, el principio de lo que escribió el
 * restaurante. `null` si no viene de ninguna solicitud.
 */
export function jobHeadline(job: {
  readonly summary: string | null;
  readonly description: string | null;
}): string | null {
  return job.summary?.trim() || (job.description ? requestHeadline(job.description, 80) : "") || null;
}
