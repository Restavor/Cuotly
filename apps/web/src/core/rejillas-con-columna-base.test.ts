import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Diseño móvil (P2 de docs/diseno/PLAN-MOVIL.md) · ninguna pantalla más
 * ancha que el teléfono.
 *
 * Una rejilla escrita `grid gap-6 lg:grid-cols-3` no tiene columnas por
 * debajo de `lg`: el navegador pone una implícita que mide lo que su
 * contenido más largo sin partir, y la página se sale. Así estuvo el
 * detalle de una solicitud en el panel del restaurante (427 px en un
 * teléfono de 390), y otras 150 rejillas iguales esperando su contenido
 * largo. `grid-cols-1` (una columna `minmax(0, 1fr)`) deja todo igual y
 * permite encoger.
 *
 * Este barrido falla si alguna rejilla con columnas a partir de un punto
 * de corte no dice cuántas tiene por debajo.
 */
const RAIZ = join(process.cwd(), "src");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return ruta.endsWith(".tsx") && !ruta.includes(".test.") ? [ruta] : [];
  });
}

export function rejillaSinColumnaBase(clases: string): boolean {
  const lista = clases.split(/\s+/);
  if (!lista.includes("grid")) return false;
  const conPuntoDeCorte = lista.some((c) => /^(sm|md|lg|xl|2xl|min-\[[^\]]+\]):grid-cols-/.test(c));
  const base = lista.some((c) => /^grid-cols-/.test(c));
  return conPuntoDeCorte && !base;
}

describe("P2 · las rejillas dicen sus columnas del teléfono", () => {
  it("reconoce la rejilla que se sale y la que no", () => {
    expect(rejillaSinColumnaBase("grid gap-6 lg:grid-cols-3")).toBe(true);
    expect(rejillaSinColumnaBase("grid grid-cols-1 gap-6 lg:grid-cols-3")).toBe(false);
    expect(rejillaSinColumnaBase("grid grid-cols-2 gap-3 xl:grid-cols-4")).toBe(false);
    expect(rejillaSinColumnaBase("flex gap-2 sm:grid-cols-2")).toBe(false);
    expect(rejillaSinColumnaBase("grid gap-2")).toBe(false);
  });

  it("ninguna rejilla con columnas desde un punto de corte las deja sin decir por debajo", () => {
    const culpables: string[] = [];
    for (const ruta of archivos(RAIZ)) {
      const texto = readFileSync(ruta, "utf8");
      for (const m of texto.matchAll(/className="([^"]*)"/g)) {
        if (rejillaSinColumnaBase(m[1]!)) culpables.push(`${relative(RAIZ, ruta)}: ${m[1]}`);
      }
    }
    expect(culpables).toEqual([]);
  });
});
