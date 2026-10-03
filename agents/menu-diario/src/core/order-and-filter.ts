/**
 * `src/core/order-and-filter.ts` · RA-01, en qué orden se publica (PRD §7.1, que sigue en pie con la decisión 154).
 *
 * La web tiene un solo hueco para la imagen del menú. En cada ejecución:
 *   - solo se consideran las tareas `ready` cuya hora (`publishFrom`) ya ha llegado;
 *   - se procesan por fecha del menú ascendente (desempate: creación y luego id);
 *   - una tarea cuya fecha ya ha pasado no se publica (`date_in_past`; se vuelve a comprobar aquí, no solo al
 *     crear la tarea: publicar el menú de ayer tapando el de hoy sería peor que un aviso);
 *   - una tarea no se publica si el mismo restaurante tiene otra con fecha POSTERIOR ya publicada o en curso
 *     (`later_day_already_published`). Con la decisión 154 casi no se usa, porque ya no se publica nada antes de su
 *     día: se conserva como red de seguridad.
 *
 * Misma fecha NO bloquea: así una republicación del mismo día (uno a las 8:00 y otro a las 9:00) se publica.
 *
 * Pura: no muta la entrada, el resultado no depende del orden en que lleguen las tareas y el reloj es un dato.
 */
import { tryLocalDateOf, type LocalDate, type TimeInputError } from "./local-time.ts";
import { err, ok, type Result } from "./result.ts";
import { WEB_OCCUPYING_STATES, type TaskState } from "./task-state.ts";

export type OrderTask = {
  id: string;
  establishmentId: string;
  targetDate: LocalDate;
  state: TaskState;
  /** Desde cuándo toca publicar (RA-01, `computePublishFrom`). */
  publishFrom: Date;
  createdAt: Date;
};

export type OrderReason = "date_in_past" | "later_day_already_published";

export type OrderDecision<T extends OrderTask> =
  | { task: T; action: "publish" }
  | { task: T; action: "report_error"; reason: OrderReason; blockedBy?: string };

export type OrderContext = { now: Date; timeZone: string };

function byProcessingOrder(a: OrderTask, b: OrderTask): number {
  if (a.targetDate !== b.targetDate) return a.targetDate < b.targetDate ? -1 : 1;
  const byCreation = a.createdAt.getTime() - b.createdAt.getTime();
  if (byCreation !== 0) return byCreation;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function orderAndFilter<T extends OrderTask>(
  tasks: readonly T[],
  context: OrderContext,
): Result<readonly OrderDecision<T>[], TimeInputError> {
  const today = tryLocalDateOf(context.now, context.timeZone);
  if (!today.ok) return err(today.error);

  const nowMs = context.now.getTime();
  const candidates = tasks
    .filter((t) => t.state === "ready" && t.publishFrom.getTime() <= nowMs)
    .sort(byProcessingOrder);

  const decisions = candidates.map((task): OrderDecision<T> => {
    if (task.targetDate < today.value) {
      return { task, action: "report_error", reason: "date_in_past" };
    }
    // La tarea con fecha posterior que ocupa la web; si hay varias, la de fecha más lejana (desempate por id).
    let blocker: T | undefined;
    for (const other of tasks) {
      if (other.establishmentId !== task.establishmentId) continue;
      if (other.targetDate <= task.targetDate) continue;
      if (!WEB_OCCUPYING_STATES.includes(other.state)) continue;
      if (
        blocker === undefined ||
        other.targetDate > blocker.targetDate ||
        (other.targetDate === blocker.targetDate && other.id < blocker.id)
      ) {
        blocker = other;
      }
    }
    if (blocker) {
      return { task, action: "report_error", reason: "later_day_already_published", blockedBy: blocker.id };
    }
    return { task, action: "publish" };
  });

  return ok(decisions);
}
