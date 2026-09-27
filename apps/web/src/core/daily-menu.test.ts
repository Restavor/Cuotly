import { describe, expect, it } from "vitest";

import { INCLUDED_TEMPLATE_LIMIT, MENU_KINDS, canCreateIncludedTemplate, linesToItems, parsePriceToCents } from "./daily-menu";

describe("RN-MEN-01 · los tipos de menú de §57", () => {
  it("RN-CRE-22 · se quedan los cinco que nombra la maestra, y ninguno más (decisión 86)", () => {
    expect(MENU_KINDS).toEqual(["daily", "christmas", "kids", "groups", "special_event"]);
  });
});

describe("RN-CRE-23 · dos plantillas incluidas, una sola vez", () => {
  it("RN-CRE-23 · la tercera no es incluida, aunque una de las dos esté archivada", () => {
    expect(INCLUDED_TEMPLATE_LIMIT).toBe(2);
    expect(canCreateIncludedTemplate(0)).toBe(true);
    expect(canCreateIncludedTemplate(1)).toBe(true);
    // Se cuentan las creadas alguna vez: archivar no libera la plaza.
    expect(canCreateIncludedTemplate(2)).toBe(false);
  });
});

describe("el editor del restaurante (§58)", () => {
  it("el precio en euros con coma o punto pasa a céntimos; vacío es sin precio; basura no se entiende", () => {
    expect(parsePriceToCents("14,50")).toBe(1450);
    expect(parsePriceToCents("14.5")).toBe(1450);
    expect(parsePriceToCents("14")).toBe(1400);
    expect(parsePriceToCents(" 9,00 € ")).toBe(900);
    expect(parsePriceToCents("")).toBeNull();
    expect(parsePriceToCents("catorce")).toBeUndefined();
    expect(parsePriceToCents("14,505")).toBeUndefined();
  });

  it("un plato por línea, sin vacías ni espacios de más", () => {
    expect(linesToItems("Ensalada\n\n  Sopa  \r\nMerluza")).toEqual(["Ensalada", "Sopa", "Merluza"]);
    expect(linesToItems("   ")).toEqual([]);
  });
});
