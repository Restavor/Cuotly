/**
 * `src/core/home.ts` — qué necesita atención en el Inicio del espacio
 * (PRD §20.4). Lógica de dominio pura: sin Supabase, sin Next.js, sin
 * React (CLAUDE.md, regla de estilo de código).
 *
 * Este módulo NO define ningún umbral nuevo. "Próximo a vencer" suena a
 * número inventado, y CLAUDE.md prohíbe inventarlos, así que se compone
 * con los tres que el PRD ya da:
 *
 *   · **RN-SLA-10** — la alerta importante de T2 salta cuando quedan **2 h
 *     laborables** para tener que comenzar. Ese es el momento en el que el
 *     propio PRD dice que el plazo de inicio está en riesgo, y es el que
 *     usa `needsT2CriticalAlert()`.
 *   · **RN-SLA-15** — los avisos de T3 son al 75 %, 90 % y 100 %. El
 *     último antes de agotarse es el 90 %: ese es el riesgo de ejecución.
 *   · **RN-SLA-17** — "Fuera de plazo" es una condición calculada que
 *     convive con el estado, nunca lo sustituye (CA-14).
 *
 * Qué contador manda en cada estado no se decide aquí tampoco: lo dice
 * `jobDeadlineCondition()` de `sla-timers.ts`, que es la única definición
 * del proyecto. Un trabajo sin asignar no tiene plazo en marcha
 * (RN-ASG-05), y por eso aparece en el Inicio por otra razón —nadie lo ha
 * asumido— y no por su reloj.
 */

import {
  jobDeadlineCondition,
  needsT2CriticalAlert,
  T3_WARNING_THRESHOLDS_PERCENT,
  type CounterStatus,
} from "./sla-timers";
import { FINISHED_JOB_STATES, JOB_STATES, type JobState } from "./job-states";
import { REQUEST_STATES, type RequestState } from "./request-states";

/**
 * El último aviso de T3 antes de agotarse (RN-SLA-15). Se toma de la lista
 * de umbrales en vez de escribir `90`: si el PRD cambiara los avisos,
 * cambiaría con ellos en vez de quedarse con un número huérfano.
 */
const T3_RISK_PERCENT =
  T3_WARNING_THRESHOLDS_PERCENT[T3_WARNING_THRESHOLDS_PERCENT.length - 2];

export type DeadlineRisk = "out_of_deadline" | "about_to_expire" | "none";

export type JobDeadlineRisk = {
  readonly risk: DeadlineRisk;
  /** Qué contador lo decide, o `null` si en este estado no corre ninguno. */
  readonly counter: "t2" | "t3" | null;
  /** Minutos laborables que quedan, para poder decirlo en pantalla. */
  readonly remainingMinutes: number | null;
};

/**
 * RN-SLA-10, RN-SLA-15 y RN-SLA-17 · en qué situación está el plazo vivo
 * de un trabajo.
 *
 * "Fuera de plazo" gana siempre: un trabajo que ya se pasó no es un
 * trabajo "a punto de", y contarlo como aviso lo escondería entre los que
 * todavía llegan a tiempo.
 */
export function jobDeadlineRisk(
  state: JobState,
  counters: { readonly t2?: CounterStatus; readonly t3?: CounterStatus },
): JobDeadlineRisk {
  const condition = jobDeadlineCondition(state, counters);
  if (condition.counter === null) {
    return { risk: "none", counter: null, remainingMinutes: null };
  }

  const status = condition.counter === "t2" ? counters.t2 : counters.t3;
  if (status === undefined) {
    return { risk: "none", counter: condition.counter, remainingMinutes: null };
  }

  const base = { counter: condition.counter, remainingMinutes: status.remainingMinutes } as const;

  if (status.overdue) return { ...base, risk: "out_of_deadline" };

  const enRiesgo =
    condition.counter === "t2"
      ? needsT2CriticalAlert(status)
      : status.percentUsed >= T3_RISK_PERCENT;

  return { ...base, risk: enRiesgo ? "about_to_expire" : "none" };
}

/** El KPI de §20.4: cuántos trabajos tienen el plazo en riesgo o agotado. */
export function countJobsAtDeadlineRisk(
  jobs: readonly { readonly risk: DeadlineRisk }[],
): number {
  return jobs.filter((j) => j.risk !== "none").length;
}

// ---------------------------------------------------------------------
// "Necesita atención" — la lista central del Inicio.
// ---------------------------------------------------------------------

/**
 * Por qué una fila está en la lista. El orden de esta declaración ES la
 * prioridad con la que se pintan, y no es casual:
 *
 *   1. Lo que ya se ha pasado de plazo (RN-SLA-17): es lo único que ya
 *      cuesta dinero y confianza.
 *   2. Lo que está a punto (RN-SLA-10/15): todavía se llega.
 *   3. Lo que nadie ha asumido (RN-ASG-05): el reloj de inicio ni siquiera
 *      ha arrancado, y arranca al asignar.
 *   4. Lo que espera una decisión del equipo (RN-CLS-03: validar la
 *      clasificación) o del restaurante (una corrección pedida, RN-COR).
 *   5. Lo que espera al restaurante (RN-JOB-06, bloqueado): no depende del
 *      equipo, pero conviene verlo.
 */
export const ATTENTION_KINDS = [
  "job_out_of_deadline",
  "job_about_to_expire",
  "job_pending_assignment",
  "request_pending_validation",
  "request_correction_requested",
  "job_blocked_by_client",
] as const;

export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export interface AttentionItem {
  readonly kind: AttentionKind;
  readonly id: string;
  /** Lo que se lee en grande: la descripción de la solicitud o el código. */
  readonly title: string;
  /** El restaurante del que es, o `null` si la pantalla no lo sabe. */
  readonly establishment: string | null;
  /**
   * El identificador de ese restaurante. El nombre sirve para leerlo; este
   * sirve para agrupar, y son cosas distintas: dos restaurantes de grupos
   * distintos pueden llamarse igual, y agrupar por nombre los fundiría en
   * una fila (§20.2, columna "Necesita atención" del listado).
   */
  readonly establishmentId: string | null;
  readonly deepLink: string;
  /** Minutos laborables restantes, cuando la fila viene de un contador. */
  readonly remainingMinutes: number | null;
  /**
   * Qué contador la ha puesto aquí, o `null` si no viene de ninguno. Sin
   * esto no se puede escribir el aviso: "quedan 2 h" para comenzar
   * (RN-SLA-05) y para entregar (RN-SLA-11) son dos frases distintas, y
   * decir la que no es engaña sobre lo que hay que hacer.
   */
  readonly counter: "t2" | "t3" | null;
}

/**
 * El orden de "Necesita atención": primero por motivo, y dentro del mismo
 * motivo, primero lo que menos tiempo tiene.
 *
 * Es determinista a propósito, hasta el desempate por identificador: una
 * lista que cambia de orden entre dos recargas sin que haya cambiado nada
 * hace que quien la mira desconfíe de ella, y esta lista solo sirve si se
 * la cree.
 */
export function sortAttentionItems(
  items: readonly AttentionItem[],
): readonly AttentionItem[] {
  const prioridad = new Map(ATTENTION_KINDS.map((kind, index) => [kind, index]));

  return [...items].sort((a, b) => {
    const porMotivo = prioridad.get(a.kind)! - prioridad.get(b.kind)!;
    if (porMotivo !== 0) return porMotivo;

    // Sin contador no hay "menos tiempo": esas filas van detrás de las que
    // sí lo tienen, no delante por valer `null`.
    const ta = a.remainingMinutes ?? Number.POSITIVE_INFINITY;
    const tb = b.remainingMinutes ?? Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Minutos laborables restantes, partidos en horas y minutos para poder
 * escribirlos. Se redondea hacia abajo: decir "quedan 2 h" cuando quedan
 * 2 h 59 min es optimista, y en un plazo el optimismo se paga.
 */
export function splitRemaining(minutes: number): {
  readonly hours: number;
  readonly minutes: number;
} {
  const enteros = Math.max(0, Math.floor(minutes));
  return { hours: Math.floor(enteros / 60), minutes: enteros % 60 };
}

// ---------------------------------------------------------------------
// Los contadores del resumen (§20.4).
// ---------------------------------------------------------------------

/**
 * "Solicitudes pendientes" del resumen: las que están abiertas y esperando
 * a alguien antes de que empiece el trabajo (PRD §9.2).
 *
 * Se deriva, no se escribe a mano: es todo lo que no es borrador —una
 * solicitud sin enviar no está pendiente de nadie, RN-REQ-01—, no ha
 * llegado todavía a `accepted` y no ha terminado. Escribir la lista a mano
 * sería la enésima copia de los estados que se queda desfasada (salvedad
 * 18 del ROADMAP), así que se calcula desde `REQUEST_STATES` y el corte
 * está en la aceptación: a partir de ahí lo que hay es un trabajo, y los
 * trabajos se cuentan aparte.
 */
const OPEN_BEFORE_ACCEPTANCE: readonly RequestState[] = REQUEST_STATES.slice(
  REQUEST_STATES.indexOf("received"),
  REQUEST_STATES.indexOf("accepted"),
);

export const PENDING_REQUEST_STATES: readonly RequestState[] = OPEN_BEFORE_ACCEPTANCE;

/** Los estados de trabajo que siguen vivos en la operación diaria. */
export const OPEN_JOB_STATES: readonly JobState[] = JOB_STATES.filter(
  (state) => !FINISHED_JOB_STATES.includes(state),
);

// ---------------------------------------------------------------------
// Fechas de la actividad reciente.
// ---------------------------------------------------------------------

/**
 * El día natural de un instante **en la zona horaria del espacio**, como
 * `AAAA-MM-DD` (CLAUDE.md: "las fechas se calculan en la zona horaria del
 * espacio", RN-CLK-06).
 *
 * `en-CA` no es un capricho: es la única configuración regional que
 * `Intl` formatea ya en ese orden, así que la clave sale ordenable sin
 * recomponerla a mano a partir de las partes.
 */
export function dayKeyInTimeZone(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export type DayDistance = "today" | "yesterday" | "older";

/**
 * Si un instante cae hoy, ayer o antes, contado en días naturales del
 * espacio y no en horas transcurridas: a las 00:30 de un martes, algo de
 * las 23:50 del lunes es "ayer" aunque hayan pasado cuarenta minutos.
 * Contarlo por horas diría "hoy", que es justo lo que confunde a quien lo
 * lee.
 */
export function dayDistance(at: Date, now: Date, timeZone: string): DayDistance {
  const clave = dayKeyInTimeZone(at, timeZone);
  if (clave === dayKeyInTimeZone(now, timeZone)) return "today";

  const ayer = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (clave === dayKeyInTimeZone(ayer, timeZone)) return "yesterday";

  return "older";
}
