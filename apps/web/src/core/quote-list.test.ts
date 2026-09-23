import { describe, expect, it } from "vitest";

import { filterQuotes, readQuoteListParams } from "./quote-list";

const filas = [
  { code: "PRE-0024", concept: "Nueva sección web", establishment_id: "a", establishmentName: "Magariños", status: "draft" },
  { code: "PRE-0023", concept: "Actualización carta", establishment_id: "b", establishmentName: "La Encina", status: "sent" },
  { code: "PRE-0022", concept: "Optimización SEO", establishment_id: "a", establishmentName: "Magariños", status: "paid" },
];

describe("M49 · la lista de presupuestos (§84)", () => {
  it("lee los filtros; un estado que no existe es ninguno", () => {
    expect(readQuoteListParams({ q: " carta ", restaurante: "b", estado: "sent", presupuesto: "x" })).toEqual({
      q: "carta",
      establishmentId: "b",
      state: "sent",
      selected: "x",
    });
    expect(readQuoteListParams({ estado: "aprobado" }).state).toBeNull();
  });

  it("busca en código, concepto y restaurante sin tildes ni mayúsculas", () => {
    const p = readQuoteListParams({ q: "magarinos" });
    expect(filterQuotes(filas, p).map((f) => f.code)).toEqual(["PRE-0024", "PRE-0022"]);
    expect(filterQuotes(filas, readQuoteListParams({ q: "pre-0023" })).map((f) => f.code)).toEqual(["PRE-0023"]);
  });

  it("combina restaurante y estado", () => {
    const p = readQuoteListParams({ restaurante: "a", estado: "paid" });
    expect(filterQuotes(filas, p).map((f) => f.code)).toEqual(["PRE-0022"]);
  });
});
