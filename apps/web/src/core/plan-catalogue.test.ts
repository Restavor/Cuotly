import { describe, expect, it } from "vitest";

import { comparePlans, diffConditions, pickVersion, readPlansParams, restaurantsBySubject } from "./plan-catalogue";

const ID = "5a000000-0000-4000-8000-000000000001";

describe("readPlansParams", () => {
  it("sin nada, la pestaña de planes", () => {
    expect(readPlansParams({})).toEqual({
      tab: "planes",
      plan: null,
      service: null,
      subject: null,
      version: null,
      action: null,
      revision: null,
    });
  });

  it("lee el tema de Versiones y el número de versión", () => {
    expect(readPlansParams({ tab: "versiones", tema: `service:${ID}`, version: "2" })).toMatchObject({
      tab: "versiones",
      subject: { type: "service", id: ID },
      version: 2,
    });
  });

  it("descarta lo que no entiende", () => {
    expect(readPlansParams({ tab: "otra", plan: "x", tema: "grupo:1", version: "0", accion: "borrar", rev: "x" })).toEqual({
      tab: "planes",
      plan: null,
      service: null,
      subject: null,
      version: null,
      action: null,
      revision: null,
    });
  });

  it("decisión 72 · lee la acción del propietario y la versión del precio", () => {
    expect(readPlansParams({ plan: ID, accion: "editar", rev: "3" })).toMatchObject({
      plan: ID,
      action: "editar",
      revision: 3,
    });
  });
});

describe("RN-COM-13 · restaurantsBySubject", () => {
  it("cuenta restaurantes, no suscripciones", () => {
    const n = restaurantsBySubject([
      { establishmentId: "a", planId: "p1", serviceId: null },
      { establishmentId: "b", planId: "p1", serviceId: null },
      { establishmentId: "a", planId: null, serviceId: "s1" },
      { establishmentId: "a", planId: null, serviceId: "s1" },
    ]);
    expect(n.get("p1")).toBe(2);
    expect(n.get("s1")).toBe(1);
    expect(n.get("p2")).toBeUndefined();
  });
});

describe("RN-DAT-07 · pickVersion", () => {
  const v = [{ version: 1 }, { version: 3 }, { version: 2 }];
  it("sin pedir ninguna, la vigente es la más alta", () => {
    expect(pickVersion(v, null)?.version).toBe(3);
  });
  it("la pedida si existe; si no, la vigente", () => {
    expect(pickVersion(v, 2)?.version).toBe(2);
    expect(pickVersion(v, 9)?.version).toBe(3);
  });
  it("sin versiones, ninguna", () => {
    expect(pickVersion([], null)).toBeNull();
  });
});

describe("diffConditions", () => {
  it("dice qué líneas entran y cuáles salen, sin contar espacios ni mayúsculas", () => {
    const d = diffConditions(
      "Permanencia de 3 meses.\nIncluye soporte.\n\nSin fotos.",
      "permanencia  de 3 meses.\nIncluye soporte prioritario.\nSin fotos.",
    );
    expect(d.added).toEqual(["Incluye soporte prioritario."]);
    expect(d.removed).toEqual(["Incluye soporte."]);
  });

  it("reordenar párrafos no es un cambio", () => {
    expect(diffConditions("A\nB", "B\nA")).toEqual({ added: [], removed: [] });
  });
});

describe("RN-COM-15 · comparePlans", () => {
  const premium = {
    priceCents: 49900,
    includedSmall: 10,
    includedPhoto: 12,
    includedMedium: 2,
    includedLarge: 0,
    startSlaHours: 24,
    canOrderRequests: true,
    reportLevelRank: 3,
  };
  const premiumPlus = { ...premium, priceCents: 59900, includedSmall: 25, includedPhoto: 24, includedMedium: 5, includedLarge: 1, reportLevelRank: 4 };

  it("marca como mejores las cuotas que suben y no juzga el precio", () => {
    const rows = new Map(comparePlans(premium, premiumPlus).map((r) => [r.key, r]));
    expect(rows.get("small")).toEqual({ key: "small", changed: true, better: true });
    expect(rows.get("large")?.better).toBe(true);
    expect(rows.get("price")).toEqual({ key: "price", changed: true, better: false });
    expect(rows.get("startSla")).toEqual({ key: "startSla", changed: false, better: false });
  });

  it("menos horas de plazo es mejor", () => {
    const rows = new Map(comparePlans({ ...premium, startSlaHours: 48 }, premium).map((r) => [r.key, r]));
    expect(rows.get("startSla")?.better).toBe(true);
  });
});
