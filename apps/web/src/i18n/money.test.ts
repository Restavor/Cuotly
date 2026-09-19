import { describe, expect, it } from "vitest";

import { readableSize } from "./money";

/**
 * RN-ARC-10 · el tamaño que la ficha del restaurante enseña.
 *
 * Lo que vigila es una sola cosa: que un restaurante pequeño **no aparezca
 * como si no tuviera archivos**. "0 GB" al lado del nombre de un
 * restaurante se lee como "no tiene nada", y tener tres megas no es no
 * tener nada.
 */
describe("readableSize · el tamaño con la unidad que toca", () => {
  it("un restaurante con megas se mide en MB, no en «0 GB»", () => {
    expect(readableSize(3 * 1024 ** 2)).toBe("3,0 MB");
    expect(readableSize(640 * 1024 ** 2)).toBe("640,0 MB");
  });

  it("a partir del giga, en GB, que es como lo enseña el diseño", () => {
    expect(readableSize(Math.round(6.4 * 1024 ** 3))).toBe("6,4 GB");
    expect(readableSize(1024 ** 3)).toBe("1,0 GB");
  });

  it("lo pequeño en KB, y el cero también: nadie lee bytes de un vistazo", () => {
    expect(readableSize(0)).toBe("0 KB");
    expect(readableSize(1500)).toBe("1 KB");
  });

  it("el salto de unidad ocurre EN el límite, no un byte después", () => {
    // Un byte menos que un mega sigue siendo KB; el mega justo, ya es MB.
    expect(readableSize(1024 ** 2 - 1)).toContain("KB");
    expect(readableSize(1024 ** 2)).toBe("1,0 MB");
    expect(readableSize(1024 ** 3 - 1)).toContain("MB");
    expect(readableSize(1024 ** 3)).toBe("1,0 GB");
  });
});
