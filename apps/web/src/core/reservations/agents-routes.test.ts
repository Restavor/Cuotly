import { describe, expect, it } from "vitest";

import {
  AGENTS_PAGES,
  agentsEntry,
  agentsPageHref,
  entryPageForStatus,
  guardAgentsPage,
  restaurantBase,
} from "./agents-routes";
import type { ReservationServiceStatus, ReservationsActor } from "./permissions";

const A = "c4000000-0000-0000-0000-000000000001";
const B = "c4000000-0000-0000-0000-000000000002";
const owner: ReservationsActor = { kind: "owner" };
const manager: ReservationsActor = { kind: "manager" };
const tablet: ReservationsActor = { kind: "device" };
const staff: ReservationsActor = { kind: "staff" };

describe("AGT-03 · a dónde lleva /agents (PRD de agents §5.1)", () => {
  it("sin restaurantes con Reservas, el vacío con su motivo (no se inventa una pantalla)", () => {
    expect(agentsEntry([])).toEqual({ kind: "empty" });
  });

  it("con un solo restaurante, directo a su Hoy", () => {
    expect(agentsEntry([{ establishmentId: A, status: "active" }])).toEqual({
      kind: "redirect",
      href: `/agents/${A}/reservas`,
    });
    for (const status of ["past_due", "paused", "ending"] as const) {
      expect(agentsEntry([{ establishmentId: A, status }])).toEqual({ kind: "redirect", href: `/agents/${A}/reservas` });
    }
  });

  it("con un solo restaurante aprobado y sin pagar, a «Aprobado: datos para pagar»", () => {
    expect(agentsEntry([{ establishmentId: A, status: "approved_pending_payment" }])).toEqual({
      kind: "redirect",
      href: `/agents/${A}/pendiente-de-pago`,
    });
  });

  it("con un solo restaurante cerrado, a «Reservas cerrada»", () => {
    expect(agentsEntry([{ establishmentId: A, status: "closed" }])).toEqual({
      kind: "redirect",
      href: `/agents/${A}/cuenta-cerrada`,
    });
  });

  it("con varios restaurantes, el selector", () => {
    expect(
      agentsEntry([
        { establishmentId: A, status: "active" },
        { establishmentId: B, status: "paused" },
      ]),
    ).toEqual({ kind: "selector" });
  });

  it("cada estado tiene su pantalla de entrada", () => {
    const esperado: Record<ReservationServiceStatus, string> = {
      approved_pending_payment: "pendingPayment",
      active: "today",
      past_due: "today",
      paused: "today",
      ending: "today",
      closed: "closed",
    };
    for (const [status, pantalla] of Object.entries(esperado)) {
      expect(entryPageForStatus(status as ReservationServiceStatus)).toBe(pantalla);
    }
  });
});

describe("AGT-03 · las rutas de las pantallas (PRD de agents §11.1)", () => {
  it("las direcciones son las del PRD", () => {
    expect(restaurantBase(A)).toBe(`/agents/${A}`);
    expect(agentsPageHref(A, "today")).toBe(`/agents/${A}/reservas`);
    expect(agentsPageHref(A, "calendar")).toBe(`/agents/${A}/reservas/calendario`);
    expect(agentsPageHref(A, "newReservation")).toBe(`/agents/${A}/reservas/nueva`);
    expect(agentsPageHref(A, "calls")).toBe(`/agents/${A}/reservas/agente`);
    expect(agentsPageHref(A, "settings")).toBe(`/agents/${A}/reservas/ajustes/horarios`);
    expect(agentsPageHref(A, "team")).toBe(`/agents/${A}/reservas/ajustes/equipo`);
    expect(agentsPageHref(A, "connections")).toBe(`/agents/${A}/reservas/ajustes/conexiones`);
    expect(agentsPageHref(A, "balance")).toBe(`/agents/${A}/saldo`);
    expect(agentsPageHref(A, "plan")).toBe(`/agents/${A}/plan`);
    expect(agentsPageHref(A, "help")).toBe(`/agents/${A}/ayuda`);
    expect(agentsPageHref(A, "more")).toBe(`/agents/${A}/mas`);
    expect(agentsPageHref(A, "pendingPayment")).toBe(`/agents/${A}/pendiente-de-pago`);
    expect(agentsPageHref(A, "conditions")).toBe(`/agents/${A}/condiciones`);
    expect(agentsPageHref(A, "closed")).toBe(`/agents/${A}/cuenta-cerrada`);
  });

  it("no hay dos pantallas con la misma dirección", () => {
    const hrefs = AGENTS_PAGES.map((p) => agentsPageHref(A, p));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("AGT-03 · qué pantalla se abre en cada estado y para cada persona", () => {
  const g = (actor: ReservationsActor, status: ReservationServiceStatus, page: (typeof AGENTS_PAGES)[number]) =>
    guardAgentsPage(A, actor, status, page).kind;

  it("activa: el Propietario abre todo lo que no es una pantalla de estado", () => {
    for (const page of ["today", "calendar", "newReservation", "calls", "settings", "team", "connections", "balance", "plan", "help", "more"] as const) {
      expect(g(owner, "active", page), page).toBe("allow");
    }
  });

  it("las pantallas de estado solo existen en su estado y mandan a la que toca", () => {
    expect(guardAgentsPage(A, owner, "active", "pendingPayment")).toEqual({ kind: "redirect", href: `/agents/${A}/reservas` });
    expect(guardAgentsPage(A, owner, "active", "conditions")).toEqual({ kind: "redirect", href: `/agents/${A}/reservas` });
    expect(guardAgentsPage(A, owner, "active", "closed")).toEqual({ kind: "redirect", href: `/agents/${A}/reservas` });
    expect(g(owner, "approved_pending_payment", "pendingPayment")).toBe("allow");
    expect(g(owner, "approved_pending_payment", "conditions")).toBe("allow");
    expect(g(owner, "closed", "closed")).toBe("allow");
  });

  it("aprobada y sin pagar: la agenda lleva a los datos de pago, y el plan y el saldo se abren", () => {
    for (const page of ["today", "calendar", "calls", "newReservation"] as const) {
      expect(guardAgentsPage(A, owner, "approved_pending_payment", page), page).toEqual({
        kind: "redirect",
        href: `/agents/${A}/pendiente-de-pago`,
      });
    }
    expect(g(owner, "approved_pending_payment", "plan")).toBe("allow");
    expect(g(owner, "approved_pending_payment", "balance")).toBe("allow");
  });

  it("cerrada: todo lleva a «Reservas cerrada», y solo el Propietario entra ahí", () => {
    for (const page of ["today", "settings", "balance", "plan", "help"] as const) {
      expect(guardAgentsPage(A, owner, "closed", page), page).toEqual({ kind: "redirect", href: `/agents/${A}/cuenta-cerrada` });
    }
    expect(g(manager, "closed", "closed")).toBe("denied");
    expect(g(tablet, "closed", "closed")).toBe("denied");
  });

  it("el Encargado abre la agenda y los ajustes, pero no el plan y los pagos", () => {
    expect(g(manager, "active", "today")).toBe("allow");
    expect(g(manager, "active", "settings")).toBe("allow");
    expect(g(manager, "active", "balance")).toBe("allow");
    expect(g(manager, "active", "plan")).toBe("denied");
  });

  it("RN-APP-05 · la tablet sin PIN no abre Ajustes, Saldo ni Plan, ni crea reservas", () => {
    for (const page of ["settings", "team", "connections", "balance", "plan", "newReservation"] as const) {
      expect(g(tablet, "active", page), page).toBe("denied");
    }
    for (const page of ["today", "calendar", "calls", "help", "more"] as const) {
      expect(g(tablet, "active", page), page).toBe("allow");
    }
  });

  it("RN-APP-05 · el Equipo con PIN abre la agenda y crea reservas, pero no Ajustes, Saldo ni Plan", () => {
    expect(g(staff, "active", "today")).toBe("allow");
    expect(g(staff, "active", "newReservation")).toBe("allow");
    for (const page of ["settings", "balance", "plan"] as const) expect(g(staff, "active", page), page).toBe("denied");
  });

  it("en pausa se ve la agenda, pero «Nueva reserva» no se abre", () => {
    expect(g(owner, "paused", "today")).toBe("allow");
    expect(g(owner, "paused", "newReservation")).toBe("denied");
  });

  it("Restavor sin sesión de soporte no entra en la agenda ni en las pantallas de los comensales", () => {
    const restavor: ReservationsActor = { kind: "restavor", twoFactor: true };
    expect(g(restavor, "active", "today")).toBe("denied");
    expect(g(restavor, "active", "calls")).toBe("denied");
    expect(g(restavor, "active", "help")).toBe("denied");
  });
});
