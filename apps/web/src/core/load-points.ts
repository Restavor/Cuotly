/**
 * `src/core/load-points.ts` — puntos de carga y niveles (PRD §14.4
 * RN-ASG-13 a 17, HU-21). Lógica de dominio pura: sin Supabase, sin
 * Next.js, sin React (CLAUDE.md, regla de estilo de código).
 *
 * Los puntos de carga miden **trabajo humano activo**. No son consumo del
 * plan ni una nota de productividad (§3, glosario; RN-CON-01: "los puntos
 * de carga no intervienen en el consumo"), y RN-ASG-17 prohíbe cualquier
 * ranking público entre trabajadores — este módulo calcula la carga de una
 * persona, nunca compara a unas con otras.
 */

import type { ChangeCategory } from "./consumption-ledger";

/** §14.4: Fotográfico 1 · Pequeño 1 · Mediano 4 · Grande 10. */
export const JOB_LOAD_POINTS: Readonly<Record<ChangeCategory, number>> = {
  photo: 1,
  small: 1,
  medium: 4,
  large: 10,
};

/** §14.4: Ligera 1 · Normal 3 · Alta 6 · Muy alta 10. */
export const TASK_LOAD_POINTS = {
  light: 1,
  normal: 3,
  high: 6,
  very_high: 10,
} as const;

export type TaskWeight = keyof typeof TASK_LOAD_POINTS;

/**
 * RN-ASG-16: la categoría de puntos para tareas de **más de 4 horas está
 * pendiente**; esas tareas deben dividirse y **no se inventa una categoría
 * nueva**. Por eso esta función devuelve `"must_be_split"` en vez de
 * inventarse un peso: quien la llame tiene que pedir que la tarea se
 * divida, no asignarle puntos a ojo.
 */
export type TaskWeightResult = TaskWeight | "must_be_split";

/**
 * §14.4: Ligera hasta 15 min · Normal 15–45 · Alta 45–120 · Muy alta 2–4 h.
 * Los bordes se resuelven "hasta e incluyendo" (15 min es Ligera, 45 es
 * Normal, 120 es Alta, 240 es Muy alta), que es la lectura literal de
 * "hasta 15 min" y la única que no deja un hueco entre categorías.
 */
export function taskWeightForMinutes(minutes: number): TaskWeightResult {
  if (minutes <= 0) throw new Error("La duración estimada de una tarea debe ser mayor que cero");
  if (minutes <= 15) return "light";
  if (minutes <= 45) return "normal";
  if (minutes <= 120) return "high";
  if (minutes <= 240) return "very_high";
  return "must_be_split"; // RN-ASG-16, pendiente a propósito.
}

export type LoadLevel = "low" | "normal" | "high" | "very_high";

/** §14.4: 0–9 Baja · 10–19 Normal · 20–29 Alta · 30 o más Muy alta. */
export function loadLevel(points: number): LoadLevel {
  if (points < 10) return "low";
  if (points < 20) return "normal";
  if (points < 30) return "high";
  return "very_high";
}

/**
 * RN-ASG-15: **no existe un máximo duro**. El sistema avisa y recomienda,
 * pero una persona autorizada puede asignar manualmente por encima del
 * nivel. Esta función solo dice si conviene avisar; nunca bloquea nada, y
 * ninguna otra función de este módulo impide una asignación por carga.
 */
export function shouldWarnAboutLoad(pointsAfterAssignment: number): boolean {
  return loadLevel(pointsAfterAssignment) === "very_high";
}

/**
 * Un trabajo activo de la persona (RN-ASG-13: `assigned` o `in_progress`).
 * `isBrokenIntoTasks` es RN-ASG-14: si el trabajo está desglosado en
 * tareas, sus puntos generales dejan de sumar y los reciben quienes tienen
 * las tareas.
 */
export type ActiveJobLoad = {
  readonly jobId: string;
  readonly category: ChangeCategory;
  readonly isBrokenIntoTasks: boolean;
};

/** Una tarea activa asignada a la persona (RN-ASG-13). */
export type ActiveTaskLoad = {
  readonly taskId: string;
  readonly weight: TaskWeight;
};

/**
 * RN-ASG-13/14 · HU-21: puntos de carga activos de una persona.
 *
 * - Suman los trabajos `assigned` (aún sin comenzar) e `in_progress`, y las
 *   tareas asignadas. Al completarse dejan de sumar, pero permanecen en
 *   métricas e historial — por eso quien llama pasa solo lo activo, y esta
 *   función no borra ni archiva nada.
 * - RN-ASG-14: un trabajo **no** desglosado da sus puntos completos al
 *   responsable. Un trabajo desglosado en tareas deja de sumar sus puntos
 *   generales y cada participante recibe los de sus tareas. El trabajo
 *   conserva su categoría original (`category` no cambia nunca aquí: se usa
 *   para los puntos, no se reescribe).
 *
 * Un trabajo desglosado cuyas tareas son todas de la misma persona entra
 * también por la rama de las tareas: es lo único que evita contar dos veces
 * el mismo trabajo humano, que es justo lo que RN-ASG-14 impide al decir
 * que "los puntos generales del trabajo dejan de sumar".
 */
export function calculateActiveLoadPoints(
  jobs: readonly ActiveJobLoad[],
  tasks: readonly ActiveTaskLoad[],
): number {
  const jobPoints = jobs
    .filter((job) => !job.isBrokenIntoTasks)
    .reduce((total, job) => total + JOB_LOAD_POINTS[job.category], 0);

  const taskPoints = tasks.reduce((total, task) => total + TASK_LOAD_POINTS[task.weight], 0);

  return jobPoints + taskPoints;
}

/**
 * HU-21: cómo se reparten los puntos de un trabajo desglosado. Devuelve los
 * puntos que recibe cada participante — la suma **no** tiene por qué
 * coincidir con los puntos generales del trabajo, y eso es correcto:
 * RN-ASG-14 no reparte los puntos del trabajo entre las tareas, sino que
 * los sustituye por los de las tareas (un trabajo grande desglosado en dos
 * tareas ligeras suma 2, no 10 — miden cosas distintas: la categoría mide
 * el cambio, la tarea mide el trabajo humano de ese paso).
 */
export function distributeTaskPoints(
  tasks: readonly (ActiveTaskLoad & { readonly assigneeId: string })[],
): ReadonlyMap<string, number> {
  const perAssignee = new Map<string, number>();
  for (const task of tasks) {
    perAssignee.set(task.assigneeId, (perAssignee.get(task.assigneeId) ?? 0) + TASK_LOAD_POINTS[task.weight]);
  }
  return perAssignee;
}
