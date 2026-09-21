import { describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import {
  DATA_SECTION_TABS,
  DATA_TAB,
  dataSectionHref,
  parseDataSection,
  OPERATION_SECTION_TABS,
  operationSectionHref,
  operationSectionLabel,
  parseOperationSection,
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

  it("RN-EST-14 · Gestión tiene los nueve bloques del diseño, en su orden", () => {
    expect(MANAGEMENT_BLOCKS.map((b) => b.key)).toEqual([
      "establishmentData",
      "plan",
      "payments",
      "users",
      "files",
      "integrations",
      "internalNotes",
      "backups",
      "serviceStatus",
    ]);
  });

  it("RN-EST-14 · los `slug` de los siete que ya existían NO cambian", () => {
    // La pestaña viaja en la dirección, así que un `slug` que cambia rompe
    // los enlaces que alguien tenga guardados o pegados en un mensaje. Las
    // dos que se añaden traen hueco nuevo; las otras siete se quedan como
    // estaban.
    const porClave = new Map(MANAGEMENT_BLOCKS.map((b) => [b.key, b.slug]));
    expect(porClave.get("establishmentData")).toBe("ficha");
    expect(porClave.get("plan")).toBe("plan");
    expect(porClave.get("payments")).toBe("pagos");
    expect(porClave.get("users")).toBe("usuarios");
    expect(porClave.get("files")).toBe("archivos");
    expect(porClave.get("integrations")).toBe("integraciones");
    expect(porClave.get("serviceStatus")).toBe("estado");
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
    expect(parseManagementBlock("notas").key).toBe("internalNotes");
    expect(parseManagementBlock("copias").key).toBe("backups");
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

describe("página 25 · las cuatro secciones de Operación", () => {
  it("son exactamente las cuatro del dibujo, en su orden", () => {
    expect(OPERATION_SECTION_TABS.map((s) => s.key)).toEqual([
      "requests",
      "jobs",
      "tasks",
      "dailyMenu",
    ]);
  });

  it("una sección desconocida cae en la primera, no deja la pestaña en blanco", () => {
    // Un enlace viejo o una dirección escrita a mano enseñan Solicitudes,
    // que es lo que sale al entrar, y no un hueco ni un fallo.
    expect(parseOperationSection(undefined).key).toBe("requests");
    expect(parseOperationSection("inventada").key).toBe("requests");
    // Ni siquiera una sección de la OTRA pestaña con subsecciones, que
    // comparte el mismo hueco de la dirección (`?seccion=`).
    expect(parseOperationSection("analitica").key).toBe("requests");
  });

  it("cada slug lleva a su sección", () => {
    expect(parseOperationSection("trabajos").key).toBe("jobs");
    expect(parseOperationSection("tareas").key).toBe("tasks");
    expect(parseOperationSection("menu-diario").key).toBe("dailyMenu");
  });

  it("la dirección lleva la pestaña Y la sección", () => {
    const href = operationSectionHref("/espacios/demo/restaurantes/est-1", OPERATION_SECTION_TABS[2]);
    expect(href).toBe("/espacios/demo/restaurantes/est-1?vista=operacion&seccion=tareas");
  });

  it("cada sección se llama igual que la pantalla a la que lleva (CA-21)", () => {
    for (const section of OPERATION_SECTION_TABS) {
      expect(operationSectionLabel(section)).toBe(
        es.establishmentSheet.operationSections[section.key],
      );
    }
  });
});
