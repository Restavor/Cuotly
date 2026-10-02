import { describe, expect, it } from "vitest";

import { capacityFillPercent, capacityState, freeSeats, overflowBy } from "./capacity";

describe("RN-RES-02 · el aforo de un turno", () => {
  it("RN-RES-02 · plazas libres = aforo − ocupación, y puede ser negativa", () => {
    expect(freeSeats(60, 57)).toBe(3);
    expect(freeSeats(60, 63)).toBe(-3);
    expect(freeSeats(40, 0)).toBe(40);
  });

  it("RN-RES-02 · la barra: verde, mostaza desde el 85 % y rojo por encima del 100 %", () => {
    // Los tres ejemplos de la maqueta: 23 de 40 (57 %), 54 de 60 (90 %) y 64 de 60.
    expect(capacityState(40, 23)).toBe("ok");
    expect(capacityState(60, 54)).toBe("warn");
    expect(capacityState(60, 64)).toBe("over");
  });

  it("RN-RES-02 · los límites: justo el 85 % ya es mostaza y justo el 100 % no es «superado»", () => {
    expect(capacityState(100, 84)).toBe("ok");
    expect(capacityState(100, 85)).toBe("warn");
    expect(capacityState(60, 60)).toBe("warn");
    expect(capacityState(60, 61)).toBe("over");
    expect(capacityState(60, 0)).toBe("ok");
  });

  it("RN-RES-02 · el relleno nunca pasa del 100 % aunque haya más gente que plazas", () => {
    expect(capacityFillPercent(60, 30)).toBe(50);
    expect(capacityFillPercent(60, 64)).toBe(100);
    expect(capacityFillPercent(60, 0)).toBe(0);
  });

  it("RN-RES-02 · un aforo que no es positivo no se mide", () => {
    expect(() => capacityState(0, 3)).toThrow(RangeError);
    expect(() => capacityFillPercent(-1, 3)).toThrow(RangeError);
  });

  it("RN-RES-02 · «Te pasas del aforo en 3 personas»: aforo 60, ocupación 57, una reserva manual de 6", () => {
    expect(overflowBy(60, 57, 6)).toBe(3);
    // La cena quedaría en 63 de 60.
    expect(57 + 6).toBe(63);
    // Si cabe, no se pasa.
    expect(overflowBy(60, 57, 3)).toBe(0);
    expect(overflowBy(60, 57, 2)).toBe(0);
  });
});
