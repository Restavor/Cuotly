import { describe, expect, it } from "vitest";
import {
  AGENTS_DESTINATION_ACTION,
  canReservations,
  canSeeAgentsDestination,
  canSeeAmounts,
  RESERVATION_ACTIONS,
  type AgentsDestinationKey,
  type ReservationAction,
  type ReservationsActor,
  type ReservationServiceStatus,
} from "./permissions";

const owner: ReservationsActor = { kind: "owner" };
const manager: ReservationsActor = { kind: "manager" };
const staff: ReservationsActor = { kind: "staff" };
const tabletSinPin: ReservationsActor = { kind: "device" };
const restavor: ReservationsActor = { kind: "restavor", twoFactor: true };
const restavorSinAal2: ReservationsActor = { kind: "restavor", twoFactor: false };
const soporte: ReservationsActor = { kind: "support", twoFactor: true };
const soporteSinAal2: ReservationsActor = { kind: "support", twoFactor: false };

// Columnas de PRD de agents §3.2, en este orden:
// Propietario · Encargado · Equipo (con PIN) · Restavor · Soporte (en sesión)
type Fila = readonly [ReservationAction[], string, boolean, boolean, boolean, boolean, boolean];
const S = true;
const N = false;

// La tabla, copiada fila por fila del PRD y escrita aparte de la implementación: si
// alguien cambia una celda en `permissions.ts` sin cambiar el PRD, este test falla.
const TABLA: readonly Fila[] = [
  [["view_agenda"], "Ver agenda, calendario, buscar, fichas (Restavor: solo cifras)", S, S, S, N, S],
  [["view_stats"], "Ver cifras (lo único que ve Restavor de la agenda)", S, S, N, S, S],
  [
    ["create_reservation", "edit_reservation_slot", "edit_reservation_notes", "cancel_reservation", "decide_group", "mark_no_show"],
    "Crear, editar, cancelar, confirmar/rechazar grupos, «No vino»",
    S, S, S, N, S,
  ],
  [["manage_schedule_settings"], "Ajustes de horarios, aforo, días cerrados, límites", S, S, N, S, S],
  [["manage_staff_and_devices"], "Añadir/quitar Equipo, cambiar sus PIN, activar/desactivar dispositivos", S, S, N, S, S],
  [["manage_owners_and_managers"], "Añadir/quitar Propietarios y Encargados", S, N, N, S, S],
  [["toggle_agent"], "Encender y apagar el agente, su horario, teléfono para pasar llamadas", S, S, N, S, S],
  [["edit_agent_info"], "Información del agente", S, S, N, S, S],
  [["view_calls"], "Ver llamadas del agente (Equipo: sin coste; Restavor: solo cifras)", S, S, S, N, S],
  [["view_call_cost"], "Ver el coste de las llamadas", S, S, N, N, S],
  [["view_connections"], "Ver estado de las conexiones", S, S, N, S, S],
  [["view_balance"], "Ver saldo y movimientos", S, S, N, S, S],
  [["topup"], "Recargar saldo (Encargado: pide al propietario)", S, N, N, N, N],
  [["register_manual_topup"], "Registrar recargas a mano (solo Restavor)", N, N, N, S, N],
  [["toggle_messaging"], "Interruptor de WhatsApp/SMS", S, S, N, S, S],
  [["manage_plan"], "Plan, pagos, darse de baja de Reservas", S, N, N, S, N],
  [["export_all_reservations"], "Descargar todas las reservas (Excel)", S, N, N, N, S],
  [["manage_platform_config"], "Conectar plataformas, clave del agente, teléfonos del agente, color y logo", N, N, N, S, N],
  [["approve_requests"], "Aprobar solicitudes de Reservas", N, N, N, S, N],
  [["register_payment"], "Registrar pagos", N, N, N, S, N],
  [["adjust_balance"], "Ajustes de saldo", N, N, N, S, N],
  [["receive_mobile_alerts"], "Avisos al móvil (reserva nueva, pendientes, errores)", S, S, N, N, N],
  [["receive_error_alerts"], "Avisos al móvil: solo errores (Restavor)", N, N, N, S, N],
];

describe("RN-APP-04 · la tabla de permisos de Reservas (PRD §3.2), celda a celda", () => {
  for (const [acciones, texto, propietario, encargado, equipo, restavorOk, soporteOk] of TABLA) {
    for (const accion of acciones) {
      it(`RN-APP-04 · ${accion} — ${texto}`, () => {
        expect(canReservations(owner, accion), "Propietario").toBe(propietario);
        expect(canReservations(manager, accion), "Encargado").toBe(encargado);
        expect(canReservations({ kind: "device", pin: "staff" }, accion), "Equipo con PIN").toBe(equipo);
        expect(canReservations(staff, accion), "Equipo").toBe(equipo);
        // Restavor con segundo paso (las dos filas que lo exigen se prueban aparte).
        expect(canReservations(restavor, accion), "Restavor").toBe(restavorOk);
        expect(canReservations(soporte, accion), "Soporte en sesión").toBe(soporteOk);
      });
    }
  }

  it("RN-APP-04 · la tabla cubre todas las acciones que existen, ni una más ni una menos", () => {
    const enLaTabla = new Set(TABLA.flatMap(([acciones]) => acciones));
    for (const accion of RESERVATION_ACTIONS) expect(enLaTabla.has(accion), `falta ${accion}`).toBe(true);
    expect([...enLaTabla].sort()).toEqual([...RESERVATION_ACTIONS].sort());
  });

  it("RN-APP-04 · Restavor sin el segundo paso no conecta plataformas ni ajusta el saldo, pero sí el resto de lo suyo", () => {
    expect(canReservations(restavor, "manage_platform_config")).toBe(true);
    expect(canReservations(restavorSinAal2, "manage_platform_config")).toBe(false);
    expect(canReservations(restavor, "adjust_balance")).toBe(true);
    expect(canReservations(restavorSinAal2, "adjust_balance")).toBe(false);
    expect(canReservations(restavorSinAal2, "approve_requests")).toBe(true);
    expect(canReservations(restavorSinAal2, "register_payment")).toBe(true);
    expect(canReservations(restavorSinAal2, "manage_schedule_settings")).toBe(true);
  });

  it("RN-APP-04 · el soporte sin el segundo paso no es soporte: no ve nada de los comensales", () => {
    for (const accion of RESERVATION_ACTIONS) {
      // Lo que ve es exactamente lo que ve Restavor sin sesión de soporte.
      expect(canReservations(soporteSinAal2, accion), accion).toBe(canReservations(restavorSinAal2, accion));
    }
    expect(canReservations(soporteSinAal2, "view_agenda")).toBe(false);
    expect(canReservations(soporteSinAal2, "cancel_reservation")).toBe(false);
  });

  it("RN-APP-04 · Restavor fuera de una sesión de soporte nunca ve la agenda ni cambia reservas", () => {
    for (const accion of ["view_agenda", "view_calls", "view_call_cost", "create_reservation", "edit_reservation_slot", "cancel_reservation", "decide_group", "mark_no_show", "export_all_reservations"] as const) {
      expect(canReservations(restavor, accion), accion).toBe(false);
    }
    // Solo cifras.
    expect(canReservations(restavor, "view_stats")).toBe(true);
  });

  it("RN-APP-04 · el Encargado no recarga el saldo ni añade Propietarios, y el Propietario sí", () => {
    expect(canReservations(manager, "topup")).toBe(false);
    expect(canReservations(owner, "topup")).toBe(true);
    expect(canReservations(manager, "manage_owners_and_managers")).toBe(false);
    expect(canReservations(owner, "manage_owners_and_managers")).toBe(true);
  });
});

describe("RN-APP-05 · la tablet del local sin PIN", () => {
  it("RN-APP-05 · sin PIN solo se ve la agenda y las llamadas: nada se cambia", () => {
    expect(canReservations(tabletSinPin, "view_agenda")).toBe(true);
    expect(canReservations(tabletSinPin, "view_calls")).toBe(true);
    for (const accion of RESERVATION_ACTIONS) {
      if (accion === "view_agenda" || accion === "view_calls") continue;
      expect(canReservations(tabletSinPin, accion), accion).toBe(false);
    }
  });

  it("RN-APP-05 · no aparecen Saldo, Plan y pagos ni Ajustes, y sí Hoy, Calendario, Agente y Ayuda", () => {
    const visibles = (Object.keys(AGENTS_DESTINATION_ACTION) as AgentsDestinationKey[]).filter((d) =>
      canSeeAgentsDestination(tabletSinPin, d),
    );
    expect(visibles.sort()).toEqual(["agent", "calendar", "help", "today"]);
  });

  it("RN-APP-05 · ningún importe: ni el saldo ni la columna de coste de las llamadas", () => {
    expect(canSeeAmounts(tabletSinPin)).toBe(false);
    expect(canSeeAmounts(staff)).toBe(false);
    expect(canSeeAmounts({ kind: "device", pin: "staff" })).toBe(false);
    expect(canReservations(tabletSinPin, "view_call_cost")).toBe(false);
    expect(canReservations(tabletSinPin, "view_balance")).toBe(false);
  });

  it("RN-APP-05 · con el PIN de un Propietario o Encargado, esa acción se hace con los permisos de esa persona", () => {
    const conPinPropietario: ReservationsActor = { kind: "device", pin: "owner" };
    const conPinEncargado: ReservationsActor = { kind: "device", pin: "manager" };
    for (const accion of RESERVATION_ACTIONS) {
      expect(canReservations(conPinPropietario, accion), accion).toBe(canReservations(owner, accion));
      expect(canReservations(conPinEncargado, accion), accion).toBe(canReservations(manager, accion));
    }
    // Ajustes y encender el agente: solo con el PIN de Propietario o Encargado.
    expect(canReservations(conPinEncargado, "manage_schedule_settings")).toBe(true);
    expect(canReservations(conPinEncargado, "toggle_agent")).toBe(true);
    expect(canReservations({ kind: "device", pin: "staff" }, "manage_schedule_settings")).toBe(false);
    expect(canReservations({ kind: "device", pin: "staff" }, "toggle_agent")).toBe(false);
  });

  it("RN-APP-05 · el menú del Equipo con PIN tampoco enseña Ajustes, Saldo ni Plan", () => {
    const visibles = (Object.keys(AGENTS_DESTINATION_ACTION) as AgentsDestinationKey[]).filter((d) =>
      canSeeAgentsDestination(staff, d),
    );
    expect(visibles.sort()).toEqual(["agent", "calendar", "help", "today"]);
  });

  it("RN-APP-05 · el Propietario ve los siete destinos y el Encargado, todos menos Plan y pagos", () => {
    const todos = Object.keys(AGENTS_DESTINATION_ACTION) as AgentsDestinationKey[];
    expect(todos.filter((d) => canSeeAgentsDestination(owner, d)).sort()).toEqual([...todos].sort());
    expect(todos.filter((d) => !canSeeAgentsDestination(manager, d))).toEqual(["plan"]);
  });
});

describe("RN-APP-04 · el estado del servicio de Reservas (PRD §6.12)", () => {
  const con = (serviceStatus: ReservationServiceStatus) => ({ serviceStatus });

  it("RN-APP-04 · en pausa se ve todo y se cancela, confirma, rechaza y anota, pero no se crean reservas ni se cambia fecha, hora o personas", () => {
    for (const actor of [owner, manager, staff, soporte]) {
      expect(canReservations(actor, "view_agenda", con("paused"))).toBe(canReservations(actor, "view_agenda"));
      expect(canReservations(actor, "create_reservation", con("paused"))).toBe(false);
      expect(canReservations(actor, "edit_reservation_slot", con("paused"))).toBe(false);
      expect(canReservations(actor, "cancel_reservation", con("paused"))).toBe(true);
      expect(canReservations(actor, "decide_group", con("paused"))).toBe(true);
      expect(canReservations(actor, "mark_no_show", con("paused"))).toBe(true);
      expect(canReservations(actor, "edit_reservation_notes", con("paused"))).toBe(true);
    }
  });

  it("RN-APP-04 · cuando Reservas está activa, con cobro vencido o en baja, rige la tabla sin más", () => {
    for (const estado of ["active", "past_due", "ending"] as const) {
      for (const accion of RESERVATION_ACTIONS) {
        expect(canReservations(owner, accion, con(estado)), `${estado} ${accion}`).toBe(canReservations(owner, accion));
      }
      expect(canReservations(owner, "create_reservation", con(estado))).toBe(true);
    }
  });

  it("RN-APP-04 · aprobada y sin pagar, la agenda aún no se usa: solo el plan y lo que configura Restavor", () => {
    const e = con("approved_pending_payment");
    for (const accion of ["view_agenda", "view_calls", "create_reservation", "cancel_reservation", "toggle_agent"] as const) {
      expect(canReservations(owner, accion, e), accion).toBe(false);
    }
    expect(canReservations(owner, "manage_plan", e)).toBe(true);
    expect(canReservations(restavor, "manage_platform_config", e)).toBe(true);
    expect(canReservations(restavor, "register_payment", e)).toBe(true);
  });

  it("RN-APP-04 · cerrada, solo el Propietario, y solo para descargar sus reservas", () => {
    const e = con("closed");
    expect(canReservations(owner, "export_all_reservations", e)).toBe(true);
    for (const accion of RESERVATION_ACTIONS) {
      if (accion === "export_all_reservations") continue;
      expect(canReservations(owner, accion, e), `Propietario ${accion}`).toBe(false);
    }
    for (const actor of [manager, staff, tabletSinPin, restavor, soporte]) {
      for (const accion of RESERVATION_ACTIONS) {
        expect(canReservations(actor, accion, e), `${actor.kind} ${accion}`).toBe(false);
      }
    }
  });
});
