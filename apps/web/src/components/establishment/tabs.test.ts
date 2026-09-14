import { describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import {
  DATA_SECTION_TABS,
  DATA_TAB,
  dataSectionHref,
  parseDataSection,
  FILES_BLOCK,
  MANAGEMENT_BLOCKS,
  MANAGEMENT_TAB,
  parseManagementBlock,
  parseSheetTab,
  SHEET_TABS,
  sheetHref,
  filesHref,
} from "./tabs";

describe("las cinco pestañas de la ficha (PRD §15.2)", () => {
  it("los dos bloques que se nombran desde fuera se buscan por clave, no por posición", () => {
    // Es la prueba de la trampa que dejó la migración 57 al poner la ficha
    // de datos primera: `MANAGEMENT_BLOCKS[3]` era "archivos" y pasó a ser
    // "usuarios" sin que fallara ningún tipo.
    expect(MANAGEMENT_TAB.key).toBe("management");
    expect(FILES_BLOCK.key).toBe("files");
  });

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
    // Un bloque desconocido cae en el primero, que desde la migración 57
    // es la ficha de datos: la identidad del restaurante es lo que se
    // consulta antes que su plan.
    expect(parseManagementBlock("inventado").key).toBe("establishmentData");
    expect(parseManagementBlock("ficha").key).toBe("establishmentData");
    expect(parseManagementBlock("plan").key).toBe("plan");
    expect(parseManagementBlock("archivos").key).toBe("files");
  });

  it("el enlace de una pestaña no fija bloque salvo que se le pida", () => {
    expect(sheetHref("/r/1", MANAGEMENT_TAB)).toBe("/r/1?vista=gestion");
    expect(sheetHref("/r/1", MANAGEMENT_TAB, FILES_BLOCK)).toBe(
      "/r/1?vista=gestion&bloque=archivos",
    );
  });
});

describe("las seis secciones de «Informes y datos» (maquetas 09 a 12)", () => {
  it("son las del diseño, en su orden, cada una con nombre en español y dirección propia", () => {
    expect(DATA_SECTION_TABS.map((s) => s.key)).toEqual([
      "summary",
      "analytics",
      "search",
      "behavior",
      "performance",
      "opportunities",
    ]);
    expect(DATA_SECTION_TABS.map((s) => s.key).sort()).toEqual(
      Object.keys(es.establishmentSheet.dataSections).sort(),
    );
    expect(new Set(DATA_SECTION_TABS.map((s) => s.slug)).size).toBe(DATA_SECTION_TABS.length);
  });

  it("una sección desconocida enseña el Resumen; la dirección lleva pestaña y sección (CA-22)", () => {
    expect(parseDataSection(undefined).key).toBe("summary");
    expect(parseDataSection("inventada").key).toBe("summary");
    expect(parseDataSection("analitica").key).toBe("analytics");
    expect(parseDataSection("rendimiento").key).toBe("performance");
    expect(DATA_TAB.slug).toBe("datos");
    expect(dataSectionHref("/r/1", parseDataSection("busqueda"))).toBe("/r/1?vista=datos&seccion=busqueda");
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
