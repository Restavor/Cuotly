/**
 * `src/core/job-execution.ts` — lo que la ficha de un trabajo afirma sobre
 * su ejecución: cuánto lleva desglosado y cuándo se espera que termine
 * (maqueta 06 · "Trabajos — ejecución").
 *
 * Las dos preguntas parecen de presentación y no lo son. "Tareas (2/4)"
 * decide qué cuenta como trabajo pendiente, y "Fecha estimada de fin" es
 * una AFIRMACIÓN sobre el futuro: en cuanto el contador está en pausa deja
 * de ser cierta, porque el tiempo restante se conserva y la fecha se
 * desplaza sola (RN-JOB-08, RN-SLA-14). Decir una fecha ahí sería mentir
 * sin que fallara nada, que es exactamente lo que CA-20 prohíbe.
 *
 * Por eso las dos viven aquí: sin React, sin Supabase y con tests.
 */
import type { JobState } from "./job-states";

/** Lo que hace falta de una tarea para contarla. Nada más. */
export interface CountableTask {
  readonly state: string;
}

/**
 * El desglose, contado (§14.4, HU-21).
 *
 * Una tarea **cancelada no cuenta en ninguno de los dos números**. No es
 * un detalle: si contara en el total, un trabajo con dos tareas hechas y
 * dos canceladas se leería "2/4" y parecería a medias cuando en realidad
 * no queda nada por hacer. RN-ASG-13 ya trata lo cancelado como algo que
 * deja de sumar, y el recuento de la pantalla dice lo mismo.
 */
export interface TaskProgress {
  readonly done: number;
  readonly total: number;
}

export function taskProgress(tasks: readonly CountableTask[]): TaskProgress {
  const vivas = tasks.filter((task) => task.state !== "cancelled");
  return {
    done: vivas.filter((task) => task.state === "completed").length,
    total: vivas.length,
  };
}

/**
 * Qué se puede afirmar sobre el fin de un trabajo.
 *
 * Es una unión y no una fecha opcional a propósito: un `null` obligaría a
 * la pantalla a inventarse el motivo, y los motivos son distintos entre sí
 * —no ha empezado, está en pausa, ya terminó, se canceló— y el que toque
 * es justo lo que quien mira necesita leer (CA-20).
 */
export type JobEnd =
  /** Publicado: ya no es una estimación, es la fecha en que ocurrió. */
  | { readonly kind: "published"; readonly at: Date }
  /** El contador corre: la fecha sale del plazo que queda (RN-SLA-11). */
  | { readonly kind: "estimated"; readonly at: Date }
  /** RN-JOB-08 / RN-SLA-14: en pausa el tiempo restante se conserva y la fecha se moverá. */
  | { readonly kind: "paused" }
  /** T3 todavía no ha arrancado: arranca al pulsar Comenzar (RN-JOB-03). */
  | { readonly kind: "not_started" }
  /** Cancelado: no hay fin que estimar. */
  | { readonly kind: "cancelled" }
  /** Sin categoría validada no hay plazo de ejecución que calcular (RN-SLA-12). */
  | { readonly kind: "no_deadline" };

/**
 * Estados en los que el trabajo ya se publicó. `in_correction` está dentro
 * porque solo se llega a él DESDE `published` (RN-COR-02): la corrección
 * ocurre sobre algo que ya está publicado, así que la fecha de publicación
 * existe y sigue siendo la buena.
 */
const PUBLISHED_STATES: readonly JobState[] = ["published", "in_correction", "completed"];

const PAUSED_STATES: readonly JobState[] = ["blocked_by_client", "authorized_pause"];

const CANCELLED_STATES: readonly JobState[] = ["cancelled_before_start", "cancelled_after_start"];

/**
 * La fecha de fin de un trabajo, o el motivo por el que no hay ninguna.
 *
 * `deadlineAt` lo calcula quien llama con el reloj laborable del espacio
 * (`addBusinessMinutes`), porque los festivos y el horario son del espacio
 * y no de esta función. Aquí solo se decide **cuál de los seis casos** es,
 * que es la parte que se puede equivocar en silencio.
 */
export function jobEnd(input: {
  readonly state: JobState;
  readonly publishedAt: Date | null;
  /** `true` si T3 llegó a arrancar alguna vez (hay eventos suyos). */
  readonly t3Started: boolean;
  /** Instante en que vence T3 si el contador siguiera corriendo. */
  readonly deadlineAt: Date | null;
  /** `false` cuando el trabajo no tiene categoría y T3 no se puede calcular. */
  readonly hasDeadline: boolean;
}): JobEnd {
  // Lo publicado manda sobre todo lo demás: una vez ocurrió, ya no se
  // estima nada. Sin la fecha guardada no se afirma que se publicó.
  if (PUBLISHED_STATES.includes(input.state)) {
    return input.publishedAt !== null
      ? { kind: "published", at: input.publishedAt }
      : { kind: "no_deadline" };
  }

  if (CANCELLED_STATES.includes(input.state)) return { kind: "cancelled" };

  if (!input.hasDeadline) return { kind: "no_deadline" };

  if (!input.t3Started) return { kind: "not_started" };

  // El orden importa: un trabajo bloqueado SÍ tiene contador arrancado y
  // SÍ tiene minutos restantes, así que preguntar por la fecha antes que
  // por la pausa daría una fecha perfectamente calculada y falsa.
  if (PAUSED_STATES.includes(input.state)) return { kind: "paused" };

  return input.deadlineAt !== null
    ? { kind: "estimated", at: input.deadlineAt }
    : { kind: "no_deadline" };
}
