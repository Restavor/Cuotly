import { describe, expect, it } from "vitest";

import { safeReturnPath } from "./support-return";

describe("RN-APP-09 · a dónde vuelve quien sale de la sesión de soporte", () => {
  it("RN-APP-09 · solo a la ficha de Reservas de un espacio o a la de Administración", () => {
    expect(safeReturnPath("/espacios/restavor/reservas")).toBe("/espacios/restavor/reservas");
    expect(safeReturnPath("/administracion/reservas")).toBe("/administracion/reservas");
  });

  it("RN-APP-09 · una dirección de una cookie nunca lleva a otro sitio", () => {
    for (const malo of ["", "https://malo.example/", "//malo.example", "/espacios/x/reservas/../../../login", "/espacios/x", "/agents", "/espacios/X Y/reservas", "javascript:alert(1)"]) {
      expect(safeReturnPath(malo), malo).toBe("/");
    }
  });
});
