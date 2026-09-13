import { describe, expect, it } from "vitest";

import {
  FINAL_MENU_STATES,
  IN_FLIGHT_MENU_STATES,
  MENU_STATES,
  MENU_TRANSITIONS,
  canTransitionMenu,
  isMenuEditable,
  isMenuInFlight,
  isMenuState,
  menuTransition,
  menuTransitionsFrom,
} from "./menu-states";

describe("RN-MEN-09 · los once estados de §63", () => {
  it("son exactamente los once, en el orden del documento", () => {
    expect(MENU_STATES).toEqual([
      "draft",
      "prepared",
      "publication_requested",
      "pending_assignment",
      "assigned",
      "needs_information",
      "reviewing",
      "ready_to_publish",
      "published",
      "cancelled",
      "publication_error",
    ]);
    expect(isMenuState("reviewing")).toBe(true);
    expect(isMenuState("in_progress")).toBe(false);
  });

  it("toda transición une dos estados del catálogo y ninguna se repite", () => {
    const vistas = new Set<string>();
    for (const t of MENU_TRANSITIONS) {
      expect(isMenuState(t.from)).toBe(true);
      expect(isMenuState(t.to)).toBe(true);
      const clave = `${t.from}>${t.to}>${t.actor}`;
      expect(vistas.has(clave), `transición repetida: ${clave}`).toBe(false);
      vistas.add(clave);
    }
  });

  it("de un estado final no sale nada, y a todos los demás se llega", () => {
    for (const final of FINAL_MENU_STATES) {
      expect(MENU_TRANSITIONS.filter((t) => t.from === final)).toEqual([]);
    }
    for (const state of MENU_STATES) {
      if (state === "draft") continue;
      expect(MENU_TRANSITIONS.some((t) => t.to === state), `nadie llega a ${state}`).toBe(true);
    }
  });
});

describe("RN-MEN-06 · sin botón Comenzar, y quién hace cada cosa", () => {
  it("el restaurante prepara y pide; el trabajador publica; el equipo asigna", () => {
    expect(canTransitionMenu("draft", "prepared", "client")).toBe(true);
    expect(canTransitionMenu("prepared", "publication_requested", "client")).toBe(true);
    expect(canTransitionMenu("prepared", "publication_requested", "worker")).toBe(false);
    expect(canTransitionMenu("pending_assignment", "assigned", "staff")).toBe(true);
    expect(canTransitionMenu("pending_assignment", "assigned", "client")).toBe(false);
    expect(canTransitionMenu("assigned", "published", "worker")).toBe(true);
    expect(canTransitionMenu("assigned", "published", "client")).toBe(false);
  });

  it("de asignado se publica directamente: no existe ningún estado 'en curso'", () => {
    expect(MENU_STATES).not.toContain("in_progress");
    expect([...menuTransitionsFrom("assigned", "worker")].sort()).toEqual(
      ["needs_information", "ready_to_publish", "published", "publication_error"].sort(),
    );
  });

  it("un error de publicación se resuelve publicando, o cancelando el restaurante", () => {
    expect(canTransitionMenu("publication_error", "published", "worker")).toBe(true);
    expect(canTransitionMenu("publication_error", "cancelled", "client")).toBe(true);
    expect(canTransitionMenu("publication_error", "assigned", "worker")).toBe(false);
  });

  it("pedir información va y vuelve: el restaurante contesta y queda 'revisando'", () => {
    expect(canTransitionMenu("assigned", "needs_information", "worker")).toBe(true);
    expect(canTransitionMenu("needs_information", "reviewing", "client")).toBe(true);
    expect(canTransitionMenu("needs_information", "published", "worker")).toBe(false);
  });
});

describe("RN-MEN-05 · qué le pasa al contador en cada transición", () => {
  it("pedir la publicación consume; cancelar antes de Publicado devuelve", () => {
    expect(menuTransition("prepared", "publication_requested", "client")?.updates).toBe("debit");
    for (const state of IN_FLIGHT_MENU_STATES) {
      expect(menuTransition(state, "cancelled", "client")?.updates, `cancelar desde ${state}`).toBe("return");
    }
  });

  it("cancelar un borrador o un preparado no devuelve nada: no consumió", () => {
    expect(menuTransition("draft", "cancelled", "client")?.updates).toBeNull();
    expect(menuTransition("prepared", "cancelled", "client")?.updates).toBeNull();
  });

  it("después de Publicado no se cancela ni se devuelve (§60)", () => {
    expect(menuTransitionsFrom("published", "client")).toEqual([]);
    expect(menuTransitionsFrom("published", "worker")).toEqual([]);
  });

  it("la publicación solicitada pasa a pendiente de asignación sola (system), y a asignado si hay un único candidato", () => {
    expect(canTransitionMenu("publication_requested", "pending_assignment", "system")).toBe(true);
    expect(canTransitionMenu("pending_assignment", "assigned", "system")).toBe(true);
  });
});

describe("RN-MEN-03 · qué se edita", () => {
  it("todo menos publicado y cancelado admite una versión nueva", () => {
    for (const state of MENU_STATES) {
      expect(isMenuEditable(state)).toBe(!FINAL_MENU_STATES.includes(state));
    }
  });

  it("'en vuelo' son los siete estados con una publicación viva", () => {
    expect(IN_FLIGHT_MENU_STATES).toHaveLength(7);
    expect(isMenuInFlight("assigned")).toBe(true);
    expect(isMenuInFlight("prepared")).toBe(false);
    expect(isMenuInFlight("published")).toBe(false);
  });
});
