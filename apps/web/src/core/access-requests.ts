/**
 * `src/core/access-requests.ts` — cómo se entra en Cuotly (PRD §37,
 * RN-ACC; decisión 41 del 16/09/2026). Lógica de dominio pura, sin
 * Supabase, sin Next y sin React (CLAUDE.md).
 *
 * Es el segundo archivo de `core/` que describe algo que ocurre **fuera de
 * un espacio**, y el primero que describe algo que ocurre **fuera de una
 * cuenta**: quien escribe una solicitud de acceso todavía no es nadie en
 * Cuotly. `space-requests.ts` es el hermano mayor y conviene no
 * confundirlos: aquella solicitud la escribe quien ya ha entrado y al
 * aprobarse crea un espacio; esta la escribe quien no ha entrado y al
 * aprobarse crea una cuenta (RN-ACC-03).
 *
 * Qué decide este archivo:
 *
 *   · **Los cuatro estados de §37 y quién mueve cada transición**
 *     (RN-ACC-05). La tabla está duplicada a propósito con
 *     `access_request_transition_allowed()` de la migración 97, y
 *     `listas-compartidas.test.ts` vigila que no se separen.
 *   · **Las dos puertas** por las que se puede nacer en Cuotly
 *     (RN-ACC-01), que la pantalla necesita saber para no ofrecer una
 *     tercera.
 *   · **Los cinco correos** que Cuotly manda a direcciones que todavía no
 *     son de nadie (RN-ACC-04), duplicados con el CHECK de
 *     `platform_emails.kind`.
 *   · **Qué le pasa a un enlace de un solo uso**: válido, gastado o
 *     caducado, y qué se puede hacer con cada uno.
 *
 * Lo que NO está aquí:
 *
 *   · **El control de acceso.** Quién puede aprobar lo vuelve a decidir el
 *     servidor con `is_platform_approver()` (RN-ACC-06), que exige la
 *     sesión verificada en dos pasos. Lo de aquí es la misma cuenta, para
 *     que la pantalla no ofrezca un botón que el servidor va a rechazar.
 *   · **El texto.** Los nombres de los estados en español los escribe la
 *     pantalla desde `src/i18n/es.ts` (CLAUDE.md).
 *   · **La creación de la cuenta.** Materializar la fila de `auth.users`
 *     es una operación de servidor con la clave de administración, detrás
 *     de una función reservada a `service_role` (migración 97).
 */

/** §37 · los cuatro estados. No hay borrador: el formulario es público. */
export const ACCESS_REQUEST_STATES = [
  "submitted",
  "needs_information",
  "approved",
  "rejected",
] as const;
export type AccessRequestState = (typeof ACCESS_REQUEST_STATES)[number];

export function isAccessRequestState(value: string): value is AccessRequestState {
  return (ACCESS_REQUEST_STATES as readonly string[]).includes(value);
}

/**
 * Los dos lados que mueven una solicitud de acceso. Ninguno es un rol de
 * espacio —no hay espacio, y uno de los dos ni siquiera tiene cuenta—: es
 * quien la escribió, y Cuotly.
 */
export const ACCESS_REQUEST_ACTORS = ["applicant", "platform"] as const;
export type AccessRequestActor = (typeof ACCESS_REQUEST_ACTORS)[number];

/**
 * RN-ACC-05 · la misma tabla que `access_request_transition_allowed()` de
 * la migración 97.
 *
 * Tres cosas que se leen mejor aquí que en la lista:
 *
 *   · **No hay `in_review`.** Son cinco campos: pasar por "en revisión"
 *     antes de decidir sería un trámite inventado, y §37 no lo pide.
 *   · **De `needs_information` se vuelve por el enlace con clave**, sin
 *     cuenta (RN-ACC-12), y la solicitud regresa a la cola.
 *   · **`approved` y `rejected` no vuelven atrás.** Aprobar ya creó el
 *     derecho a una cuenta y deshacerlo no es cambiar un estado. Un
 *     rechazo tampoco se reabre: lo que se hace es enviar otra solicitud.
 */
const TRANSITIONS: Readonly<
  Record<AccessRequestState, Readonly<Record<AccessRequestState, readonly AccessRequestActor[]>>>
> = {
  submitted: {
    submitted: [],
    needs_information: ["platform"],
    approved: ["platform"],
    rejected: ["platform"],
  },
  needs_information: {
    submitted: ["applicant"],
    needs_information: [],
    approved: [],
    rejected: [],
  },
  approved: {
    submitted: [],
    needs_information: [],
    approved: [],
    rejected: [],
  },
  rejected: {
    submitted: [],
    needs_information: [],
    approved: [],
    rejected: [],
  },
};

export function accessRequestTransitionAllowed(
  from: AccessRequestState,
  to: AccessRequestState,
  actor: AccessRequestActor,
): boolean {
  return TRANSITIONS[from][to].includes(actor);
}

/**
 * RN-ACC-05 · las dos que no se pueden dejar sin explicar. Rechazar sin
 * decir por qué, o pedir información sin decir cuál, deja a alguien
 * mirando una pared sin saber qué escribir.
 */
export const ACCESS_STATES_NEEDING_REASON: readonly AccessRequestState[] = [
  "needs_information",
  "rejected",
];

export function accessRequestNeedsReason(to: AccessRequestState): boolean {
  return ACCESS_STATES_NEEDING_REASON.includes(to);
}

/** Estados de los que ya no se sale. */
export function isAccessRequestFinal(state: AccessRequestState): boolean {
  return state === "approved" || state === "rejected";
}

/**
 * RN-ACC-01 · **las dos puertas y ninguna más**. La lista existe para que
 * ninguna pantalla ofrezca una tercera por descuido: si mañana alguien
 * añade un proveedor de identidad, tiene que pasar por aquí, por el PRD y
 * por `supabase/config.toml`, y no por un botón suelto.
 */
export const ACCESS_DOORS = ["approved_request", "invitation"] as const;
export type AccessDoor = (typeof ACCESS_DOORS)[number];

/**
 * RN-ACC-04 · los cinco correos que Cuotly manda a direcciones que
 * todavía no son de nadie. Duplicados con el CHECK de
 * `platform_emails.kind`; los vigila `listas-compartidas.test.ts`.
 */
export const PLATFORM_EMAIL_KINDS = [
  "access_request_received",
  "access_request_needs_information",
  "access_request_approved",
  "access_request_rejected",
  "access_request_already_registered",
] as const;
export type PlatformEmailKind = (typeof PLATFORM_EMAIL_KINDS)[number];

/**
 * Los tres estados en que la pantalla de alta puede encontrar un enlace.
 * `account_setup_details()` devuelve exactamente estos tres, y solo el
 * primero trae el correo: un enlace gastado o caducado no dice a quién
 * pertenecía (RN-ACC-04).
 */
export const SETUP_LINK_STATES = ["valid", "used", "expired"] as const;
export type SetupLinkState = (typeof SETUP_LINK_STATES)[number];

export function setupLinkAcceptsPassword(state: SetupLinkState): boolean {
  return state === "valid";
}

/**
 * RN-ACC-09 · qué pide la pantalla de invitación.
 *
 * El correo **nunca** se pide: viene prefijado y bloqueado, porque
 * `accept_space_invitation_as()` exige que coincida con el de la
 * invitación (migración 7, partida en dos por la 97). Lo que cambia es si
 * hay que poner contraseña o basta con entrar: una dirección que ya tiene
 * cuenta no crea otra —una persona, una cuenta, un correo—, acepta la
 * invitación iniciando sesión, que es HU-04 vista desde el otro lado.
 */
export type InvitationSignupStep = "set_password" | "sign_in" | "unusable";

export function invitationSignupStep(
  state: string,
  hasAccount: boolean,
): InvitationSignupStep {
  if (state !== "valid") return "unusable";
  return hasAccount ? "sign_in" : "set_password";
}

/**
 * Lo único que la pantalla del formulario público puede decir, pase lo que
 * pase por detrás (RN-ACC-02 y RN-ACC-12). No es una comodidad: devolver
 * cualquier otra cosa convertiría el formulario en un oráculo de correos,
 * y quien quisiera saber si alguien está en Cuotly solo tendría que
 * escribir su dirección. Lo que cambia según el caso es el correo que
 * sale, no lo que se ve.
 */
export const ACCESS_REQUEST_SUBMIT_OUTCOME = "received" as const;

/**
 * A09 · qué falta o qué está mal en el formulario público, campo a campo.
 *
 * Estaba escrito dentro de `app/(auth)/actions.ts`, un módulo
 * `"use server"` que la app del teléfono no puede importar. Con la
 * pantalla de solicitud también en el móvil, dejarlo allí obligaba a
 * escribir la misma comprobación dos veces, y dos comprobaciones de lo
 * mismo se separan: la del teléfono habría aceptado lo que la web rechaza
 * —o al revés— sin que nadie se enterara hasta verlo.
 *
 * Devuelve **claves de campo**, no frases: el texto lo pone cada pantalla
 * desde `src/i18n/es.ts` (CLAUDE.md). Los nombres son los del formulario
 * de la web, que es lo que esa pantalla usa para marcar cada campo.
 *
 * Esto no es el control: `submit_access_request()` vuelve a exigir los
 * cuatro campos y el arroba del lado del servidor, y es la que manda. Lo
 * de aquí evita el viaje y señala dónde está el problema.
 */
export interface AccessRequestInput {
  readonly contactName: string;
  readonly businessName: string;
  readonly phone: string;
  readonly email: string;
}

export type AccessRequestValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly problem: "missing" | "email"; readonly fields: readonly string[] };

export function validateAccessRequest(input: AccessRequestInput): AccessRequestValidation {
  const vacios = (
    [
      ["contact_name", input.contactName],
      ["business_name", input.businessName],
      ["phone", input.phone],
      ["email", input.email],
    ] as const
  )
    .filter(([, valor]) => valor.trim() === "")
    .map(([campo]) => campo);

  if (vacios.length > 0) return { ok: false, problem: "missing", fields: vacios };

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) {
    return { ok: false, problem: "email", fields: ["email"] };
  }

  return { ok: true };
}

/**
 * A09 · qué le pasa a **cada** campo, todos a la vez.
 *
 * `validateAccessRequest()` se queda en el primer problema (o faltan
 * datos, o el correo está mal), y el diseño de A09 señala los dos juntos:
 * el nombre vacío y el correo mal escrito en la misma pantalla. Esta
 * función hace la misma comprobación —la misma expresión del correo— pero
 * devuelve el problema de cada campo, para que la persona lo arregle todo
 * de una vez y no a golpe de envío.
 */
export type AccessRequestField = "contact_name" | "business_name" | "phone" | "email";
export type AccessRequestFieldProblem = "missing" | "invalid";

export function accessRequestFieldProblems(
  input: AccessRequestInput,
): Partial<Record<AccessRequestField, AccessRequestFieldProblem>> {
  const problemas: Partial<Record<AccessRequestField, AccessRequestFieldProblem>> = {};
  if (input.contactName.trim() === "") problemas.contact_name = "missing";
  if (input.businessName.trim() === "") problemas.business_name = "missing";
  if (input.phone.trim() === "") problemas.phone = "missing";
  if (input.email.trim() === "") problemas.email = "missing";
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) problemas.email = "invalid";
  return problemas;
}

/**
 * A11 · un envío que no llega no se cuenta como un dato mal escrito. El
 * mismo reparto que `classifySignInError()` hace para entrar, con el
 * mínimo que este formulario necesita: o no hubo línea, o falló y no se
 * sabe por qué. En ninguno de los dos casos se pierde lo escrito.
 */
export function accessRequestSubmitFailure(message: string): "unreachable" | "unknown" {
  return message === "" || /fetch|network|timeout|econnrefused|enotfound/i.test(message)
    ? "unreachable"
    : "unknown";
}
