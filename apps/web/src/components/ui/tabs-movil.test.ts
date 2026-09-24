import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Diseño móvil · P4 (docs/diseno/PLAN-MOVIL.md): en el teléfono todas las
 * pestañas se ven. Antes iban en una fila que se desplazaba de lado y las
 * del final —"Gestión", "Historial", "Notas internas"— no aparecían sin
 * saber que había que arrastrar.
 *
 * Se lee el código porque lo que importa son dos clases que un cambio
 * despistado quita sin que falle nada más; cómo queda se mira con
 * `scripts/supabase-local/barrido.mjs`.
 */
const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), "utf8");

describe("P4 · las pestañas en el teléfono", () => {
  it("las pestañas comunes se reparten en filas y solo desde sm vuelven a una", () => {
    const tabs = leer("src/components/ui/Tabs.tsx");
    expect(tabs).toMatch(/<ul className="[^"]*\bflex-wrap\b[^"]*\bsm:flex-nowrap\b/);
  });

  it("las cinco pestañas de la ficha caben en una fila de cinco columnas", () => {
    const cabecera = leer("src/components/establishment/SheetHeader.tsx");
    expect(cabecera).toContain('<ul className="grid grid-cols-5 sm:flex">');
    expect(cabecera).not.toContain("min-w-[8.5rem]");
  });
});

describe("P5 y P6 · filtros y cifras en el teléfono", () => {
  it("P5: los filtros van en rejilla, varios por fila, y solo desde sm en fila flexible", () => {
    const barra = leer("src/components/ui/FilterBar.tsx");
    expect(barra).toContain("grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]");
    // Un desplegable con anchura mínima fija volvería a dejar uno por fila.
    expect(barra).toContain('<div className="min-w-0 sm:min-w-[150px]">');
  });

  it("P6: la tarjeta de cifra se compacta en el teléfono sin bajar de 12 px", () => {
    const tarjeta = leer("src/components/ui/StatCard.tsx");
    expect(tarjeta).toContain("p-3.5");
    expect(tarjeta).toContain("text-[22px]");
    expect(tarjeta).not.toMatch(/text-\[(9|10|11)px\]/);
  });
});
