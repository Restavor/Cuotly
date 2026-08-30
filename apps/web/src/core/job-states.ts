/**
 * `src/core/job-states.ts` — la máquina de estados de un trabajo y de una
 * tarea (PRD §11 RN-JOB, Hito 6). Lógica de dominio pura: sin Supabase, sin
 * Next.js, sin React (CLAUDE.md, regla de estilo de código). Mismo patrón
 * que `request-states.ts`: la tabla de transiciones es el dato, y la
 * migración del Hito 6 hace cumplir en el servidor exactamente estas mismas
 * transiciones (CLAUDE.md, MUST: "toda operación se valida en el servidor";
 * este módulo no es un control de acceso, es la definición compartida).
 *
 * Los once estados de trabajo son los de PRD §11.1 y los cinco de tarea los
 * de §11.2 — el mismo nombre interno del que salen la etiqueta visible, el
 * correo, el PDF y el historial (RN-REQ-01, CA-21).
 */

/** PRD §11.1, en el orden del documento. */
export const JOB_STATES = [
  "pending_assignment",
  "assigned",
  "reassignment_requested",
  "in_progress",
  "blocked_by_client",
  "authorized_pause",
  "published",
  "in_correction",
  "completed",
  "cancelled_before_start",
  "cancelled_after_start",
] as const;

export type JobState = (typeof JOB_STATES)[number];

export function isJobState(value: string): value is JobState {
  return (JOB_STATES as readonly string[]).includes(value);
}

/** PRD §11.2. */
export const TASK_STATES = ["pending", "in_progress", "blocked", "completed", "cancelled"] as const;

export type TaskState = (typeof TASK_STATES)[number];

export function isTaskState(value: string): value is TaskState {
  return (TASK_STATES as readonly string[]).includes(value);
}

/**
 * Quién dispara la transición:
 * - `worker`: el responsable asignado del trabajo (o de la tarea).
 * - `staff`: propietario o administrador del espacio (RN-ASG-08, RN-JOB-07).
 * - `client`: el restaurante (RN-COR-02, RN-JOB-04).
 * - `system`: un paso automático sin persona detrás (RN-COR-08).
 *
 * El propietario y el administrador con la capacidad `perform_jobs` pueden
 * además actuar como responsables de un trabajo (§4.2) — eso es una
 * cuestión de quién es el responsable asignado, no de esta tabla: al
 * ejecutar el trabajo actúan como `worker`.
 */
export type JobActor = "worker" | "staff" | "client" | "system";

/** Qué le pasa a T2 (RN-SLA-05 a 10) al completar la transición. */
export type T2Action = "start" | "stop" | null;

/** Qué le pasa a T3 (RN-SLA-11 a 15) al completar la transición. */
export type T3Action = "start" | "pause" | "resume" | "stop" | null;

export type JobTransition = {
  readonly from: JobState;
  readonly to: JobState;
  readonly actor: JobActor;
  /** Regla del PRD que exige o permite esta transición, para trazabilidad en los tests. */
  readonly rule: string;
  readonly t2: T2Action;
  readonly t3: T3Action;
};

/**
 * Todas las transiciones que el Hito 6 implementa, con su efecto sobre T2 y
 * T3. Notas de las decisiones que no se leen solas:
 *
 * - `pending_assignment -> assigned`: RN-SLA-05, T2 arranca cuando el
 *   trabajo queda asignado (no antes: un trabajo sin responsable no tiene
 *   plazo de inicio que medir, RN-ASG-05).
 * - `assigned -> in_progress`: "Comenzar" (RN-JOB-03, HU-18). T2 se detiene
 *   (RN-SLA-07) y T3 arranca (RN-SLA-11) en el mismo acto.
 * - Reasignación (RN-ASG-07 a 09, HU-22, CA-12): ni pedirla ni aprobarla
 *   toca ningún contador — `t2` y `t3` en `null` es precisamente lo que
 *   hace que "una reasignación NO reinicia T2" y que "el nuevo responsable
 *   recibe el tiempo restante exacto". Se puede pedir antes de Comenzar
 *   (desde `assigned`) y también con el trabajo ya en marcha (desde
 *   `in_progress`); al aprobarla se vuelve al estado que se tenía, que la
 *   base de datos recupera del último `state_events` — por eso hay dos
 *   transiciones de salida desde `reassignment_requested`.
 * - Bloqueos y pausas (RN-JOB-07/08, HU-19): T3 se pausa y se reanuda,
 *   conservando el tiempo restante exacto (RN-SLA-14, CA-13). Un bloqueo
 *   por falta de información lo marca el propio trabajador (RN-JOB-09); una
 *   pausa autorizada es del propietario o el administrador (RN-JOB-07), de
 *   ahí los actores distintos. El administrador puede además revertir un
 *   bloqueo del trabajador (RN-JOB-09), por eso `blocked_by_client ->
 *   in_progress` existe para los dos actores.
 * - `in_progress -> published`: el trabajador publica directamente
 *   (RN-JOB-10, HU-20). No hay ninguna transición intermedia de aprobación
 *   del supervisor: su ausencia es la regla. T3 se detiene (RN-SLA-13).
 * - Corrección (RN-COR, HU-23): la **pide** el cliente dentro de su ventana,
 *   pero pedirla no mueve el trabajo — lo mueve quien se pone con ella,
 *   preferentemente el mismo trabajador (RN-COR-06); el equipo también
 *   puede abrirla por su cuenta cuando el error es suyo
 *   (RN-JOB-12/RN-COR-07). La petición del cliente vive en la solicitud
 *   (`request-states.ts`, `published -> correction_requested`) y en la
 *   tabla `corrections`. Ni al abrirla ni al cerrarla se toca T3: el PRD no
 *   define ningún contador para la corrección (RN-SLA-13 detiene T3 al
 *   publicar y nada lo rearranca), y no se inventa uno aquí.
 * - `published -> completed`: al cerrarse la ventana de corrección la
 *   conversación pasa a solo lectura (RN-COR-08); el trabajo queda
 *   finalizado. Es un paso de sistema, sin persona detrás.
 * - Cancelaciones (RN-JOB-04, CA-06): las implementó el Hito 5 en
 *   `cancel_accepted_request()`; están aquí para que la máquina de estados
 *   del trabajo esté completa en un único sitio.
 */
export const JOB_TRANSITIONS: readonly JobTransition[] = [
  { from: "pending_assignment", to: "assigned", actor: "staff", rule: "RN-ASG-03/04 · RN-SLA-05 · HU-16", t2: "start", t3: null },
  { from: "pending_assignment", to: "assigned", actor: "system", rule: "RN-ASG-03 · RN-SLA-05 · HU-16", t2: "start", t3: null },
  { from: "assigned", to: "in_progress", actor: "worker", rule: "RN-JOB-03 · RN-SLA-07/11 · HU-18", t2: "stop", t3: "start" },

  { from: "assigned", to: "reassignment_requested", actor: "worker", rule: "RN-ASG-07 · HU-22", t2: null, t3: null },
  { from: "in_progress", to: "reassignment_requested", actor: "worker", rule: "RN-ASG-07 · HU-22", t2: null, t3: null },
  { from: "reassignment_requested", to: "assigned", actor: "staff", rule: "RN-ASG-08/09 · CA-12", t2: null, t3: null },
  { from: "reassignment_requested", to: "in_progress", actor: "staff", rule: "RN-ASG-08/09 · CA-12", t2: null, t3: null },

  { from: "in_progress", to: "blocked_by_client", actor: "worker", rule: "RN-JOB-08/09 · HU-19", t2: null, t3: "pause" },
  { from: "blocked_by_client", to: "in_progress", actor: "worker", rule: "RN-JOB-08 · CA-13", t2: null, t3: "resume" },
  { from: "blocked_by_client", to: "in_progress", actor: "staff", rule: "RN-JOB-09 · CA-13", t2: null, t3: "resume" },
  { from: "in_progress", to: "authorized_pause", actor: "staff", rule: "RN-JOB-07", t2: null, t3: "pause" },
  { from: "authorized_pause", to: "in_progress", actor: "staff", rule: "RN-JOB-07 · CA-13", t2: null, t3: "resume" },

  { from: "in_progress", to: "published", actor: "worker", rule: "RN-JOB-10 · RN-SLA-13 · HU-20", t2: null, t3: "stop" },
  { from: "published", to: "in_correction", actor: "worker", rule: "RN-COR-06 · HU-23", t2: null, t3: null },
  { from: "published", to: "in_correction", actor: "staff", rule: "RN-COR-07 · RN-JOB-12", t2: null, t3: null },
  { from: "in_correction", to: "published", actor: "worker", rule: "RN-COR-06", t2: null, t3: null },
  { from: "published", to: "completed", actor: "system", rule: "RN-COR-08", t2: null, t3: null },

  { from: "pending_assignment", to: "cancelled_before_start", actor: "client", rule: "RN-JOB-04 · CA-06", t2: null, t3: null },
  { from: "assigned", to: "cancelled_before_start", actor: "client", rule: "RN-JOB-04 · CA-06", t2: null, t3: null },
  { from: "in_progress", to: "cancelled_after_start", actor: "client", rule: "RN-JOB-04 · CA-06", t2: null, t3: null },
] as const;

export function findJobTransition(from: JobState, to: JobState, actor: JobActor): JobTransition | undefined {
  return JOB_TRANSITIONS.find((t) => t.from === from && t.to === to && t.actor === actor);
}

export function canTransitionJobState(from: JobState, to: JobState, actor: JobActor): boolean {
  return findJobTransition(from, to, actor) !== undefined;
}

export type TaskTransition = {
  readonly from: TaskState;
  readonly to: TaskState;
  readonly actor: JobActor;
  readonly rule: string;
};

/**
 * RN-JOB-01: "el trabajador NO puede cancelar una tarea; debe pedírselo a
 * un administrador". Por eso ninguna transición hacia `cancelled` tiene
 * `worker` como actor — y ese hueco es la regla, no un olvido.
 */
export const TASK_TRANSITIONS: readonly TaskTransition[] = [
  { from: "pending", to: "in_progress", actor: "worker", rule: "PRD §11.2 · HU-21" },
  { from: "in_progress", to: "blocked", actor: "worker", rule: "PRD §11.2 · RN-JOB-07" },
  { from: "blocked", to: "in_progress", actor: "worker", rule: "PRD §11.2" },
  { from: "in_progress", to: "completed", actor: "worker", rule: "PRD §11.2 · RN-ASG-13" },
  { from: "pending", to: "cancelled", actor: "staff", rule: "RN-JOB-01" },
  { from: "in_progress", to: "cancelled", actor: "staff", rule: "RN-JOB-01" },
  { from: "blocked", to: "cancelled", actor: "staff", rule: "RN-JOB-01" },
] as const;

export function canTransitionTaskState(from: TaskState, to: TaskState, actor: JobActor): boolean {
  return TASK_TRANSITIONS.some((t) => t.from === from && t.to === to && t.actor === actor);
}

/**
 * RN-ASG-13: "suman los trabajos `assigned` (aún sin comenzar) y
 * `in_progress`". Un trabajo bloqueado o en pausa autorizada no está en
 * esta lista: no es trabajo humano activo mientras espera al restaurante
 * (RN-JOB-08) — los puntos de carga miden trabajo activo, no compromiso
 * pendiente (§14.4).
 */
export const ACTIVE_JOB_STATES: readonly JobState[] = ["assigned", "in_progress"] as const;

/** Estados en los que el trabajo ya no está vivo en la operación diaria. */
export const FINISHED_JOB_STATES: readonly JobState[] = [
  "published",
  "completed",
  "cancelled_before_start",
  "cancelled_after_start",
] as const;

/** RN-JOB-13: 30 días **naturales** en la columna "Finalizados". */
export const FINISHED_COLUMN_DAYS = 30;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * RN-JOB-13 (enmienda 29/08/2026): un trabajo o una tarea finalizados
 * permanecen 30 días naturales en la columna "Finalizados" de las vistas
 * operativas; pasados los 30 días dejan de mostrarse ahí y quedan
 * accesibles en el historial. **No se borra nada** — esta función decide
 * qué se muestra en una columna, nunca qué se conserva.
 *
 * Días naturales, no laborables: el reloj contractual (RN-CLK) mide plazos
 * de servicio, y esto no es un plazo de servicio sino la caducidad de una
 * columna de la interfaz.
 */
export function isWithinFinishedColumn(finishedAt: Date, now: Date): boolean {
  const elapsedDays = (now.getTime() - finishedAt.getTime()) / DAY_IN_MS;
  return elapsedDays >= 0 && elapsedDays < FINISHED_COLUMN_DAYS;
}
