import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AA_LARGE_TEXT,
  AA_NORMAL_TEXT,
  blend,
  contrastRatio,
  meetsAA,
  parseHex,
  relativeLuminance,
} from "./contrast";

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

/**
 * CA-22 · lo que pintan los componentes, no lo que dice la paleta.
 *
 * Estas comprobaciones existen porque las de arriba dejaron pasar un fallo
 * real y en toda la aplicación: `StatusBadge` ponía `text-success` sobre
 * `bg-success/10`, y los cuatro tonos estaban por debajo de AA (success
 * 3,78:1, warning 2,33:1, danger 4,01:1, info 3,92:1). Ninguna aserción lo
 * veía porque todas medían la paleta cruda —`success` contra blanco— y
 * `bg-success/10` **no es** `success`: es la mezcla que hace el navegador,
 * otro color, y el contraste contra el texto del mismo tono es mucho menor.
 *
 * La regla que sale de aquí: cuando un componente usa una utilidad `/10`,
 * lo que hay que medir es la mezcla. `blend()` la calcula.
 */
describe("CA-22 · el contraste de lo que se pinta de verdad", () => {
  const TINTE = 0.1;

  const SEMANTICOS = [
    ["success", PALETA.success],
    ["warning", PALETA.warning],
    ["danger", PALETA.danger],
    ["info", PALETA.info],
  ] as const;

  it("blend() reproduce la mezcla del navegador", () => {
    // Los extremos: sin transparencia es el color, con todo es el fondo.
    expect(blend(PALETA.danger, PALETA.surface, 1)).toBe(PALETA.danger);
    expect(blend(PALETA.danger, PALETA.surface, 0)).toBe(PALETA.surface);
  });

  describe("StatusBadge · texto principal sobre el tinte del tono", () => {
    for (const [nombre, color] of SEMANTICOS) {
      it(`${nombre} cumple AA para texto normal`, () => {
        const fondo = blend(color, PALETA.surface, TINTE);
        const razon = contrastRatio(PALETA.text, fondo);
        expect(razon, `texto sobre ${fondo} da ${razon.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          AA_NORMAL_TEXT,
        );
      });
    }

    it("el tono NO vale como color del texto sobre su propio tinte", () => {
      // Deliberadamente `false`: si alguien vuelve a poner `text-success`
      // sobre `bg-success/10` creyendo que se lee, este test se lo dice.
      for (const [nombre, color] of SEMANTICOS) {
        const fondo = blend(color, PALETA.surface, TINTE);
        expect(meetsAA(color, fondo), `${nombre} como texto sobre su tinte`).toBe(false);
      }
    });
  });

  describe("iconos de los huecos · el tono sobre su tinte", () => {
    // AA pide 3:1 para lo que no es texto. Tres de los cuatro pasan.
    for (const [nombre, color] of [
      ["danger", PALETA.danger],
      ["info", PALETA.info],
    ] as const) {
      it(`${nombre} vale como icono sobre su tinte`, () => {
        const fondo = blend(color, PALETA.surface, TINTE);
        expect(contrastRatio(color, fondo)).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
      });
    }

    it("warning NO vale como icono sobre su tinte, y por eso no se usa", () => {
      // 2,15:1. No hay manera de subirlo sin un ámbar más oscuro, que
      // sería un color de marca nuevo (la paleta la fija el PRD §20.6).
      // Donde hacía falta, se usa `info`.
      const fondo = blend(PALETA.warning, PALETA.surface, TINTE);
      expect(contrastRatio(PALETA.warning, fondo)).toBeLessThan(AA_LARGE_TEXT);
    });

    it("el icono neutro sobre superficie suave sí vale", () => {
      expect(
        contrastRatio(PALETA.textSecondary, PALETA.softSurface),
      ).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
    });
  });
});


/**
 * El ámbar no vale como color de primer plano en ninguna parte, y esto lo
 * impide de vuelta.
 *
 * Medido: `warning` da 2,55:1 sobre `surface` y 2,36:1 sobre `background`,
 * contra los 3:1 que AA pide para un icono y los 4,5:1 para texto. No hay
 * superficie clara del sistema donde llegue, así que `text-warning` está
 * mal **siempre**, no "según dónde". Subirlo exigiría un ámbar más oscuro,
 * que sería un color de marca nuevo, y la paleta la fija el PRD §20.6.
 *
 * Se comprueba leyendo el código y no razonando sobre él, que es lo mismo
 * que hacen `identity-fields.test.ts` con las columnas de la ficha y
 * `audit.test.ts` con las acciones de auditoría: una regla que solo vive
 * en un comentario se salta sola a la tercera pantalla.
 *
 * Lo que SÍ vale es `bg-warning` con `text-text` encima: fondo ámbar y
 * letra oscura dan 15,09:1. Por eso se prohíbe el primer plano y no el
 * fondo.
 */
describe("CA-22 · el ámbar nunca es color de primer plano", () => {
  const RAIZ = join(process.cwd(), "src");

  function fuentes(directorio: string): string[] {
    return readdirSync(directorio).flatMap((entrada) => {
      const ruta = join(directorio, entrada);
      if (statSync(ruta).isDirectory()) return fuentes(ruta);
      return ruta.endsWith(".tsx") || ruta.endsWith(".ts") ? [ruta] : [];
    });
  }

  it("ningún componente usa text-warning", () => {
    const culpables = fuentes(RAIZ).filter((ruta) => {
      // Este propio archivo lo nombra para prohibirlo.
      if (ruta.endsWith("contrast.test.ts")) return false;
      return /\btext-warning\b/.test(readFileSync(ruta, "utf8"));
    });

    expect(
      culpables.map((ruta) => ruta.slice(RAIZ.length + 1)),
      "text-warning no llega a 3:1 sobre ninguna superficie clara de la paleta",
    ).toEqual([]);
  });

  it("y no es que el barrido no encuentre nada: text-danger sí aparece", () => {
    // Si el barrido dejara de leer archivos, la comprobación de arriba
    // pasaría siempre y no diría nada.
    const conDanger = fuentes(RAIZ).filter((ruta) =>
      /\btext-danger\b/.test(readFileSync(ruta, "utf8")),
    );
    expect(conDanger.length).toBeGreaterThan(0);
  });
});
