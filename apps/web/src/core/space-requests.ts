/**
 * `src/core/space-requests.ts` — la solicitud de creación de espacio
 * (PRD §30, RN-PLA; §10 y §167 de la maestra; Fase 4, Hito 17). Lógica de
 * dominio pura, sin Supabase, sin Next y sin React (CLAUDE.md).
 *
 * Es el primer archivo de `core/` que describe algo que ocurre **fuera de
 * un espacio**: una solicitud nace antes de que el espacio exista. Todo lo
 * demás en este directorio da por hecho que hay un espacio alrededor.
 *
 * Qué decide este archivo:
 *
 *   · **Los seis estados de §10** y **quién mueve cada transición**
 *     (RN-PLA-03). La tabla está duplicada a propósito con
 *     `space_request_transition_allowed()` de la migración 89: son dos
 *     sistemas que no pueden importarse el uno al otro, y
 *     `listas-compartidas.test.ts` vigila que no se separen. Es la misma
 *     decisión que se tomó con los informes y con las oportunidades.
 *   · **Qué transiciones exigen un motivo escrito** (RN-PLA-06).
 *   · **Los dos planes de Cuotly** que se pueden pedir (§4).
 *
 * Lo que NO está aquí:
 *
 *   · **El control de acceso.** Quién puede aprobar lo vuelve a decidir el
 *     servidor (migración 89). Lo de aquí es la misma cuenta, para que la
 *     pantalla no ofrezca un botón que el servidor va a rechazar.
 *   · **El texto.** Los nombres de los estados en español los escribe la
 *     pantalla desde `src/i18n/es.ts` (CLAUDE.md).
 *   · **Lo que pasa al aprobar.** Crear el espacio, hacer propietario al
 *     solicitante y arrancar la prueba es una operación de servidor con
 *     transacción y clave de idempotencia (RN-PLA-05): no cabe aquí.
 */

/** §10 · los seis estados, en el orden en que se recorren. */
export const SPACE_REQUEST_STATES = [
  "draft",
  "submitted",
  "in_review",
  "needs_information",
  "approved",
  "rejected",
] as const;
export type SpaceRequestState = (typeof SPACE_REQUEST_STATES)[number];

export function isSpaceRequestState(value: string): value is SpaceRequestState {
  return (SPACE_REQUEST_STATES as readonly string[]).includes(value);
}

/**
 * Los dos lados que mueven una solicitud. No son roles del espacio —no hay
 * espacio todavía—: es quien la escribió, y Cuotly.
 */
export const SPACE_REQUEST_ACTORS = ["requester", "platform"] as const;
export type SpaceRequestActor = (typeof SPACE_REQUEST_ACTORS)[number];

/** §4 · los dos planes de Cuotly que el solicitante elige antes de enviar. */
export const CUOTLY_PLANS = ["pro", "agency"] as const;
export type CuotlyPlan = (typeof CUOTLY_PLANS)[number];

export function isCuotlyPlan(value: string): value is CuotlyPlan {
  return (CUOTLY_PLANS as readonly string[]).includes(value);
}

/**
 * RN-PLA-03 · la misma tabla que `space_request_transition_allowed()` de la
 * migración 89.
 *
 * Tres cosas que se leen mejor aquí que en la lista:
 *
 *   · **El borrador es del solicitante y nadie más lo ve** (RN-PLA-02), así
 *     que de `draft` no sale ninguna transición de la plataforma: no puede
 *     rechazar lo que no ha visto.
 *   · **`submitted` puede ir directo a `approved`.** §10 da los seis
 *     estados pero no obliga a pasar por `in_review`, y obligar sería
 *     inventarse un trámite: una solicitud clara se aprueba de una vez.
 *   · **`approved` y `rejected` no vuelven atrás.** Aprobar ya creó un
 *     espacio (RN-PLA-05) y deshacerlo no es cambiar un estado, es otra
 *     operación —archivar el espacio, §127— que este hito no trae. Un
 *     rechazo tampoco se reabre: lo que se hace es enviar otra solicitud.
 */
const TRANSITIONS: Readonly<
  Record<SpaceRequestState, Readonly<Record<SpaceRequestState, readonly SpaceRequestActor[]>>>
> = {
  draft: {
    draft: [],
    submitted: ["requester"],
    in_review: [],
    needs_information: [],
    approved: [],
    rejected: [],
  },
  submitted: {
    draft: [],
    submitted: [],
    in_review: ["platform"],
    needs_information: ["platform"],
    approved: ["platform"],
    rejected: ["platform"],
  },
  in_review: {
    draft: [],
    submitted: [],
    in_review: [],
    needs_information: ["platform"],
    approved: ["platform"],
    rejected: ["platform"],
  },
  needs_information: {
    draft: [],
    submitted: ["requester"],
    in_review: [],
    needs_information: [],
    approved: [],
    rejected: [],
  },
  approved: {
    draft: [],
    submitted: [],
    in_review: [],
    needs_information: [],
    approved: [],
    rejected: [],
  },
  rejected: {
    draft: [],
    submitted: [],
    in_review: [],
    needs_information: [],
    approved: [],
    rejected: [],
  },
};

export function spaceRequestTransitionAllowed(
  from: SpaceRequestState,
  to: SpaceRequestState,
  actor: SpaceRequestActor,
): boolean {
  return TRANSITIONS[from][to].includes(actor);
}

/**
 * RN-PLA-06 · las dos que no se pueden dejar sin explicar. §10 dice
 * "Rechazada **con motivo**", y "Necesita información" sin decir qué falta
 * deja a alguien mirando una pared sin saber qué escribir.
 */
export const STATES_NEEDING_REASON: readonly SpaceRequestState[] = ["needs_information", "rejected"];

export function spaceRequestNeedsReason(to: SpaceRequestState): boolean {
  return STATES_NEEDING_REASON.includes(to);
}

/** Estados de los que ya no se sale. */
export function isSpaceRequestFinal(state: SpaceRequestState): boolean {
  return state === "approved" || state === "rejected";
}

/**
 * RN-PLA-02 · qué solicitudes ve la plataforma. El borrador **no**: es del
 * solicitante mientras lo escribe, igual que el borrador de solicitud del
 * restaurante (RN-MSG-10). Se expresa aquí y lo vuelve a decir la política
 * de RLS; esto solo evita pintar lo que el servidor no va a devolver.
 */
export function isVisibleToPlatform(state: SpaceRequestState): boolean {
  return state !== "draft";
}
