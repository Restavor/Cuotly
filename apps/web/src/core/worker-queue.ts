/**
 * `src/core/worker-queue.ts` — la cola personal de un trabajador y el
 * "trabajo recomendado ahora" (PRD §20.4, HU-17). Lógica de dominio pura:
 * sin Supabase, sin Next.js, sin React (CLAUDE.md, regla de estilo de
 * código).
 *
 * **Lo que este módulo NO hace.** No hay fórmula ponderada ni porcentajes:
 * igual que en `assignment.ts` (RN-ASG-06), el orden es determinista y
 * lexicográfico, y cada criterio sale de una regla escrita del PRD:
 *
 *   1. Fuera de plazo primero (RN-SLA-17: es la condición que exige
 *      atención inmediata; §1: "¿qué necesita atención o una decisión?").
 *   2. Menor tiempo laborable restante en el contador vivo del trabajo
 *      (T2 si aún no ha comenzado, T3 si está en marcha — RN-SLA-05/11).
 *   3. El orden que ha puesto el restaurante entre sus propios cambios
 *      (encargo de Bosco del 11/09/2026; `compareClientRank` en
 *      `priority.ts`, la misma definición que usa la bandeja).
 *   4. Turno del plan: `plans.queue_rank`, mayor primero (RN-COM-03,
 *      decisión 55). En Restavor, Premium+ por delante de Premium y
 *      Premium por delante del resto — que es exactamente lo que pidió
 *      Bosco el 19/09/2026: "si hay una solicitud de Premium+ y otra de
 *      Premium, se contestaría primero la de Premium+". **El cliente nunca
 *      ve ese turno**, así que este dato no puede salir en ninguna
 *      pantalla de cliente.
 *   5. Asignación más antigua primero.
 *   6. `jobId`, para que el orden sea reproducible (desempate técnico, no
 *      una regla de negocio — mismo criterio que `compareCandidates`).
 *
 * **Por qué el orden del cliente va el tercero y no el primero.** Porque
 * un plazo contractual no es negociable y la preferencia del restaurante
 * sí: si su cambio menos importante vence esta tarde y el más importante
 * pasado mañana, lo que hay que hacer ahora es el que vence: incumplirlo
 * no es algo que el cliente haya pedido al ordenar su lista, y el plazo se
 * lo debe Cuotly igual (RN-SLA). Por debajo de los dos criterios de plazo,
 * su orden manda — y ese es exactamente el caso para el que se inventó:
 * cinco cambios enviados de una vez, aceptados a la vez y con el mismo
 * contador, donde hasta ahora decidía la fecha de asignación y ahora
 * decide él.
 *
 * Y sobre todo (PRD §20.4): **la recomendación no obliga** — el trabajador
 * puede empezar otro trabajo autorizado. Eso es `canStartQueuedJob`, que no
 * mira la recomendación para nada.
 */

import type { JobState } from "./job-states";
import { compareClientRank } from "./priority";

/**
 * RN-COM-03: el **turno** del plan, nunca visible para el cliente.
 *
 * Desde la decisión 55 (19/09/2026) no sale de `plans.grants_priority`
 * sino de **`plans.queue_rank`**, y el motivo importa: aquel booleano
 * decidía cuatro cosas a la vez y no podía decir que Premium+ se atiende
 * antes que Premium **y** que los dos pueden ordenar sus cambios. Son
 * cosas distintas y ahora son columnas distintas.
 *
 * El número es el de la base: **mayor va primero**. En Restavor, Premium+
 * (2), Premium (1) y el resto (0). No se traduce a nombres de plan porque
 * Cuotly es multiempresa (CLAUDE.md): otro espacio llamará "Total" al
 * suyo, y lo que cuenta es el número que su catálogo le haya puesto.
 *
 * **Esto no es un plazo más corto.** El plazo es `start_sla_hours`
 * (RN-SLA-02) y no lo decide el turno: Impulso+, Premium y Premium+
 * arrancan los tres a 24 h.
 */
export type PlanQueueRank = number;

export type QueuedJob = {
  readonly jobId: string;
  /** Estado real del trabajo (RN-SLA-17: "Fuera de plazo" no es un estado). */
  readonly state: JobState;
  readonly outOfDeadline: boolean;
  /** Minutos laborables que le quedan al contador vivo (T2 o T3). */
  readonly remainingBusinessMinutes: number;
  /**
   * El puesto que le ha dado el restaurante entre sus cambios pendientes
   * (1 = el más importante), o `null` si no lo ha ordenado o su plan no se
   * lo concede. Sale de `requests.priority_rank`.
   */
  readonly priorityRank: number | null;
  /**
   * RN-COM-03 · `plans.queue_rank` del plan vigente de su restaurante, o 0
   * sin plan. Lo sirve `establishment_queue_rank()`, que devuelve 0 a
   * quien no es del espacio: el turno no viaja hacia el cliente.
   */
  readonly planQueueRank: PlanQueueRank;
  readonly assignedAt: Date;
};

/**
 * Trabajos que ocupan la cola personal: los que esperan a que el
 * responsable actúe. Un trabajo bloqueado espera al restaurante
 * (RN-JOB-08), no al trabajador, así que no compite por su atención en la
 * cola — sigue siendo suyo y visible en su trabajo, pero no se recomienda
 * empezarlo.
 */
export const QUEUE_JOB_STATES: readonly JobState[] = ["assigned", "in_progress", "in_correction"] as const;

export function isQueuedJobState(state: JobState): boolean {
  return QUEUE_JOB_STATES.includes(state);
}

export function compareQueuedJobs(a: QueuedJob, b: QueuedJob): number {
  if (a.outOfDeadline !== b.outOfDeadline) return a.outOfDeadline ? -1 : 1;
  if (a.remainingBusinessMinutes !== b.remainingBusinessMinutes) {
    return a.remainingBusinessMinutes - b.remainingBusinessMinutes;
  }
  const porOrdenDelCliente = compareClientRank(a.priorityRank, b.priorityRank);
  if (porOrdenDelCliente !== 0) return porOrdenDelCliente;
  // Mayor turno primero, así que se resta al revés que en los demás
  // criterios: aquí el número grande es el que manda.
  if (a.planQueueRank !== b.planQueueRank) return b.planQueueRank - a.planQueueRank;
  if (a.assignedAt.getTime() !== b.assignedAt.getTime()) return a.assignedAt.getTime() - b.assignedAt.getTime();
  return a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0;
}

/** HU-17: la cola personal, ordenada. */
export function orderWorkerQueue(jobs: readonly QueuedJob[]): readonly QueuedJob[] {
  return jobs.filter((job) => isQueuedJobState(job.state)).sort(compareQueuedJobs);
}

/** HU-17 · PRD §20.4: el "trabajo recomendado ahora", o `null` si la cola está vacía. */
export function recommendedJobNow(jobs: readonly QueuedJob[]): QueuedJob | null {
  return orderWorkerQueue(jobs)[0] ?? null;
}

/**
 * PRD §20.4: "La recomendación **no obliga**: puede empezar otro trabajo
 * autorizado." Cualquier trabajo de su propia cola es empezable — la
 * recomendación no entra en esta decisión, y por eso esta función ni
 * siquiera la calcula.
 */
export function canStartQueuedJob(jobs: readonly QueuedJob[], jobId: string): boolean {
  return orderWorkerQueue(jobs).some((job) => job.jobId === jobId && job.state === "assigned");
}
