import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Diseño móvil (docs/diseno/PLAN-MOVIL.md) · el armazón ya deja 16 px a
 * cada lado en el teléfono. Una página envuelta en `p-8` le sumaba 32 px
 * más por lado y dejaba el contenido en 262 de los 390 px: la ayuda del
 * panel, las incidencias, el libro de consumos, las reseñas… Se arregló a
 * mano en diez páginas y quedaban dieciséis. El margen grande es de
 * escritorio (`sm:p-8`); este barrido falla si vuelve uno sin prefijo.
 */
const RAIZ = join(process.cwd(), "src");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return ruta.endsWith(".tsx") && !ruta.includes(".test.") ? [ruta] : [];
  });
}

describe("ningún margen de escritorio en el teléfono", () => {
  it("ninguna clase lleva p-8 sin punto de corte", () => {
    const culpables: string[] = [];
    for (const ruta of archivos(RAIZ)) {
      for (const m of readFileSync(ruta, "utf8").matchAll(/className="([^"]*)"/g)) {
        if (m[1]!.split(/\s+/).includes("p-8")) culpables.push(`${relative(RAIZ, ruta)}: ${m[1]}`);
      }
    }
    expect(culpables).toEqual([]);
  });
});
