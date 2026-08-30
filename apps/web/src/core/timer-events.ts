/**
 * `src/core/timer-events.ts` — recálculo de los tres contadores (T1, T2 y
 * T3, RN-SLA) a partir de su historial de `timer_events` (PRD §8,
 * "Implementación"). Lógica de dominio pura, igual que `business-clock`:
 * el tiempo consumido se recalcula sumando eventos, nunca guardando un
 * contador mutable — este módulo es precisamente ese cálculo.
 *
 * CA-10: recalcular desde cero a partir de los mismos `timer_events` debe
 * dar siempre el mismo resultado. Como esta función no lee ni escribe
 * ningún estado propio (todo lo que necesita llega por parámetro), esa
 * propiedad es consecuencia directa de ser una función pura.
 */
import { businessMinutesBetween, type WorkCalendar } from "./business-clock";

/** Arranque, pausa, reanudación y parada — las cuatro filas posibles en `timer_events`. */
export type TimerEventType = "started" | "paused" | "resumed" | "stopped";

export type TimerEvent = {
  readonly type: TimerEventType;
  readonly occurredAt: Date;
};

/**
 * Minutos laborables consumidos por un contador a partir de su historial
 * de eventos, en el calendario dado (RN-CLK-10: debe ser la fotografía
 * del calendario vigente cuando ocurrió cada tramo, no el calendario
 * actual del espacio — eso lo decide quien llama, pasando el `calendar`
 * correcto).
 *
 * - `started`/`resumed` abren un tramo en marcha.
 * - `paused`/`stopped` lo cierran y suman los minutos laborables de ese
 *   tramo (RN-SLA-14: durante una pausa no se consume tiempo).
 * - Si el historial termina con un tramo todavía abierto (sin `stopped`
 *   posterior), se cuenta hasta `measuredAt` — el contador sigue vivo.
 *
 * Los eventos se ordenan por `occurredAt` antes de sumar: da igual en qué
 * orden lleguen de la base de datos, el resultado es el mismo (CA-10).
 */
export function recalculateElapsedBusinessMinutes(
  events: readonly TimerEvent[],
  calendar: WorkCalendar,
  measuredAt: Date,
): number {
  const ordered = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  let totalMinutes = 0;
  let runningSince: Date | null = null;

  for (const event of ordered) {
    switch (event.type) {
      case "started":
      case "resumed":
        runningSince = event.occurredAt;
        break;
      case "paused":
      case "stopped":
        if (runningSince) {
          totalMinutes += businessMinutesBetween(runningSince, event.occurredAt, calendar);
          runningSince = null;
        }
        break;
    }
  }

  if (runningSince) {
    totalMinutes += businessMinutesBetween(runningSince, measuredAt, calendar);
  }

  return totalMinutes;
}
