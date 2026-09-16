import { describe, expect, it } from "vitest";

import {
  CLIENT_ATTENTION_KINDS,
  clientItemIsOverdue,
  contextsShape,
  filterByContext,
  isClientAttentionKind,
  orderGlobalAttention,
  totalUnread,
  type GlobalAttentionItem,
} from "./global-home";

function fila(extra: Partial<GlobalAttentionItem>): GlobalAttentionItem {
  return {
    key: extra.key ?? Math.random().toString(36),
    side: "restaurant",
    kind: "charge_to_pay",
    title: "X",
    contextName: "Casa Lola",
    href: "/x",
    dueAt: null,
    createdAt: "2026-09-01T10:00:00Z",
    overdue: false,
    ...extra,
  };
}

describe("el Inicio del contexto global (PRD §36, RN-GLO)", () => {
  it("RN-GLO-02: lo vencido va primero, pase lo que pase con sus fechas", () => {
    // El vencido es el MÁS NUEVO y con la fecha MÁS LEJANA de los tres: si
    // el orden no lo pusiera primero por estar vencido, saldría el último.
    const vencido = fila({
      key: "vencido",
      overdue: true,
      dueAt: "2027-01-01T00:00:00Z",
      createdAt: "2026-09-30T00:00:00Z",
    });
    const proximo = fila({ key: "proximo", dueAt: "2026-09-20T00:00:00Z" });
    const viejo = fila({ key: "viejo", createdAt: "2026-01-01T00:00:00Z" });

    expect(orderGlobalAttention([proximo, viejo, vencido]).map((i) => i.key)).toEqual([
      "vencido",
      "proximo",
      "viejo",
    ]);
  });

  it("RN-GLO-02: con vencimiento manda el vencimiento, y sin él la antigüedad", () => {
    const tarde = fila({ key: "tarde", dueAt: "2026-12-01T00:00:00Z" });
    const pronto = fila({ key: "pronto", dueAt: "2026-10-01T00:00:00Z" });
    const antiguo = fila({ key: "antiguo", createdAt: "2026-02-01T00:00:00Z" });
    const reciente = fila({ key: "reciente", createdAt: "2026-08-01T00:00:00Z" });

    expect(
      orderGlobalAttention([reciente, tarde, antiguo, pronto]).map((i) => i.key),
    ).toEqual(["pronto", "tarde", "antiguo", "reciente"]);
  });

  it("RN-GLO-02: ordenar no toca la lista que recibe", () => {
    const original = [fila({ key: "b", dueAt: "2026-12-01T00:00:00Z" }), fila({ key: "a" })];
    const copia = [...original];
    orderGlobalAttention(original);
    expect(original).toEqual(copia);
  });

  it("RN-GLO-02: sin fecha de vencimiento nada está vencido", () => {
    const ahora = new Date("2026-09-16T12:00:00Z");
    // Un presupuesto sin decidir no está vencido: está esperando.
    expect(clientItemIsOverdue(null, ahora)).toBe(false);
    expect(clientItemIsOverdue("2026-09-15T00:00:00Z", ahora)).toBe(true);
    expect(clientItemIsOverdue("2026-09-17T00:00:00Z", ahora)).toBe(false);
  });

  it("RN-GLO-02: el filtro deja mirar un solo contexto, y sin filtro se ve todo", () => {
    const filas = [
      fila({ key: "1", contextName: "Casa Lola" }),
      fila({ key: "2", contextName: "Bar Nuevo" }),
    ];
    expect(filterByContext(filas, null)).toHaveLength(2);
    expect(filterByContext(filas, "Bar Nuevo").map((i) => i.key)).toEqual(["2"]);
  });

  it("RN-GLO-02: una fila sin fecha de entrada va al final, y no se le inventa una", () => {
    const conFecha = fila({ key: "con", createdAt: "2026-05-01T00:00:00Z" });
    const sinFecha = fila({ key: "sin", createdAt: null });

    expect(orderGlobalAttention([sinFecha, conFecha]).map((i) => i.key)).toEqual(["con", "sin"]);
    // Lo importante no es el orden, es que el campo siga vacío: una fecha
    // inventada se leería en pantalla como si fuera cierta (CA-20).
    expect(orderGlobalAttention([sinFecha, conFecha])[1].createdAt).toBeNull();
  });

  it("RN-GLO-05: el contador de la barra suma los dos lados", () => {
    expect(
      totalUnread([{ unread_count: 3 }, { unread_count: null }, { unread_count: 2 }]),
    ).toBe(5);
    expect(totalUnread([])).toBe(0);
  });

  it("RN-GLO-03: «ningún contexto» es un estado con nombre, no una lista vacía", () => {
    // Quien acaba de entrar por una solicitud de acceso aprobada
    // (RN-ACC-03) está aquí, y tiene que leer el motivo.
    expect(contextsShape({ spaces: 0, restaurants: 0 })).toBe("none");
    expect(contextsShape({ spaces: 2, restaurants: 0 })).toBe("only_spaces");
    expect(contextsShape({ spaces: 0, restaurants: 1 })).toBe("only_restaurants");
    expect(contextsShape({ spaces: 1, restaurants: 1 })).toBe("both");
  });

  it("RN-GLO-02: los seis motivos del restaurante, y ninguno más", () => {
    expect([...CLIENT_ATTENTION_KINDS]).toEqual([
      "request_needs_information",
      "request_pending_acceptance",
      "quote_to_decide",
      "charge_to_pay",
      "menu_to_prepare",
      "terms_to_accept",
    ]);
    expect(isClientAttentionKind("charge_to_pay")).toBe(true);
    expect(isClientAttentionKind("lo_que_sea")).toBe(false);
  });
});
