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
 * Y `hito8_inicio_busqueda_notificaciones.sql` comprueba lo que este
 * archivo no puede: que la lista coincida con los CHECK de la base. Sin
 * eso, esto sería una lista de deseos.
 */

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

export const REQUEST_STATES = [
  "draft",
  "received",
  "analyzing",
  "pending_internal_validation",
  "needs_information",
  "pending_client_acceptance",
  "accepted",
  "in_progress",
  "published",
  "in_correction",
  "closed",
  "rejected",
  "cancelled_before_start",
  "cancelled_after_start",
] as const;
export type RequestState = (typeof REQUEST_STATES)[number];

export const JOB_STATES = [
  "pending_assignment",
  "assigned",
  "in_progress",
  "blocked_by_client",
  "authorized_pause",
  "published",
  "in_correction",
  "completed",
  "cancelled",
] as const;
export type JobState = (typeof JOB_STATES)[number];

export const TASK_STATES = ["pending", "in_progress", "done", "cancelled"] as const;
export type TaskState = (typeof TASK_STATES)[number];

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
