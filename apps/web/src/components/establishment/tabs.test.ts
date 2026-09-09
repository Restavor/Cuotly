import { describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import {
  MANAGEMENT_BLOCKS,
  parseManagementBlock,
  parseSheetTab,
  SHEET_TABS,
  sheetHref,
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
