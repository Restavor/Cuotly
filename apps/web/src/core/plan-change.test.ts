import { describe, expect, it } from "vitest";

import {
  COMMITMENT_MONTHS,
  decidePlanChange,
  planChangeDirection,
  prorateePlanChange,
  remainingCycleFraction,
  type PlanTerms,
} from "./plan-change";

const IMPULSO: PlanTerms = {
  priceCents: 39900,
  includedSmall: 12,
  includedPhoto: 12,
  includedMedium: 2,
  includedLarge: 0,
};

const PREMIUM: PlanTerms = {
  priceCents: 59900,
  includedSmall: 25,
  includedPhoto: 24,
  includedMedium: 5,
  includedLarge: 1,
};

const BASICO: PlanTerms = {
  priceCents: 9900,
  includedSmall: 0,
  includedPhoto: 0,
  includedMedium: 0,
  includedLarge: 0,
};

describe("RN-COM-18 · fracción restante del ciclo", () => {
  const inicio = new Date("2026-09-01T00:00:00Z");
  const fin = new Date("2026-10-01T00:00:00Z");

  it("RN-COM-18: a mitad de ciclo queda la mitad", () => {
    expect(remainingCycleFraction(inicio, fin, new Date("2026-09-16T00:00:00Z"))).toBeCloseTo(0.5, 5);
  });

  it("RN-COM-18: recién abierto el ciclo queda entero, y agotado queda cero", () => {
    expect(remainingCycleFraction(inicio, fin, inicio)).toBe(1);
    expect(remainingCycleFraction(inicio, fin, fin)).toBe(0);
  });

  it("RN-COM-18: fuera de la ventana no se sale de [0, 1]", () => {
    expect(remainingCycleFraction(inicio, fin, new Date("2026-08-01T00:00:00Z"))).toBe(1);
    expect(remainingCycleFraction(inicio, fin, new Date("2026-11-01T00:00:00Z"))).toBe(0);
  });
});

describe("RN-COM-15 y RN-COM-18 · prorrateo de la mejora", () => {
  it("RN-COM-18: la diferencia se cobra proporcional al periodo restante", () => {
    // (59900 - 39900) * 0.5 = 10000
    expect(prorateePlanChange(IMPULSO, PREMIUM, 0.5).differenceCents).toBe(10000);
  });

  it("RN-COM-18: las unidades extra se redondean AL ALZA, a favor del cliente", () => {
    const p = prorateePlanChange(IMPULSO, PREMIUM, 0.5);
    // (25-12)*0.5 = 6,5 -> 7; (24-12)*0.5 = 6; (5-2)*0.5 = 1,5 -> 2; (1-0)*0.5 = 0,5 -> 1
    expect([p.extraSmall, p.extraPhoto, p.extraMedium, p.extraLarge]).toEqual([7, 6, 2, 1]);
  });

  it("RN-COM-18: una mejora nunca quita consumos, aunque la categoría baje", () => {
    const raro: PlanTerms = { ...PREMIUM, includedPhoto: 0 };
    expect(prorateePlanChange(IMPULSO, raro, 0.5).extraPhoto).toBe(0);
  });
});

describe("RN-COM-05, RN-COM-15, RN-COM-16 y RN-COM-17 · cuándo se aplica", () => {
  const renovacion = new Date("2026-10-01T00:00:00Z");

  it("RN-COM-15: una mejora se aplica inmediatamente", () => {
    expect(planChangeDirection(IMPULSO, PREMIUM)).toBe("upgrade");
    expect(decidePlanChange(IMPULSO, PREMIUM, renovacion, new Date("2026-12-01T00:00:00Z")))
      .toEqual({ allowed: true, applies: "immediately" });
  });

  it("RN-COM-17: una reducción con la permanencia viva no se puede, y se dice por qué", () => {
    expect(decidePlanChange(PREMIUM, BASICO, renovacion, new Date("2026-12-01T00:00:00Z")))
      .toEqual({ allowed: false, reason: "commitment_not_met" });
  });

  it("RN-COM-17: cumplida la permanencia, la reducción espera a la renovación", () => {
    expect(decidePlanChange(PREMIUM, BASICO, renovacion, new Date("2026-09-15T00:00:00Z")))
      .toEqual({ allowed: true, applies: "at_renewal" });
  });

  it("RN-COM-04 y RN-COM-05: la permanencia es de 3 meses", () => {
    expect(COMMITMENT_MONTHS).toBe(3);
  });
});
