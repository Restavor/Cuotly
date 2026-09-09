import { describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import {
  MANAGEMENT_BLOCKS,
  parseManagementBlock,
  parseSheetTab,
  SHEET_TABS,
  sheetHref,
  filesHref,
} from "./tabs";

describe("las cinco pestañas de la ficha (PRD §15.2)", () => {
  it("son exactamente las cinco del PRD, en su orden", () => {
    expect(SHEET_TABS.map((t) => t.key)).toEqual([
      "summary",
      "operation",
      "data",
      "management",
      "history",
    ]);
  });

  it("cada pestaña y cada bloque tiene nombre en español, y ninguno sobra", () => {
    expect(SHEET_TABS.map((t) => t.key).sort()).toEqual(
      Object.keys(es.establishmentSheet.tabs).sort(),
    );
    expect(MANAGEMENT_BLOCKS.map((b) => b.key).sort()).toEqual(
      Object.keys(es.establishmentSheet.blocks).sort(),
    );
  });

  it("ninguna dirección se repite", () => {
    expect(new Set(SHEET_TABS.map((t) => t.slug)).size).toBe(SHEET_TABS.length);
    expect(new Set(MANAGEMENT_BLOCKS.map((b) => b.slug)).size).toBe(MANAGEMENT_BLOCKS.length);
  });

  it("una dirección desconocida enseña el Resumen, no un hueco", () => {
    expect(parseSheetTab(undefined).key).toBe("summary");
    expect(parseSheetTab("inventada").key).toBe("summary");
    expect(parseSheetTab("gestion").key).toBe("management");
    expect(parseManagementBlock("inventado").key).toBe("plan");
    expect(parseManagementBlock("archivos").key).toBe("files");
  });

  it("el enlace de una pestaña no fija bloque salvo que se le pida", () => {
    expect(sheetHref("/r/1", SHEET_TABS[3])).toBe("/r/1?vista=gestion");
    expect(sheetHref("/r/1", SHEET_TABS[3], MANAGEMENT_BLOCKS[3])).toBe(
      "/r/1?vista=gestion&bloque=archivos",
    );
  });
});

describe("la dirección del catálogo de archivos (§15.2, RN-ARC-01)", () => {
  it("sin filtro ni archivo abierto es el bloque a secas", () => {
    expect(filesHref("/r/1", { category: null, fileId: null })).toBe(
      "/r/1?vista=gestion&bloque=archivos",
    );
  });

  it("RN-ARC-01 · el filtro de categoría viaja en la dirección, así que el enlace se comparte", () => {
    expect(filesHref("/r/1", { category: "menus", fileId: null })).toBe(
      "/r/1?vista=gestion&bloque=archivos&tipo=menus",
    );
  });

  it("RN-ARC-03 · el archivo abierto en el panel de versiones también, y convive con el filtro", () => {
    expect(filesHref("/r/1", { category: "photos", fileId: "abc" })).toBe(
      "/r/1?vista=gestion&bloque=archivos&tipo=photos&archivo=abc",
    );
    expect(filesHref("/r/1", { category: null, fileId: "abc" })).toBe(
      "/r/1?vista=gestion&bloque=archivos&archivo=abc",
    );
  });
});
