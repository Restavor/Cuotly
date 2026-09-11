import { describe, expect, it } from "vitest";

import { fechaCorta } from "./dates";

describe("fechas cortas", () => {
  it("pinta el día y el mes abreviado, como la maqueta", () => {
    expect(fechaCorta("2026-09-13")).toBe("13 sept");
  });

  it("no se come un día: un 1 de enero sigue siendo el 1 de enero", () => {
    // Leer "2026-01-01" como UTC y pintarlo en un huso al oeste daría
    // "31 dic". Es el fallo por el que la fecha se construye a
    // medianoche LOCAL y no con `new Date(value)` a secas.
    expect(fechaCorta("2026-01-01")).toBe("1 ene");
  });
});
