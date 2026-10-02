import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AA_LARGE_TEXT, AA_NORMAL_TEXT, contrastRatio } from "./contrast";

/**
 * CA-22 · los colores de Restavor agents (PRD de agents §12.2, decisión 104).
 *
 * `tokens.css` es el único origen de la paleta. Esta suite LEE ese archivo —no copia
 * los valores—, así que si alguien cambia un token sin volver a medir, falla aquí. Es
 * la lección de `contrast.test.ts`: una garantía escrita en un comentario acaba
 * no estando implementada; una medida sobre el archivo real, no.
 */
const css = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");

function token(nombre: string): string {
  const m = new RegExp(`--color-${nombre}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!m) throw new Error(`No existe el token --color-${nombre} en tokens.css`);
  return m[1].toLowerCase();
}

describe("CA-22 · Restavor agents · valores del PRD §12.2", () => {
  it("los tokens de §12.2 valen lo que dice el PRD", () => {
    expect(token("origin-agent")).toBe("#5b4b9a");
    expect(token("origin-agent-bg")).toBe("#ece8f6");
    expect(token("origin-platform")).toBe("#2f6690");
    expect(token("origin-platform-bg")).toBe("#e3eef6");
    expect(token("origin-web")).toBe("#9a3469");
    expect(token("origin-web-bg")).toBe("#f8e6ef");
    expect(token("origin-manual")).toBe("#3f4a5a");
    expect(token("origin-manual-bg")).toBe("#e9ecf1");
    expect(token("pending-text")).toBe("#4a3a00");
    expect(token("pending-bg")).toBe("#f5d76e");
    expect(token("pending-row")).toBe("#fdf7e3");
    expect(token("pending-border")).toBe("#f0dc94");
    expect(token("meter-warn")).toBe("#b7791f");
    expect(token("agent-on-bg")).toBe("#e9f5ef");
    expect(token("agent-on-border")).toBe("#bfe0cf");
    expect(token("agent-off-bg")).toBe("#f1f3f1");
    expect(token("agent-off-border")).toBe("#d5dcd8");
  });
});

describe("CA-22 · Restavor agents · texto sobre su fondo (AA, 4,5:1)", () => {
  const texto = token("text");
  const blanco = token("surface");

  const pares: ReadonlyArray<readonly [string, string, string]> = [
    // Chips de origen: el color del origen sobre su fondo.
    ["chip Agente", token("origin-agent"), token("origin-agent-bg")],
    ["chip Plataforma", token("origin-platform"), token("origin-platform-bg")],
    ["chip Web", token("origin-web"), token("origin-web-bg")],
    ["chip Manual", token("origin-manual"), token("origin-manual-bg")],
    // Aviso «Reserva nueva del agente».
    ["aviso del agente", token("origin-agent-strong"), token("origin-agent-bg")],
    // Pendiente: la insignia, y el texto de la fila sobre el fondo de la fila.
    ["insignia Pendiente", token("pending-text"), token("pending-bg")],
    ["texto de una fila pendiente", texto, token("pending-row")],
    ["insignia sobre la fila pendiente", token("pending-text"), token("pending-row")],
    // «No vino»: texto blanco sobre el gris, y cancelada: ese gris sobre blanco y sobre la fila.
    ["chip No vino", blanco, token("status-muted")],
    ["reserva cancelada sobre blanco", token("status-muted"), blanco],
    ["reserva cancelada sobre el fondo", token("status-muted"), token("background")],
    // «Nueva»: blanco sobre el verde oscuro de la marca.
    ["insignia Nueva", blanco, token("primary-dark")],
    // Tarjeta del agente.
    ["Agente encendido", token("agent-on-text"), token("agent-on-bg")],
    ["texto de la tarjeta encendida", texto, token("agent-on-bg")],
    ["subtítulo de la tarjeta apagada", token("agent-off-text"), token("agent-off-bg")],
    ["título de la tarjeta apagada", texto, token("agent-off-bg")],
    // Cabecera del turno sobre el fondo de la tarjeta.
    ["texto sobre el carril del medidor", texto, token("soft-surface")],
  ];

  for (const [nombre, primerPlano, fondo] of pares) {
    it(`${nombre}: ${primerPlano} sobre ${fondo}`, () => {
      const razon = contrastRatio(primerPlano, fondo);
      expect(razon, `da ${razon.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });
  }
});

describe("CA-22 · Restavor agents · lo que no es texto (AA, 3:1)", () => {
  it("la barra de aforo se distingue de su carril: verde, casi lleno y superado", () => {
    const carril = token("soft-surface");
    for (const [nombre, relleno] of [
      ["normal", token("primary")],
      ["casi lleno", token("meter-warn")],
      ["superado", token("danger")],
    ] as const) {
      const razon = contrastRatio(relleno, carril);
      expect(razon, `${nombre} ${relleno} sobre el carril ${carril} da ${razon.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        AA_LARGE_TEXT,
      );
    }
  });

  it("los cuatro orígenes se distinguen entre sí por algo más que el color: llevan icono y nombre", () => {
    // Solo se comprueba aquí que los cuatro colores no son el mismo; el icono y el texto los
    // pone el componente (ver `components/agents/chips.test.tsx`).
    const colores = new Set(["origin-agent", "origin-platform", "origin-web", "origin-manual"].map(token));
    expect(colores.size).toBe(4);
  });

  it("el borde de la tarjeta del agente y el del pendiente son decoración: el estado va en el texto", () => {
    // No se mide: ningún borde lleva información sola (PRD §21.4). Queda dicho.
    expect(token("agent-on-border")).not.toBe(token("agent-off-border"));
    expect(token("pending-border")).not.toBe(token("pending-row"));
  });
});
