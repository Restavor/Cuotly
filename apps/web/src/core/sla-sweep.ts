/**
 * `src/core/sla-sweep.ts` — qué avisos de plazo tocan ahora mismo (PRD §18,
 * filas de T2 y T3; RN-SLA-10 y RN-SLA-15).
 *
 * Lógica de dominio pura, sin Supabase, sin red (CLAUDE.md). El barrido que
 * la usa vive en `src/services/queue-runner.ts`, que es el adaptador.
 *
 * No lleva memoria de qué se avisó ya, a propósito: la unicidad la impone
 * la base de datos con la clave de deduplicación de `emit_notification()`
 * (RN-NOT-05 y CA-17), igual que en el resto del sistema. Si este módulo
 * llevara su propia lista, habría dos verdades y la de aquí sería la que
 * dos procesos a la vez podrían saltarse.
 */

import type { NotificationEvent } from "./notifications";
import {
  T2_WARNING_THRESHOLDS_PERCENT,
  T3_WARNING_THRESHOLDS_PERCENT,
  needsT2CriticalAlert,
  suggestsT2Reassignment,
  type CounterStatus,
} from "./sla-timers";

export interface SlaNotification {
  readonly event: NotificationEvent;
  /** El porcentaje va en la clave de deduplicación: 50 y 80 son avisos distintos. */
  readonly thresholdPercent: number | null;
}

/**
 * RN-SLA-10: avisos al 50 %, 80 % y 100 % del plazo de inicio, más la
 * alerta con 2 h laborables restantes y la sugerencia de reasignación con
 * 1 h. Las dos últimas son de tiempo restante, no de porcentaje: con un
 * plazo de 48 h laborables, el 100 % y las 2 h restantes no son el mismo
 * momento ni de lejos.
 */
export function t2NotificationsDue(status: CounterStatus): readonly SlaNotification[] {
  const due: SlaNotification[] = [];

  for (const threshold of T2_WARNING_THRESHOLDS_PERCENT) {
    if (status.percentUsed >= threshold) {
      due.push({ event: `t2_threshold_${threshold}` as NotificationEvent, thresholdPercent: threshold });
    }
  }

  if (needsT2CriticalAlert(status)) {
    due.push({ event: "t2_critical_alert", thresholdPercent: null });
  }
  if (suggestsT2Reassignment(status)) {
    due.push({ event: "t2_reassignment_suggestion", thresholdPercent: null });
  }

  return due;
}

/** RN-SLA-15: avisos al 75 %, 90 % y 100 % del plazo de ejecución. */
export function t3NotificationsDue(status: CounterStatus): readonly SlaNotification[] {
  return T3_WARNING_THRESHOLDS_PERCENT.filter((t) => status.percentUsed >= t).map((threshold) => ({
    event: `t3_threshold_${threshold}` as NotificationEvent,
    thresholdPercent: threshold,
  }));
}

export function slaNotificationsDue(
  counterKind: "t2" | "t3",
  status: CounterStatus,
): readonly SlaNotification[] {
  return counterKind === "t2" ? t2NotificationsDue(status) : t3NotificationsDue(status);
}
