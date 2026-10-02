import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AGENTS_PAGES, agentsPageHref } from "@/core/reservations/agents-routes";
import type { ReservationServiceStatus, ReservationsActor } from "@/core/reservations/permissions";
import { es } from "@/i18n/es";

import {
  agentsActiveDestination,
  agentsCreateOptions,
  agentsMenu,
  agentsMobileNav,
  DESTINATION_ICONS,
  type AgentsNavContext,
} from "./navigation";

const ID = "c4000000-0000-0000-0000-0000000000a1";
const BASE = `/agents/${ID}`;

function ctx(actor: ReservationsActor, serviceStatus: ReservationServiceStatus = "active", balanceLabel: string | null = "7,40 €"): AgentsNavContext {
  return { establishmentId: ID, name: "Casa Pepe", locality: "Sevilla", actor, serviceStatus, balanceLabel };
}
const owner = ctx({ kind: "owner" });
const manager = ctx({ kind: "manager" }, "active");
const tabletSinPin = ctx({ kind: "device" }, "active", null);
const equipo = ctx({ kind: "staff" }, "active", null);

const keys = (list: readonly { key: string }[]) => list.map((d) => d.key);

describe("AGT-03 · el menú de Restavor agents (PRD de agents §5.1)", () => {
  it("sin restaurante elegido (el selector) es el de la Fase A: un solo destino, sin sección", () => {
    const menu = agentsMenu();
    expect(keys(menu.main)).toEqual(["reservations"]);
    expect(menu.footer).toEqual([]);
    expect(menu.mainTitle).toBeNull();
  });

  it("el Propietario ve la sección «Reservas» (Hoy, Calendario, Agente de llamadas, Ajustes) y abajo Saldo, Plan y pagos y Ayuda", () => {
    const menu = agentsMenu(owner);
    expect(menu.mainTitle).toBe("Reservas");
    expect(menu.main.map((d) => d.label)).toEqual(["Hoy", "Calendario", "Agente de llamadas", "Ajustes"]);
    expect(menu.footer.map((d) => d.label)).toEqual(["Saldo", "Plan y pagos", "Ayuda"]);
  });

  it("cada destino lleva a la dirección del PRD, bajo el restaurante", () => {
    const menu = agentsMenu(owner);
    expect(menu.main.map((d) => d.href)).toEqual([
      `${BASE}/reservas`,
      `${BASE}/reservas/calendario`,
      `${BASE}/reservas/agente`,
      `${BASE}/reservas/ajustes/horarios`,
    ]);
    expect(menu.footer.map((d) => d.href)).toEqual([`${BASE}/saldo`, `${BASE}/plan`, `${BASE}/ayuda`]);
  });

  it("el saldo lleva su importe en el menú, y solo él", () => {
    const menu = agentsMenu(owner);
    expect(menu.footer.find((d) => d.key === "balance")?.badge).toBe("7,40 €");
    expect(menu.footer.filter((d) => d.badge !== undefined)).toHaveLength(1);
    expect(menu.main.every((d) => d.badge === undefined)).toBe(true);
  });

  it("sin importe que enseñar no se pinta ninguno: ni un cero inventado", () => {
    const sinSaldo = agentsMenu(ctx({ kind: "owner" }, "active", null));
    expect(sinSaldo.footer.find((d) => d.key === "balance")?.badge).toBeUndefined();
  });

  it("el Encargado ve todo menos Plan y pagos", () => {
    const menu = agentsMenu(manager);
    expect(keys(menu.main)).toEqual(["today", "calendar", "calls", "settings"]);
    expect(keys(menu.footer)).toEqual(["balance", "help"]);
  });

  it("RN-APP-05 · la tablet sin PIN no enseña Ajustes, Saldo ni Plan y pagos", () => {
    const menu = agentsMenu(tabletSinPin);
    expect(keys(menu.main)).toEqual(["today", "calendar", "calls"]);
    expect(keys(menu.footer)).toEqual(["help"]);
    expect([...menu.main, ...menu.footer].some((d) => d.badge !== undefined)).toBe(false);
  });

  it("RN-APP-05 · el Equipo con PIN tampoco enseña Ajustes, Saldo ni Plan y pagos", () => {
    const menu = agentsMenu(equipo);
    expect(keys(menu.main)).toEqual(["today", "calendar", "calls"]);
    expect(keys(menu.footer)).toEqual(["help"]);
  });

  it("aprobada y sin pagar, la agenda no sale: quedan Ajustes, Saldo, Plan y pagos y Ayuda", () => {
    const menu = agentsMenu(ctx({ kind: "owner" }, "approved_pending_payment"));
    expect(keys(menu.main)).toEqual(["settings"]);
    expect(keys(menu.footer)).toEqual(["balance", "plan", "help"]);
  });

  it("cerrada, el menú queda vacío: solo existe «Reservas cerrada»", () => {
    const menu = agentsMenu(ctx({ kind: "owner" }, "closed"));
    expect(menu.main).toEqual([]);
    expect(menu.footer).toEqual([]);
  });

  it("en pausa se ve todo el menú (se ve todo; lo que cambia es crear)", () => {
    const menu = agentsMenu(ctx({ kind: "owner" }, "paused"));
    expect(keys(menu.main)).toEqual(["today", "calendar", "calls", "settings"]);
  });

  it("ninguna clave es `agent` ni `messages`: el armazón las usa para su insignia «Próximamente» y su contador", () => {
    for (const c of [owner, manager, tabletSinPin]) {
      for (const d of [...agentsMenu(c).main, ...agentsMenu(c).footer, ...agentsMobileNav(c)]) {
        expect(d.key).not.toBe("agent");
        expect(d.key).not.toBe("messages");
      }
    }
  });

  it("todo destino tiene su icono, y el del agente es un auricular, no el de «Próximamente»", () => {
    for (const c of [owner, manager]) {
      for (const d of [...agentsMenu(c).main, ...agentsMenu(c).footer, ...agentsMobileNav(c)]) {
        expect(DESTINATION_ICONS[d.key], d.key).toBeDefined();
      }
    }
    expect(DESTINATION_ICONS.calls).toBe("headset");
    expect(DESTINATION_ICONS.balance).toBe("wallet");
  });

  it("los textos salen de es.agents.menu, no del componente", () => {
    expect(es.agents.menu.today).toBe("Hoy");
    expect(es.agents.menu.reservationsSection).toBe("Reservas");
  });
});

describe("AGT-03 · la barra de móvil: Hoy · Calendario · (+) Nueva · Agente · Más", () => {
  it("trae cuatro destinos (el (+) lo intercala el armazón) en este orden", () => {
    expect(agentsMobileNav(owner).map((d) => d.label)).toEqual(["Hoy", "Calendario", "Agente", "Más"]);
    expect(agentsMobileNav(owner).map((d) => d.href)).toEqual([
      `${BASE}/reservas`,
      `${BASE}/reservas/calendario`,
      `${BASE}/reservas/agente`,
      `${BASE}/mas`,
    ]);
  });

  it("el (+) es «Nueva» y lleva a la nueva reserva; la tablet sin PIN no lo tiene", () => {
    expect(agentsCreateOptions(owner)).toEqual([
      { key: "newReservation", label: "Nueva", href: `${BASE}/reservas/nueva` },
    ]);
    expect(agentsCreateOptions(tabletSinPin)).toEqual([]);
    // En pausa no se crean reservas (§6.12), así que tampoco hay (+).
    expect(agentsCreateOptions(ctx({ kind: "owner" }, "paused"))).toEqual([]);
    // Sin restaurante elegido, nada que crear.
    expect(agentsCreateOptions()).toEqual([]);
  });

  it("sin restaurante elegido la barra es la de la Fase A", () => {
    expect(keys(agentsMobileNav())).toEqual(["home", "reservations"]);
  });
});

describe("AGT-03 · el destino activo según la dirección", () => {
  const activo = (ruta: string, c: AgentsNavContext = owner) => agentsActiveDestination(ruta, c)?.key ?? null;

  it("cada pantalla marca su destino", () => {
    expect(activo(`${BASE}/reservas`)).toBe("today");
    expect(activo(`${BASE}/reservas/calendario`)).toBe("calendar");
    expect(activo(`${BASE}/reservas/agente`)).toBe("calls");
    expect(activo(`${BASE}/reservas/agente/informacion`)).toBe("calls");
    expect(activo(`${BASE}/reservas/ajustes/horarios`)).toBe("settings");
    expect(activo(`${BASE}/reservas/ajustes/equipo`)).toBe("settings");
    expect(activo(`${BASE}/saldo`)).toBe("balance");
    expect(activo(`${BASE}/plan`)).toBe("plan");
    expect(activo(`${BASE}/ayuda`)).toBe("help");
    expect(activo(`${BASE}/mas`)).toBe("more");
  });

  it("la ficha de una reserva y «Nueva» pertenecen a Hoy", () => {
    expect(activo(`${BASE}/reservas/nueva`)).toBe("today");
    expect(activo(`${BASE}/reservas/9f000000-0000-0000-0000-000000000001`)).toBe("today");
    expect(activo(`${BASE}/reservas/9f000000-0000-0000-0000-000000000001/editar`)).toBe("today");
  });

  it("una barra final o una consulta no cambian el destino", () => {
    expect(activo(`${BASE}/reservas/calendario/`)).toBe("calendar");
    expect(activo(`${BASE}/reservas/calendario?mes=2026-09`)).toBe("calendar");
  });

  it("las pantallas de estado y las ajenas no marcan ningún destino", () => {
    expect(activo(`${BASE}/pendiente-de-pago`)).toBeNull();
    expect(activo(`${BASE}/cuenta-cerrada`)).toBeNull();
    expect(activo("/web")).toBeNull();
    expect(activo("/agents/otro-restaurante/reservas")).toBeNull();
  });

  it("sin restaurante elegido, todo lo de /agents marca «Reservas»", () => {
    expect(agentsActiveDestination("/agents")?.key).toBe("reservations");
    expect(agentsActiveDestination("/web")).toBeNull();
  });
});

describe("AGT-03 · cada destino lleva a una ruta que existe (barrido de /agents)", () => {
  const raiz = join(process.cwd(), "src/app");
  const existe = (href: string) => {
    const ruta = href.replace(ID, "[id]");
    return existsSync(join(raiz, ruta, "page.tsx"));
  };

  it("las catorce pantallas del PRD tienen su página", () => {
    for (const page of AGENTS_PAGES) {
      const href = agentsPageHref(ID, page);
      expect(existe(href), `${page} → ${href} no tiene page.tsx`).toBe(true);
    }
  });

  it("`/agents` y `/agents/<id>` también", () => {
    expect(existsSync(join(raiz, "agents", "page.tsx"))).toBe(true);
    expect(existsSync(join(raiz, "agents", "[id]", "page.tsx"))).toBe(true);
  });

  it("todo destino que pinta el menú, la barra y el (+) está entre esas pantallas", () => {
    const todos = [
      ...agentsMenu(owner).main,
      ...agentsMenu(owner).footer,
      ...agentsMobileNav(owner),
      ...agentsCreateOptions(owner),
    ];
    const hrefs = new Set(AGENTS_PAGES.map((p) => agentsPageHref(ID, p)));
    for (const d of todos) expect(hrefs.has(d.href), `${d.key} → ${d.href}`).toBe(true);
  });
});
