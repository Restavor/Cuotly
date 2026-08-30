/**
 * `src/core/sla-timers.ts` — duración y estado de T1 (PRD §8 RN-SLA-01 a
 * 04). Lógica de dominio pura, sin Supabase, sin Next.js, sin React
 * (CLAUDE.md). Los avisos por porcentaje (RN-SLA-10) necesitan un canal
 * de notificaciones que todavía no existe (Hito 8, RN-NOT) — este módulo
 * solo calcula los números de los que esos avisos partirán, para que "T1
 * en marcha" (ROADMAP, Hito 4) sea un dato real y verificable, no una
 * promesa sin cálculo detrás.
 */

import { recalculateElapsedBusinessMinutes, type TimerEvent } from "./timer-events";
import type { WorkCalendar } from "./business-clock";

/**
 * RN-SLA-02: 48 h laborables para Básico o un establecimiento sin plan de
 * mantenimiento (RN-COM-12); 24 h laborables para Impulso y Premium.
 *
 * La tabla `plans` ya guarda `start_sla_hours` con estos mismos números
 * (semilla de Restavor, Hito 2) — quien llame a esta función en el
 * servidor debe leer ese valor de la suscripción vigente del
 * establecimiento en cuanto exista `subscriptions` (Hito 5). Hasta
 * entonces no hay forma de saber qué plan tiene un establecimiento, así
 * que el llamador pasa `hasAcceleratedSla=false` (se le trata como
 * Básico/sin plan, el caso que no falla nunca por exceso: nunca corta un
 * plazo antes de tiempo) y dejará un comentario junto a esa llamada
 * apuntando a este mismo sitio.
 */
export function t1DurationHours(hasAcceleratedSla: boolean): number {
  return hasAcceleratedSla ? 24 : 48;
}

/** RN-SLA-10: los tres umbrales de aviso de T1. */
export const T1_WARNING_THRESHOLDS_PERCENT = [50, 80, 100] as const;

export type T1Status = {
  readonly elapsedMinutes: number;
  readonly totalMinutes: number;
  readonly percentUsed: number;
  readonly overdue: boolean;
};

/**
 * Estado actual de T1 a partir de su historial de `timer_events`
 * (mismo principio que T2/T3 en `timer-events.ts`: se recalcula sumando
 * eventos, nunca se lee un contador mutable — CA-10).
 */
export function t1Status(
  events: readonly TimerEvent[],
  calendar: WorkCalendar,
  measuredAt: Date,
  hasAcceleratedSla: boolean,
): T1Status {
  const elapsedMinutes = recalculateElapsedBusinessMinutes(events, calendar, measuredAt);
  const totalMinutes = t1DurationHours(hasAcceleratedSla) * 60;
  const percentUsed = totalMinutes === 0 ? 0 : (elapsedMinutes / totalMinutes) * 100;
  return { elapsedMinutes, totalMinutes, percentUsed, overdue: elapsedMinutes > totalMinutes };
}

/**
 * RN-SLA-10: ¿el paso de `previousPercent` a `currentPercent` cruza el
 * umbral `threshold`? Sirve para decidir, sin duplicar avisos, si toca
 * disparar la notificación de un umbral en un recálculo dado (Hito 8:
 * quien recorra los `timer_events` nuevos entre dos instantes puede
 * llamar a esto una vez por umbral en vez de comparar "¿ya pasé el 50%?"
 * a mano en cada sitio).
 */
export function crossesT1Threshold(previousPercent: number, currentPercent: number, threshold: number): boolean {
  return previousPercent < threshold && currentPercent >= threshold;
}
