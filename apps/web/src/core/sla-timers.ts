/**
 * `src/core/sla-timers.ts` — duración y estado de los tres contadores (PRD
 * §8 RN-SLA). Lógica de dominio pura, sin Supabase, sin Next.js, sin React
 * (CLAUDE.md). Los avisos por porcentaje (RN-SLA-10/15) necesitan un canal
 * de notificaciones que todavía no existe (Hito 8, RN-NOT) — este módulo
 * solo calcula los números de los que esos avisos partirán, para que los
 * contadores sean un dato real y verificable, no una promesa sin cálculo
 * detrás.
 *
 * "Nunca se mezclan" (PRD §8): T1 (primera atención), T2 (inicio operativo)
 * y T3 (ejecución) son tres relojes distintos con arranques, pausas y
 * paradas propios. Comparten el cálculo de minutos laborables y el
 * recálculo desde `timer_events` (CA-10), no su duración ni sus umbrales.
 */

import { eventsSinceLastStart, recalculateElapsedBusinessMinutes, type TimerEvent } from "./timer-events";
import type { WorkCalendar } from "./business-clock";
import type { ChangeCategory } from "./consumption-ledger";
import type { JobState } from "./job-states";

/**
 * RN-SLA-02: 48 h laborables para Básico o un establecimiento sin plan de
 * mantenimiento (RN-COM-12); 24 h laborables para Impulso y Premium.
 *
 * La tabla `plans` guarda `start_sla_hours` con estos mismos números
 * (semilla de Restavor, Hito 2) y `subscriptions` (Hito 5) dice qué plan
 * tiene vigente cada establecimiento: quien llame a esta función en el
 * servidor debe leer ese valor de la suscripción activa del
 * establecimiento — nunca decidirlo en el cliente ni suponerlo. Sin
 * suscripción de plan activa, `hasAcceleratedSla` es `false` (RN-COM-12:
 * un establecimiento sin plan se comporta como Básico, 48 h).
 */
export function t1DurationHours(hasAcceleratedSla: boolean): number {
  return hasAcceleratedSla ? 24 : 48;
}

/** RN-SLA-10: los tres umbrales de aviso de T1. */
export const T1_WARNING_THRESHOLDS_PERCENT = [50, 80, 100] as const;

/**
 * Estado de un contador en un instante dado. `overdue` es la condición
 * calculada "Fuera de plazo" (RN-SLA-17, CA-14): nunca se guarda como
 * estado, siempre se deriva de los eventos.
 */
export type CounterStatus = {
  readonly elapsedMinutes: number;
  readonly totalMinutes: number;
  readonly remainingMinutes: number;
  readonly percentUsed: number;
  readonly overdue: boolean;
};

/** Nombre histórico del tipo, conservado desde el Hito 4. */
export type T1Status = CounterStatus;

function counterStatus(elapsedMinutes: number, totalMinutes: number): CounterStatus {
  const percentUsed = totalMinutes === 0 ? 0 : (elapsedMinutes / totalMinutes) * 100;
  return {
    elapsedMinutes,
    totalMinutes,
    remainingMinutes: Math.max(totalMinutes - elapsedMinutes, 0),
    percentUsed,
    overdue: elapsedMinutes > totalMinutes,
  };
}

/**
 * Estado actual de T1 a partir de su historial de `timer_events`
 * (mismo principio que T2/T3: se recalcula sumando eventos, nunca se lee un
 * contador mutable — CA-10).
 */
export function t1Status(
  events: readonly TimerEvent[],
  calendar: WorkCalendar,
  measuredAt: Date,
  hasAcceleratedSla: boolean,
): CounterStatus {
  const elapsedMinutes = recalculateElapsedBusinessMinutes(events, calendar, measuredAt);
  return counterStatus(elapsedMinutes, t1DurationHours(hasAcceleratedSla) * 60);
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
  return crossesThreshold(previousPercent, currentPercent, threshold);
}

/** Igual que `crossesT1Threshold`, para cualquiera de los tres contadores. */
export function crossesThreshold(previousPercent: number, currentPercent: number, threshold: number): boolean {
  return previousPercent < threshold && currentPercent >= threshold;
}

// ---------------------------------------------------------------------
// T2 — Inicio operativo (RN-SLA-05 a 10, Hito 6).
// ---------------------------------------------------------------------

/**
 * RN-SLA-06: "duración = la misma que T1 según el plan (48 h / 24 h)". Se
 * delega en `t1DurationHours` a propósito: si algún día cambia, cambia en
 * un único sitio, que es lo que dice la regla.
 */
export function t2DurationHours(hasAcceleratedSla: boolean): number {
  return t1DurationHours(hasAcceleratedSla);
}

/** RN-SLA-10: avisos al 50 %, 80 % y 100 % del plazo. */
export const T2_WARNING_THRESHOLDS_PERCENT = [50, 80, 100] as const;

/**
 * RN-SLA-10: alerta importante a responsable, supervisor y propietario
 * cuando quedan **2 h laborables**, y sugerencia de reasignación cuando
 * queda **1 h**. En minutos laborables, la unidad del reloj (RN-CLK-04).
 */
export const T2_CRITICAL_ALERT_REMAINING_MINUTES = 120;
export const T2_REASSIGNMENT_SUGGESTION_REMAINING_MINUTES = 60;

/**
 * Estado actual de T2 (RN-SLA-05 a 09). A diferencia de T1 y T3, solo
 * cuenta el tramo abierto por el **último** arranque
 * (`eventsSinceLastStart`): RN-SLA-08 exige que una nueva aceptación del
 * cliente reinicie T2 desde cero conservando todos los intentos anteriores,
 * y RN-SLA-09 que una reasignación **no** lo reinicie — que es exactamente
 * lo que ocurre porque una reasignación no escribe ningún `started` nuevo
 * (CA-12).
 */
export function t2Status(
  events: readonly TimerEvent[],
  calendar: WorkCalendar,
  measuredAt: Date,
  hasAcceleratedSla: boolean,
): CounterStatus {
  const elapsedMinutes = recalculateElapsedBusinessMinutes(eventsSinceLastStart(events), calendar, measuredAt);
  return counterStatus(elapsedMinutes, t2DurationHours(hasAcceleratedSla) * 60);
}

/** RN-SLA-10: ¿toca la alerta de las 2 h laborables restantes? */
export function needsT2CriticalAlert(status: CounterStatus): boolean {
  return status.remainingMinutes <= T2_CRITICAL_ALERT_REMAINING_MINUTES;
}

/** RN-SLA-10: ¿toca sugerir una reasignación (1 h laborable restante)? */
export function suggestsT2Reassignment(status: CounterStatus): boolean {
  return status.remainingMinutes <= T2_REASSIGNMENT_SUGGESTION_REMAINING_MINUTES;
}

// ---------------------------------------------------------------------
// T3 — Ejecución (RN-SLA-11 a 17, Hito 6).
// ---------------------------------------------------------------------

/**
 * RN-SLA-12, columna "máximo operativo interno": pequeño, fotográfico y
 * mediano 72 h laborables; grande 120 h laborables. El rango que se muestra
 * al cliente (1–3 o 3–5 días laborables, RN-SLA-16) es otra cosa y no se
 * calcula aquí: el cliente ve rangos o fechas aproximadas, y propietario,
 * administradores y responsable ven este contador exacto.
 */
export function t3DurationHours(category: ChangeCategory): number {
  return category === "large" ? 120 : 72;
}

/** RN-SLA-15: avisos al 75 %, 90 % y 100 %. */
export const T3_WARNING_THRESHOLDS_PERCENT = [75, 90, 100] as const;

/**
 * Estado actual de T3 (RN-SLA-11 a 15). Los tramos pausados por un bloqueo
 * o una pausa autorizada no consumen tiempo (RN-SLA-14) porque
 * `recalculateElapsedBusinessMinutes` solo suma los tramos en marcha: al
 * reanudar, el tiempo restante es exactamente el que había (CA-13).
 */
export function t3Status(
  events: readonly TimerEvent[],
  calendar: WorkCalendar,
  measuredAt: Date,
  category: ChangeCategory,
): CounterStatus {
  const elapsedMinutes = recalculateElapsedBusinessMinutes(events, calendar, measuredAt);
  return counterStatus(elapsedMinutes, t3DurationHours(category) * 60);
}

// ---------------------------------------------------------------------
// "Fuera de plazo" (RN-SLA-17, CA-14).
// ---------------------------------------------------------------------

/**
 * RN-SLA-17 · CA-14: "Fuera de plazo" es una **condición calculada**, no un
 * estado — puede coexistir con En curso, Bloqueado o cualquier otro. Por
 * eso esta función devuelve el estado del trabajo **sin tocarlo** junto a
 * la condición: nada en Cuotly guarda "fuera de plazo" como estado, ni lo
 * sustituye por el estado real del trabajo.
 *
 * Qué contador manda depende del estado: antes de Comenzar el plazo vivo es
 * T2 (RN-SLA-05/07); a partir de Comenzar, T3 (RN-SLA-11). Un trabajo
 * bloqueado o en pausa autorizada sigue midiéndose con T3, que está pausado
 * —  y puede estar fuera de plazo si ya lo estaba al pausarse (RN-SLA-14
 * conserva el tiempo restante exacto, no perdona el retraso acumulado).
 */
export type JobDeadlineCondition = {
  readonly state: JobState;
  readonly outOfDeadline: boolean;
  /** Qué contador decide la condición en este estado, o `null` si ninguno. */
  readonly counter: "t2" | "t3" | null;
};

export function jobDeadlineCondition(
  state: JobState,
  counters: { readonly t2?: CounterStatus; readonly t3?: CounterStatus },
): JobDeadlineCondition {
  switch (state) {
    case "pending_assignment":
      // RN-ASG-05: sin responsable no hay plazo de inicio en marcha; las
      // alertas de un trabajo sin asignar son otra cosa (Hito 8).
      return { state, outOfDeadline: false, counter: null };

    case "assigned":
    case "reassignment_requested":
      return { state, outOfDeadline: counters.t2?.overdue ?? false, counter: "t2" };

    case "in_progress":
    case "blocked_by_client":
    case "authorized_pause":
      return { state, outOfDeadline: counters.t3?.overdue ?? false, counter: "t3" };

    case "in_correction":
    case "published":
    case "completed":
    case "cancelled_before_start":
    case "cancelled_after_start":
      // RN-SLA-13: T3 se detiene al publicar. A partir de ahí el trabajo ya
      // no puede quedarse fuera de plazo, aunque su historial conserve si
      // lo estuvo. `in_correction` entra aquí por lo mismo: una corrección
      // es posterior a la publicación y el PRD no define ningún contador
      // para ella (ver job-states.ts), así que resucitar el T3 congelado
      // haría que "Fuera de plazo" parpadeara al entrar y salir de
      // corrección.
      return { state, outOfDeadline: false, counter: null };
  }
}
