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
 *   3. Prioridad interna del plan: Premium por encima de Impulso
 *      (RN-COM-03). **El cliente nunca ve esa prioridad**, así que este
 *      dato no puede salir en ninguna pantalla de cliente.
 *   4. Asignación más antigua primero.
 *   5. `jobId`, para que el orden sea reproducible (desempate técnico, no
 *      una regla de negocio — mismo criterio que `compareCandidates`).
 *
 * Y sobre todo (PRD §20.4): **la recomendación no obliga** — el trabajador
 * puede empezar otro trabajo autorizado. Eso es `canStartQueuedJob`, que no
 * mira la recomendación para nada.
 */

import type { JobState } from "./job-states";

/** RN-COM-03: prioridad interna, nunca visible para el cliente. */
export type PlanPriority = "premium" | "impulso" | "other";

const PLAN_PRIORITY_ORDER: Readonly<Record<PlanPriority, number>> = {
  premium: 0,
  impulso: 1,
  other: 2,
};

export type QueuedJob = {
  readonly jobId: string;
  /** Estado real del trabajo (RN-SLA-17: "Fuera de plazo" no es un estado). */
  readonly state: JobState;
  readonly outOfDeadline: boolean;
  /** Minutos laborables que le quedan al contador vivo (T2 o T3). */
  readonly remainingBusinessMinutes: number;
  readonly planPriority: PlanPriority;
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
  if (a.planPriority !== b.planPriority) return PLAN_PRIORITY_ORDER[a.planPriority] - PLAN_PRIORITY_ORDER[b.planPriority];
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
