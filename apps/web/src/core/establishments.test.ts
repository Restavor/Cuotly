import { describe, expect, it } from "vitest";

import {
  attentionHeadline,
  CYCLE_CATEGORY_ORDER,
  cycleUsage,
  groupAttentionByEstablishment,
  matchesFilters,
  NO_PLAN_FILTER,
  parseFilters,
  searchKey,
  sortedCycleUsage,
  type AttentionItem,
  type EstablishmentFilters,
  type FilterableEstablishment,
} from "./establishments";
import { CHANGE_CATEGORIES } from "./classification-rules";
import { ESTABLISHMENT_STATES } from "./naming";

const item = (
  kind: AttentionItem["kind"],
  id: string,
  establishmentId: string | null,
): AttentionItem => ({
  kind,
  id,
  title: id,
  establishment: establishmentId,
  establishmentId,
  deepLink: `/${id}`,
  remainingMinutes: null,
  counter: null,
});

describe("las bolsas del ciclo de la ficha (§15.2, RN-CON-01)", () => {
  it("enseña las cuatro categorías de RN-CLS y ninguna más", () => {
    expect([...CYCLE_CATEGORY_ORDER].sort()).toEqual([...CHANGE_CATEGORIES].sort());
  });

  it("RN-CON-01 · lo usado es lo incluido menos lo que queda", () => {
    const uso = cycleUsage({ category: "small", included: 25, remaining: 17 });
    expect(uso.used).toBe(8);
    expect(uso.percentUsed).toBe(32);
    expect(uso.exhausted).toBe(false);
  });

  it("RN-CON-04 y RN-CON-08 · una devolución deja el saldo por encima de lo incluido y se dice tal cual", () => {
    // Devolver un consumo antes de Comenzar sube el saldo: lo usado pasa a
    // ser negativo. No se recorta a cero, porque cero afirmaría que se ha
    // gastado algo y no se ha gastado nada.
    const uso = cycleUsage({ category: "medium", included: 5, remaining: 6 });
    expect(uso.used).toBe(-1);
    expect(uso.percentUsed).toBe(0);
  });

  it("la barra no pasa del 100 % aunque el consumo sí", () => {
    const uso = cycleUsage({ category: "large", included: 1, remaining: -2 });
    expect(uso.used).toBe(3);
    expect(uso.percentUsed).toBe(100);
    expect(uso.exhausted).toBe(true);
  });

  it("RN-COM-02 · una categoría que el plan no incluye no tiene porcentaje, tiene motivo", () => {
    // El plan Básico no incluye ningún cambio: una barra al 0 % diría
    // "te quedan todos" (CA-20).
    const uso = cycleUsage({ category: "photo", included: 0, remaining: 0 });
    expect(uso.percentUsed).toBeNull();
  });

  it("las ordena como la ficha y descarta lo que el servidor no ha devuelto", () => {
    const ordenadas = sortedCycleUsage([
      { category: "photo", included: 24, remaining: 18 },
      { category: "small", included: 25, remaining: 17 },
    ]);
    expect(ordenadas.map((u) => u.category)).toEqual(["small", "photo"]);
  });
});

describe("la columna 'Necesita atención' del listado (§20.2)", () => {
  it("RN-SLA-17 · manda el motivo más urgente, no el más frecuente", () => {
    const resumen = attentionHeadline([
      item("request_pending_validation", "a", "e1"),
      item("request_pending_validation", "b", "e1"),
      item("job_out_of_deadline", "c", "e1"),
    ]);
    expect(resumen).toEqual({ kind: "job_out_of_deadline", count: 1, others: 2 });
  });

  it("cuenta cuántos hay del mismo motivo", () => {
    const resumen = attentionHeadline([
      item("job_pending_assignment", "a", "e1"),
      item("job_pending_assignment", "b", "e1"),
    ]);
    expect(resumen).toEqual({ kind: "job_pending_assignment", count: 2, others: 0 });
  });

  it("sin nada pendiente contesta null, que la pantalla lee como 'Sin pendientes'", () => {
    expect(attentionHeadline([])).toBeNull();
  });

  it("agrupa por identificador y no por nombre: dos restaurantes pueden llamarse igual", () => {
    const porRestaurante = groupAttentionByEstablishment([
      item("job_out_of_deadline", "a", "e1"),
      item("job_out_of_deadline", "b", "e2"),
      item("request_pending_validation", "c", "e1"),
      item("request_pending_validation", "d", null),
    ]);
    expect(porRestaurante.get("e1")?.length).toBe(2);
    expect(porRestaurante.get("e2")?.length).toBe(1);
    expect(porRestaurante.size).toBe(2);
  });
});

describe("los filtros del listado", () => {
  const magarinos: FilterableEstablishment = {
    name: "Magariños",
    code: "EST-0048",
    groupId: "g1",
    planId: "p-premium",
    status: "active",
  };
  const sinPlan: FilterableEstablishment = {
    name: "Puerto Chico",
    code: "EST-0050",
    groupId: "g2",
    planId: null,
    status: "paused",
  };

  const filtros = (parcial: Partial<EstablishmentFilters> = {}): EstablishmentFilters => ({
    search: "",
    groupId: null,
    planId: null,
    status: null,
    ...parcial,
  });

  it("busca sin tildes y sin mayúsculas", () => {
    expect(searchKey("Magariños")).toBe("magarinos");
    expect(matchesFilters(magarinos, filtros({ search: "magarinos" }))).toBe(true);
    expect(matchesFilters(magarinos, filtros({ search: "MAGARIÑOS" }))).toBe(true);
  });

  it("RN-EST-06 · también busca por el código correlativo", () => {
    expect(matchesFilters(magarinos, filtros({ search: "est-0048" }))).toBe(true);
    expect(matchesFilters(sinPlan, filtros({ search: "est-0048" }))).toBe(false);
  });

  it("filtra por grupo y por estado", () => {
    expect(matchesFilters(magarinos, filtros({ groupId: "g1" }))).toBe(true);
    expect(matchesFilters(magarinos, filtros({ groupId: "g2" }))).toBe(false);
    expect(matchesFilters(sinPlan, filtros({ status: "paused" }))).toBe(true);
    expect(matchesFilters(sinPlan, filtros({ status: "active" }))).toBe(false);
  });

  it("RN-COM-11 · 'sin plan' es un filtro, no una casilla vacía", () => {
    expect(matchesFilters(sinPlan, filtros({ planId: NO_PLAN_FILTER }))).toBe(true);
    expect(matchesFilters(magarinos, filtros({ planId: NO_PLAN_FILTER }))).toBe(false);
    expect(matchesFilters(magarinos, filtros({ planId: "p-premium" }))).toBe(true);
  });

  it("un filtro que no existe se descarta en vez de dejar la lista a cero", () => {
    const leidos = parseFilters(
      { grupo: "inventado", plan: "inventado", estado: "inventado", buscar: "  " },
      { groupIds: ["g1"], planIds: ["p-premium"] },
      ESTABLISHMENT_STATES,
    );
    expect(leidos).toEqual({ search: "  ", groupId: null, planId: null, status: null });
    expect(matchesFilters(magarinos, leidos)).toBe(true);
  });

  it("lee de la dirección lo que sí reconoce", () => {
    const leidos = parseFilters(
      { grupo: "g1", plan: NO_PLAN_FILTER, estado: "paused" },
      { groupIds: ["g1"], planIds: ["p-premium"] },
      ESTABLISHMENT_STATES,
    );
    expect(leidos).toEqual({ search: "", groupId: "g1", planId: NO_PLAN_FILTER, status: "paused" });
  });
});
