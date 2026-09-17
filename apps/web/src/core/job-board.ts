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

import { JOB_STATES, type JobState } from "./job-states";

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
