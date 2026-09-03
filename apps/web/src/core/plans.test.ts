import { describe, expect, it } from "vitest";

import {
  commitmentIsCurrent,
  downgradeAllowedAtRenewal,
  planChangeDirection,
  planChangeOptions,
} from "./plans";

const IMPULSO = { id: "impulso", price: 39900 };
const PREMIUM = { id: "premium", price: 59900 };
const BASICO = { id: "basico", price: 9900 };

describe("RN-COM-15 y RN-COM-17 · un cambio de plan es mejora o reducción según el precio", () => {
  it("RN-COM-15: a un plan más caro es una mejora", () => {
    expect(
      planChangeDirection({
        currentPlanId: IMPULSO.id,
        targetPlanId: PREMIUM.id,
        currentPriceCents: IMPULSO.price,
        targetPriceCents: PREMIUM.price,
      }),
    ).toBe("upgrade");
  });

  it("RN-COM-17: a un plan más barato es una reducción", () => {
    expect(
      planChangeDirection({
        currentPlanId: IMPULSO.id,
        targetPlanId: BASICO.id,
        currentPriceCents: IMPULSO.price,
        targetPriceCents: BASICO.price,
      }),
    ).toBe("downgrade");
  });

  it("RN-COM-17: al mismo precio no es una mejora, porque no hay diferencia que cobrar", () => {
    expect(
      planChangeDirection({
        currentPlanId: IMPULSO.id,
        targetPlanId: "otro-al-mismo-precio",
        currentPriceCents: IMPULSO.price,
        targetPriceCents: IMPULSO.price,
      }),
    ).toBe("downgrade");
  });

  it("CA-17: el plan que ya tiene no es un cambio", () => {
    expect(
      planChangeDirection({
        currentPlanId: IMPULSO.id,
        targetPlanId: IMPULSO.id,
        currentPriceCents: IMPULSO.price,
        targetPriceCents: IMPULSO.price,
      }),
    ).toBe("same");
  });
});

describe("RN-COM-17 · la reducción espera a que se cumpla la permanencia", () => {
  const cycleEnd = new Date("2026-10-01T00:00:00Z");

  it("no se permite si el ciclo termina antes que la permanencia", () => {
    expect(
      downgradeAllowedAtRenewal({
        cycleEndsAt: cycleEnd,
        commitmentEndsAt: new Date("2026-11-15T00:00:00Z"),
      }),
    ).toBe(false);
  });

  it("se permite si la permanencia termina antes de la renovación", () => {
    expect(
      downgradeAllowedAtRenewal({
        cycleEndsAt: cycleEnd,
        commitmentEndsAt: new Date("2026-09-15T00:00:00Z"),
      }),
    ).toBe(true);
  });

  it("se permite justo cuando coinciden: la permanencia está cumplida al renovar", () => {
    expect(
      downgradeAllowedAtRenewal({ cycleEndsAt: cycleEnd, commitmentEndsAt: cycleEnd }),
    ).toBe(true);
  });

  it("sin permanencia registrada no hay nada que esperar", () => {
    expect(downgradeAllowedAtRenewal({ cycleEndsAt: cycleEnd, commitmentEndsAt: null })).toBe(true);
  });

  it("con permanencia viva y sin ciclo abierto no se decide que sí", () => {
    // P6: no se sabe cuándo renovaría, así que no se ofrece. El servidor
    // tampoco lo permitiría, y suponer que sí sería enseñar un botón que
    // devuelve un error.
    expect(
      downgradeAllowedAtRenewal({
        cycleEndsAt: null,
        commitmentEndsAt: new Date("2026-11-15T00:00:00Z"),
      }),
    ).toBe(false);
  });
});

describe("RN-COM-04, RN-COM-05 y RN-COM-09 · si la permanencia sigue viva", () => {
  const ahora = new Date("2026-09-03T12:00:00Z");

  it("una permanencia que acaba después de hoy está vigente", () => {
    expect(commitmentIsCurrent(ahora, new Date("2026-12-03T12:00:00Z"))).toBe(true);
  });

  it("una permanencia ya vencida no lo está", () => {
    expect(commitmentIsCurrent(ahora, new Date("2026-08-03T12:00:00Z"))).toBe(false);
  });

  it("sin fecha de fin no se supone permanencia eterna", () => {
    expect(commitmentIsCurrent(ahora, null)).toBe(false);
  });
});

describe("§6.4 · qué caminos se le pueden ofrecer a un cambio de plan", () => {
  const cycleEndsAt = new Date("2026-10-01T00:00:00Z");

  it("RN-COM-15 y RN-COM-16: una mejora se puede hacer ahora o esperar a la renovación", () => {
    expect(
      planChangeOptions({
        currentPlanId: IMPULSO.id,
        targetPlanId: PREMIUM.id,
        currentPriceCents: IMPULSO.price,
        targetPriceCents: PREMIUM.price,
        cycleEndsAt,
        commitmentEndsAt: new Date("2026-12-01T00:00:00Z"),
      }),
    ).toEqual(["immediate", "renewal"]);
  });

  it("RN-COM-15: la permanencia viva NO frena una mejora, solo una reducción", () => {
    const opciones = planChangeOptions({
      currentPlanId: BASICO.id,
      targetPlanId: PREMIUM.id,
      currentPriceCents: BASICO.price,
      targetPriceCents: PREMIUM.price,
      cycleEndsAt,
      commitmentEndsAt: new Date("2027-01-01T00:00:00Z"),
    });
    expect(opciones).toContain("immediate");
    expect(opciones).not.toContain("blocked");
  });

  it("RN-COM-17: la reducción solo en renovación, y no antes de cumplir la permanencia", () => {
    expect(
      planChangeOptions({
        currentPlanId: PREMIUM.id,
        targetPlanId: IMPULSO.id,
        currentPriceCents: PREMIUM.price,
        targetPriceCents: IMPULSO.price,
        cycleEndsAt,
        commitmentEndsAt: new Date("2026-12-01T00:00:00Z"),
      }),
    ).toEqual(["blocked"]);
  });

  it("RN-COM-17: cumplida la permanencia, la reducción se programa para la renovación", () => {
    expect(
      planChangeOptions({
        currentPlanId: PREMIUM.id,
        targetPlanId: IMPULSO.id,
        currentPriceCents: PREMIUM.price,
        targetPriceCents: IMPULSO.price,
        cycleEndsAt,
        commitmentEndsAt: new Date("2026-09-01T00:00:00Z"),
      }),
    ).toEqual(["renewal"]);
  });

  it("el plan que ya tiene no ofrece ningún camino", () => {
    expect(
      planChangeOptions({
        currentPlanId: IMPULSO.id,
        targetPlanId: IMPULSO.id,
        currentPriceCents: IMPULSO.price,
        targetPriceCents: IMPULSO.price,
        cycleEndsAt,
        commitmentEndsAt: null,
      }),
    ).toEqual(["none"]);
  });
});
