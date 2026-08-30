/**
 * `src/core/request-states.ts` — la máquina de estados de una solicitud
 * (PRD §9 RN-REQ). Lógica de dominio pura: sin Supabase, sin Next.js, sin
 * React (CLAUDE.md, regla de estilo de código). El enum completo de
 * estados es el de PRD §9.2 (RN-REQ-01: "el mismo nombre visible se usa en
 * web, correo, PDF e historial" — el nombre interno es la única fuente de
 * verdad de la que salen los demás).
 *
 * El Hito 4 implementó el tramo "Solicitudes y clasificación": del
 * borrador a la aceptación o el rechazo del cliente (PRD §9.1, pasos 1-7).
 * El Hito 5 añade la cancelación del cliente tras la aceptación (RN-JOB-04,
 * CA-06/CA-07): `accepted -> cancelled_before_start` / `cancelled_after_start`.
 * El Hito 6 cierra el recorrido: ejecución, publicación, corrección mínima
 * y cierre. La solicitud es el espejo que ve el cliente del trabajo que hay
 * detrás (`src/core/job-states.ts`) — cada transición de aquí acompaña a
 * una del trabajo, con el mismo nombre visible en los dos sitios
 * (RN-REQ-01, CA-21). Los contadores T2 y T3 los lleva el trabajo, no la
 * solicitud: por eso todas las transiciones del Hito 6 tienen `t1: null`.
 */

/** PRD §9.2, los catorce estados de una solicitud, en el orden del documento. */
export const REQUEST_STATES = [
  "draft",
  "received",
  "analyzing",
  "needs_information",
  "pending_internal_validation",
  "pending_client_acceptance",
  "accepted",
  "in_progress",
  "published",
  "correction_requested",
  "in_correction",
  "closed",
  "cancelled_before_start",
  "cancelled_after_start",
  "rejected",
] as const;

export type RequestState = (typeof REQUEST_STATES)[number];

export function isRequestState(value: string): value is RequestState {
  return (REQUEST_STATES as readonly string[]).includes(value);
}

/**
 * Quién puede disparar la transición. `client` es el restaurante (o su
 * grupo), `staff` es propietario o administrador del espacio (RN-CLS-03:
 * "Propietario o administrador la valida o corrige" — un trabajador no
 * interviene en el tramo de clasificación, RN-SLA-04), `worker` es el
 * responsable asignado del trabajo, que aparece a partir del Hito 6
 * (RN-JOB-03/10: Comenzar y publicar), y `system` es un paso automático sin
 * persona detrás (el análisis de RN-CLS-01, el cierre de RN-COR-08).
 */
export type RequestActor = "client" | "staff" | "worker" | "system";

/** Qué le pasa a T1 (RN-SLA-01 a 04) al completar la transición. */
export type T1Action = "start" | "pause" | "resume" | "stop" | null;

export type RequestTransition = {
  readonly from: RequestState;
  readonly to: RequestState;
  readonly actor: RequestActor;
  /** Regla del PRD que exige o permite esta transición, para trazabilidad en los tests. */
  readonly rule: string;
  readonly t1: T1Action;
};

/**
 * Todas las transiciones que el Hito 4 implementa, con qué le pasa a T1 en
 * cada una (RN-SLA-01 a 03):
 *   - `draft -> received`: se envía la solicitud, arranca T1 (RN-SLA-01).
 *   - `received -> analyzing`: paso automático, T1 sigue corriendo.
 *   - `analyzing -> pending_internal_validation`: se guarda la propuesta
 *     (de IA o de reglas), T1 sigue corriendo — todavía no hay validación
 *     humana (RN-CLS-03).
 *   - `pending_internal_validation -> pending_client_acceptance`: el
 *     propietario o administrador valida o corrige (HU-11). T1 se detiene
 *     (RN-SLA-03).
 *   - `pending_internal_validation -> needs_information`: se pide
 *     información al cliente (HU-13). T1 se pausa (RN-SLA-03: "se
 *     detiene"; se modela como pausa porque, a diferencia de una parada
 *     terminal, el contador retoma el tiempo restante exacto cuando el
 *     cliente responde — mismo principio que RN-SLA-14 para T3).
 *   - `pending_internal_validation -> rejected`: el equipo rechaza una
 *     solicitud imposible, no prestada o fuera de servicio (HU-14,
 *     RN-REQ-03). T1 se detiene, terminal.
 *   - `needs_information -> pending_internal_validation`: el cliente
 *     aporta la información pedida, vuelve a la cola de validación. T1 se
 *     reanuda (RN-SLA-03, simétrico a la pausa anterior).
 *   - `pending_client_acceptance -> accepted`: el cliente acepta (HU-12).
 *   - `pending_client_acceptance -> rejected`: el cliente rechaza la
 *     propuesta final (HU-12). No hay un estado "rechazada por el
 *     cliente" distinto de "rechazada por el equipo" — RN-REQ-01 exige un
 *     único nombre visible por estado; quién la rechazó y por qué queda
 *     en el mensaje de la conversación y en la auditoría, no en el nombre
 *     del estado.
 *   - `accepted -> cancelled_before_start` / `accepted -> cancelled_after_start`
 *     (Hito 5): el cliente cancela una solicitud ya aceptada (RN-JOB-04).
 *     Cuál de las dos alcanza depende de si el trabajo ya empezó
 *     (`jobs.started_at`), no de quién actúa — por eso ambas comparten
 *     actor y regla; `cancel_accepted_request()` en la base de datos es
 *     quien decide cuál, con la misma condición que
 *     `resolveCancellationOutcome()` de `consumption-ledger.ts` (CA-06).
 */
export const REQUEST_TRANSITIONS: readonly RequestTransition[] = [
  { from: "draft", to: "received", actor: "client", rule: "RN-SLA-01 / HU-10", t1: "start" },
  { from: "received", to: "analyzing", actor: "system", rule: "RN-CLS-01", t1: null },
  { from: "analyzing", to: "pending_internal_validation", actor: "system", rule: "RN-CLS-01 / RN-CLS-03", t1: null },
  {
    from: "pending_internal_validation",
    to: "pending_client_acceptance",
    actor: "staff",
    rule: "RN-CLS-03 / HU-11",
    t1: "stop",
  },
  {
    from: "pending_internal_validation",
    to: "needs_information",
    actor: "staff",
    rule: "RN-SLA-03 / HU-13",
    t1: "pause",
  },
  { from: "pending_internal_validation", to: "rejected", actor: "staff", rule: "RN-REQ-03 / HU-14", t1: "stop" },
  {
    from: "needs_information",
    to: "pending_internal_validation",
    actor: "client",
    rule: "RN-SLA-03 / HU-13",
    t1: "resume",
  },
  { from: "pending_client_acceptance", to: "accepted", actor: "client", rule: "RN-REQ-02 / HU-12", t1: null },
  { from: "pending_client_acceptance", to: "rejected", actor: "client", rule: "HU-12", t1: null },
  { from: "accepted", to: "cancelled_before_start", actor: "client", rule: "RN-JOB-04 / CA-06", t1: null },
  { from: "accepted", to: "cancelled_after_start", actor: "client", rule: "RN-JOB-04 / CA-06", t1: null },

  // Hito 6 (ver la nota de cabecera):
  //   - `accepted -> in_progress`: el responsable pulsa Comenzar
  //     (RN-JOB-03, HU-18). Lo que arranca ahí es T3, del trabajo.
  //   - `in_progress -> published`: el trabajador publica directamente, sin
  //     aprobación previa del supervisor (RN-JOB-10, HU-20).
  //   - `published -> correction_requested`: el restaurante pide su
  //     corrección mínima gratuita dentro de la ventana (RN-COR-02, HU-23).
  //     Pedirla no cambia todavía el estado del trabajo: lo cambia el
  //     responsable al ponerse con ella (RN-COR-06).
  //   - `published -> in_correction` con actor `worker`: corrección de un
  //     error imputable al equipo (RN-COR-07/RN-JOB-12), que no nace de
  //     ninguna petición del cliente y no gasta su corrección.
  //   - `published -> closed`: al terminar la ventana de corrección, la
  //     conversación de esa solicitud pasa a solo lectura (RN-COR-08). Una
  //     necesidad nueva exige una solicitud nueva.
  { from: "accepted", to: "in_progress", actor: "worker", rule: "RN-JOB-03 / HU-18", t1: null },
  { from: "in_progress", to: "published", actor: "worker", rule: "RN-JOB-10 / HU-20", t1: null },
  { from: "published", to: "correction_requested", actor: "client", rule: "RN-COR-01/02 / HU-23", t1: null },
  { from: "correction_requested", to: "in_correction", actor: "worker", rule: "RN-COR-06 / HU-23", t1: null },
  { from: "published", to: "in_correction", actor: "worker", rule: "RN-COR-07 / RN-JOB-12", t1: null },
  { from: "in_correction", to: "published", actor: "worker", rule: "RN-COR-06 / HU-23", t1: null },
  { from: "published", to: "closed", actor: "system", rule: "RN-COR-08", t1: null },
] as const;

/** Busca la transición exacta (origen, destino, actor) en la tabla, si existe. */
export function findRequestTransition(
  from: RequestState,
  to: RequestState,
  actor: RequestActor,
): RequestTransition | undefined {
  return REQUEST_TRANSITIONS.find((t) => t.from === from && t.to === to && t.actor === actor);
}

/** RN-REQ: ¿puede `actor` mover la solicitud de `from` a `to`? */
export function canTransitionRequestState(from: RequestState, to: RequestState, actor: RequestActor): boolean {
  return findRequestTransition(from, to, actor) !== undefined;
}

/**
 * Estados en los que la solicitud sigue esperando trabajo del equipo o
 * del cliente dentro del tramo del Hito 4 (para listados de bandeja:
 * "Solicitudes pendientes" del inicio de Administrador, PRD §20.4).
 * `analyzing` no aparece: en la práctica dura lo que tarda el paso
 * automático de clasificación, nunca es una bandeja en la que alguien
 * espera.
 */
export const OPEN_REQUEST_STATES: readonly RequestState[] = [
  "draft",
  "received",
  "needs_information",
  "pending_internal_validation",
  "pending_client_acceptance",
] as const;

/**
 * Estados terminales: nada mueve una solicitud desde aquí. Con el Hito 6
 * entra `closed` — al cerrarse la ventana de corrección, la solicitud queda
 * cerrada y una necesidad nueva exige una solicitud nueva (RN-COR-08).
 */
export const TERMINAL_REQUEST_STATES: readonly RequestState[] = [
  "rejected",
  "closed",
  "cancelled_before_start",
  "cancelled_after_start",
] as const;
