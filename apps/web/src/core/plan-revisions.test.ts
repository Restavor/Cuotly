import { describe, expect, it } from "vitest";

import { eurosToCents, readPlanTermsForm, readServiceTermsForm, revisionTone } from "./plan-catalogue";

function form(values: Record<string, string>) {
  return { get: (k: string) => values[k] ?? null };
}

const PLAN = {
  price: "299",
  includedSmall: "6",
  includedPhoto: "6",
  includedMedium: "1",
  includedLarge: "0",
  startSlaHours: "48",
  executionSlaSmall: "72",
  executionSlaPhoto: "72",
  executionSlaMedium: "72",
  executionSlaLarge: "120",
  queueRank: "0",
  reportLevel: "standard",
};

describe("RN-COM-20 · el formulario de un plan", () => {
  it("lee los términos que crean versión, con el precio en céntimos", () => {
    const r = readPlanTermsForm(form({ ...PLAN, grantsPriority: "on" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.priceCents).toBe(29900);
    expect(r.value.includedSmall).toBe(6);
    expect(r.value.startSlaHours).toBe(48);
    expect(r.value.grantsPriority).toBe(true);
    expect(r.value.canOrderRequests).toBe(false);
    expect(r.value.reportLevel).toBe("standard");
  });

  it("dice qué campo no se entiende", () => {
    expect(readPlanTermsForm(form({ ...PLAN, price: "mucho" }))).toEqual({ ok: false, error: "price" });
    expect(readPlanTermsForm(form({ ...PLAN, includedSmall: "-1" }))).toEqual({ ok: false, error: "included" });
    expect(readPlanTermsForm(form({ ...PLAN, startSlaHours: "0" }))).toEqual({ ok: false, error: "startSla" });
    expect(readPlanTermsForm(form({ ...PLAN, executionSlaLarge: "" }))).toEqual({ ok: false, error: "executionSla" });
    expect(readPlanTermsForm(form({ ...PLAN, reportLevel: "oro" }))).toEqual({ ok: false, error: "reportLevel" });
  });

  it("el precio admite coma o punto y hasta dos decimales", () => {
    expect(eurosToCents("499,5")).toBe(49950);
    expect(eurosToCents("99.00 €")).toBe(9900);
    expect(eurosToCents("1,234")).toBeUndefined();
  });
});

describe("RN-COM-29 · el formulario de un servicio", () => {
  it("el precio con Premium+ vacío es que no tiene (RN-COM-08)", () => {
    const r = readServiceTermsForm(form({ price: "229", pricePremium: "", includedUpdates: "30" }));
    expect(r).toEqual({ ok: true, value: { priceCents: 22900, pricePremiumCents: null, includedUpdates: 30 } });
    expect(readServiceTermsForm(form({ price: "229", pricePremium: "x", includedUpdates: "30" }))).toEqual({
      ok: false,
      error: "pricePremium",
    });
  });
});

describe("RN-COM-24 · el tono del estado de cada restaurante", () => {
  it("en versión anterior es lo que pide atención", () => {
    expect(revisionTone("scheduled")).toBe("info");
    expect(revisionTone("awaiting_acceptance")).toBe("warning");
    expect(revisionTone("held_back")).toBe("danger");
  });
});
