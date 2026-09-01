import { describe, expect, it } from "vitest";

import { AA_NORMAL_TEXT, contrastRatio, meetsAA, parseHex, relativeLuminance } from "./contrast";

/** Paleta Emerald Control (PRD §20.6), copiada de src/styles/tokens.css. */
const PALETA = {
  primaryDark: "#0b2f2a",
  primary: "#145c4e",
  cuotlyGreen: "#1d8a6a",
  background: "#f5f7f4",
  surface: "#ffffff",
  softSurface: "#eaf0ec",
  text: "#17211f",
  textSecondary: "#66736e",
  border: "#dde5e1",
  success: "#168a6d",
  warning: "#d89524",
  danger: "#c84c4c",
  info: "#3976d4",
} as const;

describe("la fórmula de WCAG está bien implementada", () => {
  it("negro sobre blanco es 21:1 y un color consigo mismo es 1:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#145c4e", "#145c4e")).toBeCloseTo(1, 5);
  });

  it("acepta abreviado y rechaza lo que no es un color", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(() => parseHex("verde")).toThrow();
  });
});

describe("CA-22 · contraste WCAG AA de la paleta Emerald Control", () => {
  const combinaciones: ReadonlyArray<readonly [string, string, string]> = [
    ["texto principal sobre fondo", PALETA.text, PALETA.background],
    ["texto principal sobre superficie", PALETA.text, PALETA.surface],
    ["texto principal sobre superficie suave", PALETA.text, PALETA.softSurface],
    ["texto secundario sobre fondo", PALETA.textSecondary, PALETA.background],
    ["texto secundario sobre superficie", PALETA.textSecondary, PALETA.surface],
    ["blanco sobre el color principal", PALETA.surface, PALETA.primary],
    ["blanco sobre el principal oscuro", PALETA.surface, PALETA.primaryDark],
    ["blanco sobre peligro", PALETA.surface, PALETA.danger],
  ];

  for (const [nombre, texto, fondo] of combinaciones) {
    it(`${nombre} cumple AA para texto normal`, () => {
      const razon = contrastRatio(texto, fondo);
      expect(razon, `${texto} sobre ${fondo} da ${razon.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    });
  }

  /**
   * Hallazgo real, medido: tres de los cuatro colores semánticos del PRD
   * §20.6 NO llegan a 4,5:1 contra blanco en ninguna de las dos
   * direcciones — `success` 4,29:1, `info` 4,45:1 y `warning` mucho menos.
   * `info` se queda a 0,05 del umbral.
   *
   * No se cambia la paleta: los colores son identidad de marca y están
   * fijados en el PRD. Lo que se fija es su USO, que es lo que CA-22
   * evalúa realmente: son colores de icono, borde, medidor y texto grande
   * —donde AA pide 3:1 y los tres pasan de sobra—, nunca de texto normal
   * ni de fondo bajo texto normal. Los badges de estado usan superficie
   * suave con el color de texto principal, que sí cumple.
   *
   * Estas aserciones son deliberadamente `false`: si alguien aclara la
   * paleta creyendo que así valen para texto, este test se lo dice.
   */
  it("los colores semánticos no valen para texto normal, y queda escrito", () => {
    for (const color of [PALETA.warning, PALETA.success, PALETA.info]) {
      expect(meetsAA(color, PALETA.surface), `${color} como texto sobre blanco`).toBe(false);
      expect(meetsAA(PALETA.surface, color), `blanco sobre ${color}`).toBe(false);
    }
  });

  it("sí valen para lo que AA mide con 3:1 — iconos, bordes y texto grande", () => {
    for (const color of [PALETA.success, PALETA.info, PALETA.danger]) {
      expect(meetsAA(PALETA.surface, color, true), `${color} con texto grande`).toBe(true);
      expect(contrastRatio(color, PALETA.surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it("el badge de estado (superficie suave + texto principal) cumple AA", () => {
    expect(meetsAA(PALETA.text, PALETA.softSurface)).toBe(true);
    expect(meetsAA(PALETA.text, PALETA.warning)).toBe(true);
  });
});
