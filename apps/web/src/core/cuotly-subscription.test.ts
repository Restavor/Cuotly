import { describe, expect, it } from "vitest";

import {
  CUOTLY_CONSTANTS,
  CUOTLY_PAYMENT_METHODS,
  CUOTLY_PAYMENT_REMINDERS,
  CUOTLY_PLAN_TERMS,
  SPACE_CUOTLY_STATES,
  archiveAt,
  cuotlyChargeAmounts,
  cuotlyChargeStatus,
  fitsLimit,
  isCuotlyPaymentMethod,
  isSpaceReadOnly,
  monthlyBaseCents,
  planChangeKind,
  prorationCents,
  reactivationDeadline,
  remainingPeriodFraction,
  remindersDue,
  spaceLimits,
} from "./cuotly-subscription";

/**
 * La suscripción de Cuotly (PRD §31, RN-SUB; §4.1 a §4.7). Lo que se vigila
 * aquí es la cuenta —catálogo, límites, avisos, corte, prorrateo—, que es
 * lo único de este hito que es dominio puro. Lo demás —quién paga, quién
 * confirma, qué se congela— lo comprueba
 * `supabase/tests/plataforma_suscripcion_de_cuotly.sql` contra la base,
 * porque es donde tiene que ser verdad.
 */
describe("los dos planes de Cuotly (RN-SUB-01)", () => {
  it("RN-SUB-01 · Pro es 149 € con 5 y 5 incluidos, 20 GB, y adicionales de 25 € y 15 €", () => {
    expect(CUOTLY_PLAN_TERMS.pro).toEqual({
      priceCents: 14900,
      includedEstablishments: 5,
      includedUsers: 5,
      storageGb: 20,
      extraEstablishmentCents: 2500,
      extraUserCents: 1500,
    });
  });

  it("RN-SUB-01 · Agency es 499 € sin límites y 100 GB, y no tiene adicionales", () => {
    expect(CUOTLY_PLAN_TERMS.agency).toEqual({
      priceCents: 49900,
      includedEstablishments: null,
      includedUsers: null,
      storageGb: 100,
      extraEstablishmentCents: null,
      extraUserCents: null,
    });
  });

  it("RN-SUB-01 · la mensualidad de Pro suma los adicionales; la de Agency no tiene", () => {
    expect(monthlyBaseCents("pro", 0, 0)).toBe(14900);
    expect(monthlyBaseCents("pro", 2, 1)).toBe(14900 + 2 * 2500 + 1500);
    expect(monthlyBaseCents("agency", 3, 3)).toBe(49900);
  });

  it("RN-SUB-01 · '+ IVA' es el 21 %, en céntimos (decisión 7)", () => {
    expect(CUOTLY_CONSTANTS.tax_rate_percent).toBe(21);
    expect(cuotlyChargeAmounts(14900)).toEqual({ baseCents: 14900, taxCents: 3129, totalCents: 18029 });
    expect(cuotlyChargeAmounts(49900)).toEqual({ baseCents: 49900, taxCents: 10479, totalCents: 60379 });
  });

  it("§4.5 · se paga por transferencia o Bizum, y nada más", () => {
    expect([...CUOTLY_PAYMENT_METHODS]).toEqual(["transfer", "bizum"]);
    expect(isCuotlyPaymentMethod("bizum")).toBe(true);
    expect(isCuotlyPaymentMethod("card")).toBe(false);
  });
});

describe("el modo del espacio (RN-SUB-02, RN-SUB-08)", () => {
  it("RN-SUB-02 · son los cinco modos y ni uno más", () => {
    // Eran cuatro hasta el Hito 20. El quinto es el archivado que §127 le
    // deja hacer al propietario (RN-CIC-07): un modo más, y no un estado
    // paralelo, para que herede la solo lectura de RN-SUB-08 sin que haya
    // que acordarse de nada.
    expect([...SPACE_CUOTLY_STATES]).toEqual([
      "trial",
      "active",
      "archived_trial_ended",
      "archived_nonpayment",
      "archived_by_owner",
      "archived_by_platform",
    ]);
  });

  it("RN-SUB-08 · los tres archivados son de solo lectura; sin suscripción no hay nada que congelar", () => {
    expect(isSpaceReadOnly("archived_trial_ended")).toBe(true);
    expect(isSpaceReadOnly("archived_nonpayment")).toBe(true);
    expect(isSpaceReadOnly("archived_by_owner")).toBe(true);
    // RN-ADM-16 · el que elimina Cuotly, también.
    expect(isSpaceReadOnly("archived_by_platform")).toBe(true);
    expect(isSpaceReadOnly("active")).toBe(false);
    expect(isSpaceReadOnly("trial")).toBe(false);
    expect(isSpaceReadOnly(null)).toBe(false);
  });
});

const pro = {
  plan: "pro" as const,
  extraEstablishments: 0,
  extraUsers: 0,
  pendingPlan: null,
  pendingExtraEstablishments: 0,
  pendingExtraUsers: 0,
};

describe("los límites (RN-SUB-03, RN-SUB-04, RN-SUB-10)", () => {
  it("RN-SUB-03 · en Pro caben 5 y 5, y el sexto no cabe", () => {
    const limits = spaceLimits(pro, "active");
    expect(limits).toEqual({ maxEstablishments: 5, maxUsers: 5 });
    expect(fitsLimit(4, limits.maxEstablishments)).toBe(true);
    expect(fitsLimit(5, limits.maxEstablishments)).toBe(false);
  });

  it("RN-SUB-04 · los adicionales de Pro amplían el límite", () => {
    expect(spaceLimits({ ...pro, extraEstablishments: 2, extraUsers: 1 }, "active")).toEqual({
      maxEstablishments: 7,
      maxUsers: 6,
    });
  });

  it("RN-SUB-03 · Agency no tiene límite: 'uso razonable' no tiene umbral (pendiente 17)", () => {
    const limits = spaceLimits({ ...pro, plan: "agency" }, "active");
    expect(limits).toEqual({ maxEstablishments: null, maxUsers: null });
    expect(fitsLimit(1000, limits.maxEstablishments)).toBe(true);
  });

  it("RN-SUB-03 · en la prueba caben 2 establecimientos, también en Agency (§4.4)", () => {
    expect(CUOTLY_CONSTANTS.trial_max_establishments).toBe(2);
    expect(spaceLimits(pro, "trial").maxEstablishments).toBe(2);
    expect(spaceLimits({ ...pro, plan: "agency" }, "trial").maxEstablishments).toBe(2);
    // Los usuarios, los del plan: §4.4 no los limita aparte.
    expect(spaceLimits(pro, "trial").maxUsers).toBe(5);
    expect(spaceLimits({ ...pro, plan: "agency" }, "trial").maxUsers).toBeNull();
  });

  it("RN-SUB-10 · con un cambio a Pro programado rigen ya los límites de Pro para crecer", () => {
    expect(
      spaceLimits(
        { ...pro, plan: "agency", pendingPlan: "pro", pendingExtraEstablishments: 1, pendingExtraUsers: 0 },
        "active",
      ),
    ).toEqual({ maxEstablishments: 6, maxUsers: 5 });
  });

  it("RN-SUB-03 · sin suscripción (los espacios anteriores al Hito 17) no hay límite", () => {
    expect(spaceLimits(null, null)).toEqual({ maxEstablishments: null, maxUsers: null });
  });
});

describe("la prueba y el corte (RN-SUB-05, RN-SUB-08, RN-SUB-09)", () => {
  const due = new Date("2026-10-01T09:00:00Z");

  it("RN-SUB-05 · la prueba dura 7 días y termina sin gracia: se archiva al vencer", () => {
    expect(CUOTLY_CONSTANTS.trial_days).toBe(7);
    expect(archiveAt(due, "trial")).toEqual(due);
  });

  it("RN-SUB-08 · la suscripción activa tiene 72 h naturales de gracia", () => {
    expect(CUOTLY_CONSTANTS.grace_hours).toBe(72);
    expect(archiveAt(due, "active")).toEqual(new Date("2026-10-04T09:00:00Z"));
  });

  it("RN-SUB-09 · el pago reactiva solo durante 30 días desde el archivado", () => {
    expect(CUOTLY_CONSTANTS.reactivation_days).toBe(30);
    expect(reactivationDeadline(new Date("2026-10-04T09:00:00Z"))).toEqual(new Date("2026-11-03T09:00:00Z"));
  });
});

describe("los cinco avisos (RN-SUB-07)", () => {
  const due = new Date("2026-10-01T09:00:00Z");
  const hours = (h: number) => new Date(due.getTime() + h * 60 * 60 * 1000);

  it("RN-SUB-07 · son los cinco de §4.5, en su orden", () => {
    expect(CUOTLY_PAYMENT_REMINDERS.map((r) => r.event)).toEqual([
      "cuotly_payment_due_soon",
      "cuotly_payment_due_today",
      "cuotly_payment_overdue_24h",
      "cuotly_payment_overdue_48h",
      "cuotly_payment_final_notice",
    ]);
    expect(CUOTLY_PAYMENT_REMINDERS.map((r) => r.offsetHours)).toEqual([-72, 0, 24, 48, 60]);
  });

  it("RN-SUB-07 · cada uno toca cuando toca, y el último antes de las 72 h del corte", () => {
    expect(remindersDue(due, hours(-73))).toEqual([]);
    expect(remindersDue(due, hours(-72))).toEqual(["cuotly_payment_due_soon"]);
    expect(remindersDue(due, hours(0))).toEqual(["cuotly_payment_due_soon", "cuotly_payment_due_today"]);
    expect(remindersDue(due, hours(59))).toHaveLength(4);
    expect(remindersDue(due, hours(60))).toContain("cuotly_payment_final_notice");
    // El último aviso llega ANTES del corte de RN-SUB-08, no con él.
    expect(hours(60).getTime()).toBeLessThan(archiveAt(due, "active").getTime());
  });
});

describe("el estado del cobro (RN-SUB-06)", () => {
  const now = new Date("2026-10-02T09:00:00Z");

  it("RN-SUB-06 · se deriva del libro y del vencimiento, no se guarda", () => {
    const base = { outstandingCents: 18029, hasPendingDeclaration: false, now };
    expect(cuotlyChargeStatus({ ...base, dueAt: new Date("2026-10-05T09:00:00Z") })).toBe("pending");
    expect(cuotlyChargeStatus({ ...base, dueAt: new Date("2026-10-01T09:00:00Z") })).toBe("overdue");
    expect(cuotlyChargeStatus({ ...base, outstandingCents: 0, dueAt: new Date("2026-10-01T09:00:00Z") })).toBe(
      "paid",
    );
  });

  it("RN-SUB-08 · un pago declarado y pendiente cuenta como declarado aunque haya vencido", () => {
    expect(
      cuotlyChargeStatus({
        outstandingCents: 18029,
        hasPendingDeclaration: true,
        dueAt: new Date("2026-10-01T09:00:00Z"),
        now,
      }),
    ).toBe("declared");
  });
});

describe("el prorrateo y el cambio de plan (RN-SUB-04, RN-SUB-10)", () => {
  const start = new Date("2026-10-01T00:00:00Z");
  const end = new Date("2026-10-31T00:00:00Z");

  it("RN-COM-18 aplicada a Cuotly · la fracción es natural y va de 0 a 1", () => {
    expect(remainingPeriodFraction(start, end, new Date("2026-10-16T00:00:00Z"))).toBeCloseTo(0.5, 6);
    expect(remainingPeriodFraction(start, end, new Date("2026-09-01T00:00:00Z"))).toBe(1);
    expect(remainingPeriodFraction(start, end, new Date("2026-11-01T00:00:00Z"))).toBe(0);
    expect(remainingPeriodFraction(end, start, new Date("2026-10-16T00:00:00Z"))).toBe(0);
  });

  it("RN-SUB-10 · Pro → Agency cobra la diferencia proporcional, en céntimos", () => {
    expect(prorationCents(49900 - 14900, 0.5)).toBe(17500);
    expect(prorationCents(35000, 1 / 3)).toBe(11667);
  });

  it("RN-SUB-04 · subir un adicional se cobra en proporción; bajar no devuelve nada", () => {
    expect(prorationCents(2500, 0.4)).toBe(1000);
    expect(prorationCents(-2500, 0.4)).toBe(0);
  });

  it("RN-SUB-10 · Pro → Agency es inmediato; Agency → Pro espera a la renovación", () => {
    expect(planChangeKind("pro", "agency")).toBe("immediate");
    expect(planChangeKind("agency", "pro")).toBe("at_renewal");
    expect(planChangeKind("pro", "pro")).toBe("none");
  });

  it("RN-SUB-11 · la mensualidad siguiente se emite 7 días antes de la renovación", () => {
    expect(CUOTLY_CONSTANTS.charge_lead_days).toBe(7);
    // Con 7 días de antelación, el aviso de 3 días antes siempre tiene cobro.
    expect(CUOTLY_CONSTANTS.charge_lead_days * 24).toBeGreaterThan(72);
  });
});
