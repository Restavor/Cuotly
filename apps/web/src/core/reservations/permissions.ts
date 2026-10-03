/**
 * `src/core/reservations/permissions.ts` · quién puede qué en Reservas
 * (RN-APP-04 y RN-APP-05; PRD de agents §3.2 y §3.3).
 *
 * Es la tabla §3.2 hecha función: `canReservations(actor, acción, recurso)`. Una fila
 * de la tabla es una acción; una columna, un tipo de actor. Su gemela SQL son las RPC de
 * las fases siguientes (`reservations_my_role()`, `reservations_can_read()`); esto
 * decide qué se enseña y qué se intenta, y el servidor vuelve a comprobarlo todo:
 * ocultar un botón no es un control de acceso (CLAUDE.md).
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React. El actor llega ya
 * resuelto (quién es en este restaurante, si hay sesión de soporte abierta, si el
 * segundo paso está hecho); aquí no se mira ninguna base de datos.
 */

/** Estados del servicio que cambian lo que se puede hacer (PRD §6.12). */
export type ReservationServiceStatus =
  | "approved_pending_payment"
  | "active"
  | "past_due"
  | "paused"
  | "ending"
  | "closed";

/**
 * Los actores de la tabla §3.2:
 * - `owner`: Propietario (`local_owner` del restaurante o `global_owner` de su grupo).
 * - `manager`: Encargado (un Editor con `manage_reservations`).
 * - `staff`: el Equipo sin cuenta, con su PIN, en la tablet del local.
 * - `device`: la tablet del local SIN PIN; con `pin` pone el PIN de alguien y esa
 *   acción se ejecuta con los permisos de esa persona (§3.3).
 * - `restavor`: el equipo del espacio `restavor` fuera de una sesión de soporte.
 * - `support`: quien está marcado como soporte, dentro de una sesión de soporte de
 *   Reservas abierta. Sin el segundo paso (`twoFactor`) no es soporte: no ve nada de
 *   los comensales.
 */
export type ReservationsActor =
  | { readonly kind: "owner" }
  | { readonly kind: "manager" }
  | { readonly kind: "staff" }
  | { readonly kind: "device"; readonly pin?: "owner" | "manager" | "staff" }
  | { readonly kind: "restavor"; readonly twoFactor: boolean }
  | { readonly kind: "support"; readonly twoFactor: boolean };

export const RESERVATION_ACTIONS = [
  // Ver
  "view_agenda",
  "view_stats",
  "view_calls",
  "view_call_cost",
  "view_connections",
  "view_balance",
  // Cambiar reservas (la fila «Crear, editar, cancelar, confirmar/rechazar grupos, "No vino"»)
  "create_reservation",
  "edit_reservation_slot",
  "edit_reservation_notes",
  "cancel_reservation",
  "decide_group",
  "mark_no_show",
  // Configurar
  "manage_schedule_settings",
  "manage_staff_and_devices",
  "manage_owners_and_managers",
  "toggle_agent",
  "edit_agent_info",
  "toggle_messaging",
  // Dinero y plan
  "topup",
  "register_manual_topup",
  "manage_plan",
  "export_all_reservations",
  // Solo Restavor
  "manage_platform_config",
  "approve_requests",
  "register_payment",
  "adjust_balance",
  // Avisos
  "receive_mobile_alerts",
  "receive_error_alerts",
] as const;

export type ReservationAction = (typeof RESERVATION_ACTIONS)[number];

export interface ReservationResource {
  /** Estado del servicio de Reservas del restaurante; sin decir, `active`. */
  readonly serviceStatus?: ReservationServiceStatus;
}

/** Las acciones que cambian una reserva (la fila agrupada de §3.2). */
const CHANGE_ACTIONS: ReadonlySet<ReservationAction> = new Set([
  "create_reservation",
  "edit_reservation_slot",
  "edit_reservation_notes",
  "cancel_reservation",
  "decide_group",
  "mark_no_show",
]);

/** Las acciones que ponen una reserva nueva en la agenda o mueven su fecha, hora o personas (RN-RES-11: en pausa, no). */
const BOOKING_ACTIONS: ReadonlySet<ReservationAction> = new Set(["create_reservation", "edit_reservation_slot"]);

/**
 * Las acciones que son de la agenda de Reservas en uso: solo con el servicio pagado. «Información del
 * agente» NO está aquí: PRD §6.12 dice que en «Aprobado: datos para pagar» Restavor configura el agente
 * y las plataformas, así que la información se puede preparar antes del primer pago.
 */
const AGENDA_ACTIONS: ReadonlySet<ReservationAction> = new Set<ReservationAction>([
  "view_agenda",
  "view_calls",
  "view_call_cost",
  "toggle_agent",
  ...CHANGE_ACTIONS,
]);

type Role = "owner" | "manager" | "staff" | "device" | "restavor" | "support";

/**
 * La tabla §3.2: para cada acción, qué roles pueden. `restavor` y `support` van aparte
 * porque dependen del segundo paso en algunas filas.
 */
const MATRIX: Readonly<Record<ReservationAction, readonly Role[]>> = {
  // «Ver agenda, calendario, buscar, fichas»: Restavor solo ve cifras.
  view_agenda: ["owner", "manager", "staff", "device", "support"],
  view_stats: ["owner", "manager", "restavor", "support"],
  // «Ver llamadas del agente»: el Equipo y la tablet las ven sin coste.
  view_calls: ["owner", "manager", "staff", "device", "support"],
  view_call_cost: ["owner", "manager", "support"],
  view_connections: ["owner", "manager", "restavor", "support"],
  // «Ver saldo y movimientos»: nunca el Equipo ni la tablet sin PIN.
  view_balance: ["owner", "manager", "restavor", "support"],

  // «Crear, editar, cancelar, confirmar/rechazar grupos, "No vino"»: Restavor, nada.
  create_reservation: ["owner", "manager", "staff", "support"],
  edit_reservation_slot: ["owner", "manager", "staff", "support"],
  edit_reservation_notes: ["owner", "manager", "staff", "support"],
  cancel_reservation: ["owner", "manager", "staff", "support"],
  decide_group: ["owner", "manager", "staff", "support"],
  mark_no_show: ["owner", "manager", "staff", "support"],

  // «Ajustes de horarios, aforo, días cerrados, límites»: el Equipo no ve Ajustes.
  manage_schedule_settings: ["owner", "manager", "restavor", "support"],
  manage_staff_and_devices: ["owner", "manager", "restavor", "support"],
  // «Añadir/quitar Propietarios y Encargados»: el Encargado, no.
  manage_owners_and_managers: ["owner", "restavor", "support"],
  toggle_agent: ["owner", "manager", "restavor", "support"],
  edit_agent_info: ["owner", "manager", "restavor", "support"],
  toggle_messaging: ["owner", "manager", "restavor", "support"],

  // «Recargar saldo»: solo el Propietario; Restavor solo registra recargas a mano.
  topup: ["owner"],
  register_manual_topup: ["restavor"],
  // «Plan, pagos, darse de baja de Reservas»: el Encargado, no; el soporte, no.
  manage_plan: ["owner", "restavor"],
  // «Descargar todas las reservas (Excel)»: el Propietario y el soporte.
  export_all_reservations: ["owner", "support"],

  // «Conectar plataformas, clave del agente, teléfonos del agente…»: solo Restavor, con aal2.
  manage_platform_config: ["restavor"],
  // «Aprobar solicitudes, registrar pagos, ajustes de saldo»: solo Restavor (el ajuste, con aal2).
  approve_requests: ["restavor"],
  register_payment: ["restavor"],
  adjust_balance: ["restavor"],

  // «Avisos al móvil»: el Equipo oye la tablet, no recibe avisos; Restavor, solo errores.
  receive_mobile_alerts: ["owner", "manager"],
  receive_error_alerts: ["restavor"],
};

/** Acciones de la tabla que Restavor solo puede hacer con el segundo paso hecho. */
const RESTAVOR_NEEDS_TWO_FACTOR: ReadonlySet<ReservationAction> = new Set([
  "manage_platform_config",
  "adjust_balance",
]);

/** El actor tal como cuenta para la tabla: la tablet con PIN es la persona del PIN; el soporte sin aal2, Restavor. */
function effectiveRole(actor: ReservationsActor): { role: Role; twoFactor: boolean } {
  switch (actor.kind) {
    case "device":
      return actor.pin ? { role: actor.pin, twoFactor: false } : { role: "device", twoFactor: false };
    case "support":
      // Sin el segundo paso no hay datos de comensales: se queda en lo que ve Restavor.
      return actor.twoFactor ? { role: "support", twoFactor: true } : { role: "restavor", twoFactor: false };
    case "restavor":
      return { role: "restavor", twoFactor: actor.twoFactor };
    default:
      return { role: actor.kind, twoFactor: false };
  }
}

/**
 * ¿Puede este actor hacer esta acción en este restaurante? (RN-APP-04.)
 *
 * Además de la tabla, el estado del servicio (PRD §6.12):
 * - `approved_pending_payment`: Reservas aún no se usa; ninguna acción de la agenda.
 * - `paused`: se ve todo y se cancela, confirma o rechaza, se marca "No vino" y se
 *   anotan notas, pero NO se crean reservas ni se cambia fecha, hora o personas.
 * - `closed`: solo el Propietario, y solo para descargar sus reservas.
 */
export function canReservations(
  actor: ReservationsActor,
  action: ReservationAction,
  resource: ReservationResource = {},
): boolean {
  const status = resource.serviceStatus ?? "active";
  const { role, twoFactor } = effectiveRole(actor);

  if (status === "closed") return role === "owner" && action === "export_all_reservations";
  if (status === "approved_pending_payment" && AGENDA_ACTIONS.has(action)) return false;
  if (status === "paused" && BOOKING_ACTIONS.has(action)) return false;

  if (!MATRIX[action].includes(role)) return false;
  if (role === "restavor" && RESTAVOR_NEEDS_TWO_FACTOR.has(action) && !twoFactor) return false;
  return true;
}

/**
 * ¿Se OFRECE esta acción en pantalla? Es `canReservations` con una diferencia, la de la tablet del local sin PIN
 * (PRD §3.3): sin PIN solo se ven Hoy, Calendario, Buscar, fichas y llamadas, y **cada acción que cambia algo pide
 * «¿Quién eres?» + PIN al pulsarla**. Así que los botones de cambiar una reserva se ofrecen a la tablet, y lo que
 * decide si esa persona puede es su PIN en el servidor (`reservation_device_act`): la tabla de `canReservations`
 * sigue siendo la que dice qué puede hacer cada rol, y la tablet sin PIN no puede nada por sí sola.
 */
export function canOffer(
  actor: ReservationsActor,
  action: ReservationAction,
  resource: ReservationResource = {},
): boolean {
  if (actor.kind === "device" && actor.pin === undefined && CHANGE_ACTIONS.has(action)) {
    return canReservations({ kind: "staff" }, action, resource);
  }
  return canReservations(actor, action, resource);
}

/** ¿Se enseñan importes (saldo, coste de las llamadas)? Nunca a la tablet sin PIN ni al Equipo (RN-APP-05). */
export function canSeeAmounts(actor: ReservationsActor, resource: ReservationResource = {}): boolean {
  return canReservations(actor, "view_balance", resource) || canReservations(actor, "view_call_cost", resource);
}
