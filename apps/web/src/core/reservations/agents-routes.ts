/**
 * `src/core/reservations/agents-routes.ts` · a dónde lleva cada estado de Reservas y
 * qué pantallas deja abrir en cada estado (PRD de agents §5.1 y §6.12).
 *
 * Es la regla de `/agents`: con un solo restaurante con Reservas se entra directo en
 * su pantalla; con varios, un selector. Y cada pantalla solo se abre en los estados
 * que le tocan: «Aprobado: datos para pagar» solo mientras falta el primer pago,
 * «Reservas cerrada» solo cuando está cerrada, y la agenda en el resto.
 *
 * Queda para su fase un desvío que el PRD también nombra: «Acepta las condiciones»
 * antes de los datos de pago (Fase E). «Primer uso» mientras no está terminado lo decide
 * la agenda (Hoy) y `needsOnboarding()`, porque depende de un dato del restaurante y no
 * solo de su estado.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React. Esto decide qué se
 * enseña; el servidor vuelve a comprobar cada acción (CLAUDE.md).
 */
import {
  canOffer,
  canReservations,
  type ReservationAction,
  type ReservationServiceStatus,
  type ReservationsActor,
} from "./permissions";

export const AGENTS_BASE = "/agents";

/** Las pantallas de Restavor agents que tienen ruta propia (PRD §11.1). */
export const AGENTS_PAGES = [
  "today",
  "calendar",
  "search",
  "newReservation",
  "calls",
  "settings",
  "onboarding",
  "team",
  "history",
  "unlock",
  "connections",
  "balance",
  "plan",
  "help",
  "more",
  "pendingPayment",
  "conditions",
  "closed",
] as const;

export type AgentsPage = (typeof AGENTS_PAGES)[number];

/** La dirección de un restaurante dentro de Restavor agents: `/agents/<id>`. */
export function restaurantBase(establishmentId: string): string {
  return `${AGENTS_BASE}/${establishmentId}`;
}

/** La ruta de cada pantalla, bajo la del restaurante. */
const PAGE_PATH: Readonly<Record<AgentsPage, string>> = {
  today: "/reservas",
  calendar: "/reservas/calendario",
  search: "/reservas/buscar",
  newReservation: "/reservas/nueva",
  calls: "/reservas/agente",
  settings: "/reservas/ajustes/horarios",
  onboarding: "/reservas/primer-uso",
  team: "/reservas/ajustes/equipo",
  history: "/reservas/ajustes/historial",
  unlock: "/reservas/desbloquear",
  connections: "/reservas/ajustes/conexiones",
  balance: "/saldo",
  plan: "/plan",
  help: "/ayuda",
  more: "/mas",
  pendingPayment: "/pendiente-de-pago",
  conditions: "/condiciones",
  closed: "/cuenta-cerrada",
};

export function agentsPageHref(establishmentId: string, page: AgentsPage): string {
  return `${restaurantBase(establishmentId)}${PAGE_PATH[page]}`;
}

/** La ficha de una reserva: `/agents/<id>/reservas/<reservaId>`. La abre quien abre Hoy. */
export function reservationHref(establishmentId: string, reservationId: string): string {
  return `${agentsPageHref(establishmentId, "today")}/${reservationId}`;
}

/** Editar una reserva: `/agents/<id>/reservas/<reservaId>/editar`. */
export function editReservationHref(establishmentId: string, reservationId: string): string {
  return `${reservationHref(establishmentId, reservationId)}/editar`;
}

/** Hoy, en una fecha: `/agents/<id>/reservas?fecha=2026-09-26`. */
export function todayHref(establishmentId: string, date: string): string {
  return `${agentsPageHref(establishmentId, "today")}?fecha=${date}`;
}

/** El calendario de un mes: `/agents/<id>/reservas/calendario?mes=2026-09`. */
export function calendarHref(establishmentId: string, month: string): string {
  return `${agentsPageHref(establishmentId, "calendar")}?mes=${month}`;
}

/**
 * Primer uso (PRD §5.1: «`active` sin Primer uso terminado → Primer uso»): lo pide un
 * restaurante que ya puede usar Reservas y todavía no ha terminado de configurarlo, y
 * solo a quien puede cambiar los horarios. El Equipo y los demás ven la agenda tal cual.
 */
export function needsOnboarding(
  actor: ReservationsActor,
  status: ReservationServiceStatus,
  onboardingCompletedAt: string | null,
): boolean {
  if (onboardingCompletedAt !== null) return false;
  if (status !== "active" && status !== "past_due" && status !== "paused" && status !== "ending") return false;
  return canReservations(actor, "manage_schedule_settings", { serviceStatus: status });
}

/**
 * La acción que abre cada pantalla (la fila de §3.2 que la protege). `null`: de todos
 * los que entran en Reservas. «Ajustes» lo abre quien puede cambiar los horarios; el
 * Equipo con PIN no lo ve (RN-APP-05).
 */
const PAGE_ACTION: Readonly<Record<AgentsPage, ReservationAction | null>> = {
  today: "view_agenda",
  calendar: "view_agenda",
  search: "view_agenda",
  newReservation: "create_reservation",
  calls: "view_calls",
  settings: "manage_schedule_settings",
  onboarding: "manage_schedule_settings",
  team: "manage_staff_and_devices",
  // Historial: lo ve quien cambia los ajustes (Propietario, Encargado, Restavor y el soporte en sesión).
  history: "manage_schedule_settings",
  // «Ajustes con PIN»: la puerta de la tablet. La abre cualquiera que entre; la página decide si procede.
  unlock: null,
  connections: "view_connections",
  balance: "view_balance",
  plan: "manage_plan",
  help: null,
  more: null,
  pendingPayment: "manage_plan",
  conditions: "manage_plan",
  closed: "export_all_reservations",
};

/** A dónde entra una persona en un restaurante según el estado de su Reservas (§5.1). */
export function entryPageForStatus(status: ReservationServiceStatus): AgentsPage {
  if (status === "approved_pending_payment") return "pendingPayment";
  if (status === "closed") return "closed";
  return "today";
}

export interface AgentsRestaurantRef {
  readonly establishmentId: string;
  readonly status: ReservationServiceStatus;
}

export type AgentsEntry =
  | { readonly kind: "redirect"; readonly href: string }
  | { readonly kind: "selector" }
  | { readonly kind: "empty" };

/**
 * `/agents`: sin restaurantes con Reservas, el vacío (con su motivo); con uno, directo a
 * donde le toca por su estado; con varios, el selector.
 */
export function agentsEntry(restaurants: readonly AgentsRestaurantRef[]): AgentsEntry {
  if (restaurants.length === 0) return { kind: "empty" };
  if (restaurants.length > 1) return { kind: "selector" };
  const [only] = restaurants;
  return { kind: "redirect", href: agentsPageHref(only.establishmentId, entryPageForStatus(only.status)) };
}

export type PageGuard =
  | { readonly kind: "allow" }
  /** Esta pantalla no toca en este estado: se va a la que sí. */
  | { readonly kind: "redirect"; readonly href: string }
  /** Esta persona no puede abrirla. */
  | { readonly kind: "denied" };

/**
 * ¿Se abre esta pantalla, para este actor y en este estado? Las pantallas de estado solo
 * en su estado; la agenda no se abre ni sin pagar ni cerrada; y lo demás, según la tabla
 * de permisos (`canReservations`).
 */
export function guardAgentsPage(
  establishmentId: string,
  actor: ReservationsActor,
  status: ReservationServiceStatus,
  page: AgentsPage,
): PageGuard {
  const entry = agentsPageHref(establishmentId, entryPageForStatus(status));

  // Las tres pantallas de estado solo existen en su estado.
  if (page === "pendingPayment" || page === "conditions") {
    if (status !== "approved_pending_payment") return { kind: "redirect", href: entry };
  } else if (page === "closed") {
    if (status !== "closed") return { kind: "redirect", href: entry };
  } else if (status === "closed") {
    // Cerrada: solo se entra a «Reservas cerrada» (y solo el Propietario).
    return { kind: "redirect", href: entry };
  }

  const action = PAGE_ACTION[page];
  if (action === null) {
    // «Ayuda» y «Más» son de todos los que entran en Reservas; cerrada, no (arriba).
    return canEnterReservations(actor, status) ? { kind: "allow" } : { kind: "denied" };
  }
  if (canOffer(actor, action, { serviceStatus: status })) return { kind: "allow" };

  // Sin pagar, la agenda aún no se usa: se lleva a quien puede a los datos de pago.
  if (status === "approved_pending_payment" && canReservations(actor, "manage_plan", { serviceStatus: status })) {
    return { kind: "redirect", href: agentsPageHref(establishmentId, "pendingPayment") };
  }
  return { kind: "denied" };
}

/** Quien entra en Reservas: el Propietario, el Encargado, el Equipo (con o sin PIN) y el soporte en sesión. */
export function canEnterReservations(actor: ReservationsActor, status: ReservationServiceStatus): boolean {
  if (status === "closed") return canReservations(actor, "export_all_reservations", { serviceStatus: status });
  return (
    actor.kind === "owner" ||
    actor.kind === "manager" ||
    actor.kind === "staff" ||
    actor.kind === "device" ||
    (actor.kind === "support" && actor.twoFactor)
  );
}
