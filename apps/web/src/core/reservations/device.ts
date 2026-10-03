/**
 * `src/core/reservations/device.ts` · la tablet del local y el PIN
 * (RN-APP-06 a RN-APP-08; PRD de agents §3.3; migración 170).
 *
 * Lo que no depende de ninguna base de datos ni de Next.js: cómo es un PIN, qué operaciones
 * puede pedir cada rol desde la tablet, cuánto dura el bloqueo, cómo se traduce una llamada de
 * la agenda a la puerta de la tablet y cómo se cuenta un acceso denegado. Su gemela SQL es
 * `reservation_device_act()` y `reservation_device_identify()`: aquí se prueba lo mismo con los
 * mismos números, y el servidor vuelve a comprobarlo todo.
 */

/** La cookie `httpOnly` del dispositivo del local (su token; en la base solo queda el hash) y la de «Ajustes abiertos» (firmada). */
export const DEVICE_COOKIE = "restavor_device";
export const ELEVATION_COOKIE = "restavor_device_ajustes";

/** Las pantallas y acciones de Restavor agents: lo único donde manda un dispositivo del local. */
export function isAgentsPath(pathname: string): boolean {
  return pathname === "/agents" || pathname.startsWith("/agents/");
}

/**
 * ¿Esta petición es de una tablet del local? Con la cookie del dispositivo, **manda el dispositivo**: `proxy.ts`
 * no manda a `/sesion-caducada` ni a `/cuenta/verificar` aunque la sesión personal de quien lo activó haya
 * caducado (PRD §3.3). Es una comodidad, no el control: la validez del dispositivo la comprueba el servidor en
 * cada pantalla y cada acción.
 */
export function deviceOwnsRequest(pathname: string, hasDeviceCookie: boolean): boolean {
  // La raíz también: la tablet se salta el Inicio de Restavor app y abre siempre Reservas › Hoy (la página lo redirige).
  return hasDeviceCookie && (isAgentsPath(pathname) || pathname === "/");
}

/** Un PIN son 4 cifras (PRD §3.3). */
export const PIN_LENGTH = 4;

export function isPin(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

/** Quita lo que no es una cifra y corta a 4: lo que escribe el teclado nunca debería traer otra cosa. */
export function normalizePin(value: string): string {
  return value.replace(/\D/g, "").slice(0, PIN_LENGTH);
}

/** 5 PIN erróneos bloquean el dispositivo (PRD §3.3). */
export const MAX_PIN_ATTEMPTS = 5;

/**
 * Cuánto dura cada bloqueo (decisión 122): la primera tanda de 5 fallos, 1 minuto, como pide el PRD;
 * después 5 minutos, 30 minutos y, de la cuarta en adelante, 2 horas. Un PIN bueno lo reinicia y a las
 * 24 horas sin fallos se olvida.
 */
export function pinLockSeconds(round: number): number {
  if (round <= 0) return 60;
  if (round === 1) return 300;
  if (round === 2) return 1800;
  return 7200;
}

/** Las 24 horas sin fallos tras las que se olvidan las tandas. */
export const PIN_FORGET_AFTER_SECONDS = 24 * 60 * 60;

/** Cuánto vale «Ajustes abiertos con PIN» sin tocar nada (PRD §3.3: 2 minutos). */
export const SETTINGS_IDLE_SECONDS = 120;

/**
 * El rol con el que actúa una tablet: sin PIN (`device`), con el del Equipo (`staff`) o con el de un
 * Encargado o Propietario con cuenta.
 */
export type DeviceRole = "device" | "staff" | "manager" | "owner";

const RANK: Readonly<Record<DeviceRole, number>> = { device: 0, staff: 1, manager: 2, owner: 3 };

/** Lo que se puede pedir a la puerta de la tablet y el rol mínimo de cada cosa. Lo mismo que el `case` de SQL. */
export const DEVICE_OPERATIONS = {
  open: "device",
  book: "staff",
  confirm: "staff",
  reject: "staff",
  cancel: "staff",
  no_show: "staff",
  undo_no_show: "staff",
  dismiss_duplicate: "staff",
  platform_cancel_done: "staff",
  save_shifts: "manager",
  set_closed_date: "manager",
  save_settings: "manager",
  complete_onboarding: "manager",
  staff_add: "manager",
  staff_set_pin: "manager",
  staff_remove: "manager",
  device_revoke: "manager",
  // Dos lecturas de Ajustes que la base comprueba por la sesión de quien llama: la tablet las pide con el PIN de un Encargado o Propietario.
  people: "manager",
  history_log: "manager",
} as const satisfies Readonly<Record<string, DeviceRole>>;

export type DeviceOperation = keyof typeof DEVICE_OPERATIONS;

export function isDeviceOperation(value: string): value is DeviceOperation {
  return Object.prototype.hasOwnProperty.call(DEVICE_OPERATIONS, value);
}

/** ¿Puede este rol pedir esta operación? (Sin PIN, solo abrir una ficha.) */
export function deviceRoleAllows(role: DeviceRole, operation: DeviceOperation): boolean {
  return RANK[role] >= RANK[DEVICE_OPERATIONS[operation]];
}

/** El rol más bajo que puede pedir esta operación, para decirlo en pantalla («Pide el PIN de un Encargado»). */
export function minimumRoleFor(operation: DeviceOperation): DeviceRole {
  return DEVICE_OPERATIONS[operation];
}

// ---------------------------------------------------------------------------
// La agenda a través de la tablet
// ---------------------------------------------------------------------------

/** Las funciones de la agenda y qué operación de la tablet las atiende. */
const RPC_TO_OPERATION: Readonly<Record<string, DeviceOperation>> = {
  open_reservation: "open",
  book_reservation: "book",
  confirm_reservation: "confirm",
  reject_reservation: "reject",
  cancel_reservation: "cancel",
  mark_no_show: "no_show",
  undo_no_show: "undo_no_show",
  dismiss_duplicate: "dismiss_duplicate",
  mark_platform_cancel_done: "platform_cancel_done",
  save_reservation_shifts: "save_shifts",
  set_reservation_closed_date: "set_closed_date",
  save_reservation_settings: "save_settings",
  complete_reservations_onboarding: "complete_onboarding",
  add_reservation_staff: "staff_add",
  set_reservation_staff_pin: "staff_set_pin",
  remove_reservation_staff: "staff_remove",
  revoke_reservation_device: "device_revoke",
  reservation_people: "people",
  reservation_history_log: "history_log",
};

/** Las funciones que solo leen y la tablet puede pedir tal cual (el servidor las acota al restaurante). */
const READ_RPCS: ReadonlySet<string> = new Set([
  "reservations_search",
  "reservations_calendar",
  "reservation_history",
  "reservations_fold",
]);

export type RpcRoute =
  /** Una escritura: va por la puerta de la tablet con esta operación y estos argumentos. */
  | { readonly kind: "act"; readonly operation: DeviceOperation; readonly args: Readonly<Record<string, unknown>> }
  /** Una lectura que se pasa tal cual. */
  | { readonly kind: "read" }
  /** Algo que la tablet no puede pedir. */
  | { readonly kind: "refused" };

/**
 * A dónde va una llamada `rpc(nombre, argumentos)` hecha desde la tablet. Los argumentos pierden su `p_` y
 * `p_establishment_id` se descarta: la tablet es de UN restaurante y lo pone la base de datos, no quien llama.
 */
export function routeDeviceRpc(fn: string, args: Readonly<Record<string, unknown>> | undefined): RpcRoute {
  const operation = RPC_TO_OPERATION[fn];
  if (operation !== undefined) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args ?? {})) {
      if (key === "p_establishment_id") continue;
      out[key.startsWith("p_") ? key.slice(2) : key] = value;
    }
    return { kind: "act", operation, args: out };
  }
  if (READ_RPCS.has(fn)) return { kind: "read" };
  return { kind: "refused" };
}

// ---------------------------------------------------------------------------
// Un acceso denegado
// ---------------------------------------------------------------------------

export type DeviceAuthCode = "wrong_pin" | "locked" | "forbidden" | "no_device" | "identity_invalid";

export interface DeviceAuthFailure {
  readonly code: DeviceAuthCode;
  /** Intentos que quedan antes del bloqueo (solo con `wrong_pin`). */
  readonly remaining?: number;
  /** Hasta cuándo dura el bloqueo, en ISO (solo con `locked`). */
  readonly lockedUntil?: string;
}

const AUTH_MARK = "DEVICE_AUTH:";

/**
 * Un fallo de acceso viaja como el mensaje de un `Error`, porque la agenda ya lanza `Error` con lo que
 * dice la base de datos; así el servidor lo reconoce sin tocar cada una de sus funciones.
 */
export function encodeDeviceAuthFailure(failure: DeviceAuthFailure): string {
  return AUTH_MARK + JSON.stringify(failure);
}

const CODES: readonly DeviceAuthCode[] = ["wrong_pin", "locked", "forbidden", "no_device", "identity_invalid"];

export function decodeDeviceAuthFailure(message: string): DeviceAuthFailure | null {
  if (!message.startsWith(AUTH_MARK)) return null;
  try {
    const parsed: unknown = JSON.parse(message.slice(AUTH_MARK.length));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { code, remaining, lockedUntil } = parsed as Record<string, unknown>;
    if (typeof code !== "string" || !(CODES as readonly string[]).includes(code)) return null;
    return {
      code: code as DeviceAuthCode,
      ...(typeof remaining === "number" ? { remaining } : {}),
      ...(typeof lockedUntil === "string" ? { lockedUntil } : {}),
    };
  } catch {
    return null;
  }
}

export type ActingResult =
  | { readonly ok: true; readonly actorRole: DeviceRole; readonly actorName: string | null; readonly result: unknown }
  | { readonly ok: false; readonly failure: DeviceAuthFailure };

/** Lo que contesta `reservation_device_act()` (o `reservation_device_identify()`), como resultado de dominio. */
export function parseActingResult(raw: unknown): ActingResult {
  const value = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  switch (value.outcome) {
    case "acted": {
      const role = value.actor_role;
      const actorRole: DeviceRole = role === "staff" || role === "manager" || role === "owner" ? role : "device";
      return { ok: true, actorRole, actorName: typeof value.actor_name === "string" ? value.actor_name : null, result: value.result };
    }
    case "wrong":
      return { ok: false, failure: { code: "wrong_pin", ...(typeof value.remaining === "number" ? { remaining: value.remaining } : {}) } };
    case "locked":
      return { ok: false, failure: { code: "locked", ...(typeof value.locked_until === "string" ? { lockedUntil: value.locked_until } : {}) } };
    case "forbidden":
      return { ok: false, failure: { code: "forbidden" } };
    case "identity_invalid":
      return { ok: false, failure: { code: "identity_invalid" } };
    default:
      return { ok: false, failure: { code: "no_device" } };
  }
}

// ---------------------------------------------------------------------------
// «Ajustes abiertos con PIN» (la cookie de elevación)
// ---------------------------------------------------------------------------

/** Lo que firma la cookie de «Ajustes abiertos»: quién, en qué restaurante y hasta cuándo. */
export interface ElevationPayload {
  readonly staffId: string;
  readonly establishmentId: string;
  /** Segundos desde 1970 en que deja de valer. */
  readonly expiresAt: number;
}

export function newElevation(staffId: string, establishmentId: string, nowMs: number): ElevationPayload {
  return { staffId, establishmentId, expiresAt: Math.floor(nowMs / 1000) + SETTINGS_IDLE_SECONDS };
}

/** ¿Sigue valiendo, y es de este restaurante? Cada acción de Ajustes la renueva (2 minutos «sin tocar»). */
export function isElevationLive(payload: ElevationPayload, establishmentId: string, nowMs: number): boolean {
  return payload.establishmentId === establishmentId && payload.expiresAt > Math.floor(nowMs / 1000);
}

/** Los segundos que le quedan (nunca negativos), para la cuenta atrás de la barra. */
export function elevationSecondsLeft(payload: ElevationPayload, nowMs: number): number {
  return Math.max(0, payload.expiresAt - Math.floor(nowMs / 1000));
}
