/**
 * CA-21 · "Cada entidad y cada estado se llama **igual** en escritorio,
 * móvil, correo, PDF e historial."
 *
 * Un criterio así no se cumple con buena voluntad: se cumple si solo
 * existe UN sitio donde un estado tiene nombre. Este archivo enumera los
 * valores canónicos que la base de datos puede contener; `src/i18n/es.ts`
 * les pone nombre en español, una sola vez; y todo lo demás —pantalla de
 * escritorio, navegación móvil, cuerpo del correo, historial— importa de
 * ahí.
 *
 * El test `naming.test.ts` comprueba dos cosas: que el diccionario cubre
 * todos los valores de esta lista, y que no tiene ninguno de más (un
 * nombre huérfano suele ser el resto de un estado renombrado a medias, o
 * un segundo nombre para algo que ya se llamaba de otra manera).
 *
 * Y `state-catalogue.test.ts` comprueba lo que este archivo no puede: que
 * cada lista coincida con el CHECK de la columna correspondiente en las
 * migraciones. Sin eso, esto sería una lista de deseos — y lo fue: hasta
 * el 03/09/2026 esta cabecera decía que ese barrido lo hacía
 * `hito8_inicio_busqueda_notificaciones.sql`, que no lo hacía ni lo había
 * hecho nunca. Las tres listas de estados que este archivo redeclaraba a
 * mano llevaban meses desfasadas de la base sin que nada lo dijera:
 * faltaban `correction_requested` en las solicitudes y
 * `reassignment_requested` en los trabajos, los dos cancelados del trabajo
 * eran un `cancelled` que la base no admite, y una tarea `completed` se
 * llamaba aquí `done`. Ahora no se redeclaran: se importan de su dueño en
 * `src/core/`, que es el que ya estaba bien.
 */

import { JOB_STATES, TASK_STATES } from "./job-states";
import { REQUEST_STATES } from "./request-states";

export { JOB_STATES, TASK_STATES, REQUEST_STATES };
export type { JobState, TaskState } from "./job-states";
export type { RequestState } from "./request-states";

export const ENTITY_KINDS = [
  "establishment",
  "group",
  "request",
  "job",
  "task",
  "person",
  "plan",
  "charge",
  "file",
  "absence",
  "conversation",
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const CHARGE_STATES = [
  "pending",
  "paid",
  "partially_paid",
  "overdue",
  "waived",
  "refunded",
] as const;
export type ChargeState = (typeof CHARGE_STATES)[number];

export const ESTABLISHMENT_STATES = [
  "configuring",
  "active",
  "paused",
  "ending",
  "read_only",
  "suspended",
  "archived",
] as const;
export type EstablishmentState = (typeof ESTABLISHMENT_STATES)[number];

export const ABSENCE_STATES = ["requested", "approved", "rejected", "cancelled"] as const;
export type AbsenceState = (typeof ABSENCE_STATES)[number];

/**
 * Todo lo que puede aparecer como "estado" delante de una persona, con la
 * entidad a la que pertenece. Un mismo texto (`in_progress`) significa lo
 * mismo en una solicitud y en un trabajo, pero se enumera por entidad
 * porque el conjunto de valores válidos no es el mismo.
 */
export const STATE_CATALOGUE = {
  request: REQUEST_STATES,
  job: JOB_STATES,
  task: TASK_STATES,
  charge: CHARGE_STATES,
  establishment: ESTABLISHMENT_STATES,
  absence: ABSENCE_STATES,
} as const;

export type StatefulEntity = keyof typeof STATE_CATALOGUE;
