import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CA-22 · una página tiene UN solo `<main>`.
 *
 * Desde que el armazón envuelve estas rutas, el `<main id="contenido">` lo
 * pone él: el enlace "Saltar al contenido" apunta ahí y los lectores de
 * pantalla anuncian una sola región principal. Una pantalla que además
 * abriera el suyo dejaría dos regiones principales anidadas — HTML
 * inválido, y el atajo de teclado saltando a la de fuera.
 *
 * Es el fallo que introduje al meter las pantallas en el armazón: las diez
 * traían su propio `<main>` de cuando vivían sueltas. Este test lo impide
 * de vuelta, que es más fiable que acordarse.
 */
const RUTAS = join(process.cwd(), "src/app/espacios");

function pantallas(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return pantallas(full);
    return entry.endsWith(".tsx") ? [full] : [];
  });
}

describe("CA-22 · una sola región principal por pantalla", () => {
  it("CA-22: ninguna pantalla bajo el armazón abre su propio <main>", () => {
    const culpables = pantallas(RUTAS)
      .filter((file) => !file.endsWith("layout.tsx"))
      .filter((file) => /<main[\s>]/.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(process.cwd(), ""));

    expect(culpables, "el <main> lo pone el armazón, no la pantalla").toEqual([]);
  });

  it("CA-22: el armazón sí lo abre, y una sola vez", () => {
    const shell = readFileSync(
      join(process.cwd(), "src/components/shell/AppShell.tsx"),
      "utf8",
    );
    expect(shell.match(/<main[\s>]/g)?.length).toBe(1);
    expect(shell).toContain('id="contenido"');
  });
});
