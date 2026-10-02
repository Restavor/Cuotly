/**
 * `src/core/reservations/agents-routes.ts` · a dónde lleva cada estado de Reservas y
 * qué pantallas deja abrir en cada estado (PRD de agents §5.1 y §6.12).
 *
 * Es la regla de `/agents`: con un solo restaurante con Reservas se entra directo en
 * su pantalla; con varios, un selector. Y cada pantalla solo se abre en los estados
 * que le tocan: «Aprobado: datos para pagar» solo mientras falta el primer pago,
 * «Reservas cerrada» solo cuando está cerrada, y la agenda en el resto.
 *
 * Quedan para sus fases dos desvíos que el PRD también nombra: «Acepta las condiciones»
 * antes de los datos de pago (Fase E) y «Primer uso» mientras no está terminado (Fase C).
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React. Esto decide qué se
 * enseña; el servidor vuelve a comprobar cada acción (CLAUDE.md).
 */
import {
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
  "newReservation",
  "calls",
  "settings",
  "team",
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
  newReservation: "/reservas/nueva",
  calls: "/reservas/agente",
  settings: "/reservas/ajustes/horarios",
  team: "/reservas/ajustes/equipo",
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

/**
 * La acción que abre cada pantalla (la fila de §3.2 que la protege). `null`: de todos
 * los que entran en Reservas. «Ajustes» lo abre quien puede cambiar los horarios; el
 * Equipo con PIN no lo ve (RN-APP-05).
 */
const PAGE_ACTION: Readonly<Record<AgentsPage, ReservationAction | null>> = {
  today: "view_agenda",
  calendar: "view_agenda",
  newReservation: "create_reservation",
  calls: "view_calls",
  settings: "manage_schedule_settings",
  team: "manage_staff_and_devices",
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
  if (canReservations(actor, action, { serviceStatus: status })) return { kind: "allow" };

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
