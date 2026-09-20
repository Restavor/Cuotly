import { describe, expect, it } from "vitest";
import {
  CREDIT_AMOUNT,
  DEBIT_AMOUNT,
  calculateConsumptionBalance,
  cycleAllowance,
  cycleUsage,
  describeLedgerEntry,
  isCategoryIncludedInPlan,
  resolveCancellationOutcome,
  type ChangeCategory,
  type PlanAllowance,
} from "./consumption-ledger";

describe("consumption-ledger — RN-CON, PRD §12", () => {
  describe("CA-08: el saldo es siempre la suma de los apuntes del libro", () => {
    it("con un ciclo recién creado y sin apuntes, el saldo es la bolsa incluida", () => {
      expect(calculateConsumptionBalance(16, [])).toBe(16);
    });

    it("un débito resta y una devolución suma, nunca un contador aparte", () => {
      const entries = [{ amount: DEBIT_AMOUNT }, { amount: DEBIT_AMOUNT }, { amount: CREDIT_AMOUNT }];
      expect(calculateConsumptionBalance(16, entries)).toBe(15);
    });

    it("RN-CON-06: el último crédito disponible es un saldo de 1, y el siguiente débito lo agota a 0", () => {
      expect(calculateConsumptionBalance(1, [])).toBe(1);
      expect(calculateConsumptionBalance(1, [{ amount: DEBIT_AMOUNT }])).toBe(0);
    });

    it("el saldo puede volver a subir hasta la bolsa íntegra tras devolver todo lo consumido", () => {
      const entries = [{ amount: DEBIT_AMOUNT }, { amount: CREDIT_AMOUNT }];
      expect(calculateConsumptionBalance(1, entries)).toBe(1);
    });
  });

  describe("RN-COM-01/02/12: si el plan incluye la categoría del cambio", () => {
    // Impulso+ (16/12/3/0). Impulso (6/6/1/0) y Premium (10/12/2/0) tienen
    // la misma forma: incluyen las tres primeras categorías y ningún grande.
    const impulso: PlanAllowance = { includedSmall: 16, includedPhoto: 12, includedMedium: 3, includedLarge: 0 };

    it("Impulso, Impulso+ y Premium incluyen pequeño, fotográfico y mediano", () => {
      expect(isCategoryIncludedInPlan(impulso, "small")).toBe(true);
      expect(isCategoryIncludedInPlan(impulso, "photo")).toBe(true);
      expect(isCategoryIncludedInPlan(impulso, "medium")).toBe(true);
    });

    it("RN-COM-02: Impulso, Impulso+ y Premium no incluyen \"grande\" — se presupuesta aparte; solo Premium+ lo incluye", () => {
      expect(isCategoryIncludedInPlan(impulso, "large")).toBe(false);
    });

    it("RN-COM-01: Básico (todo en cero) no incluye ninguna categoría", () => {
      const basico: PlanAllowance = { includedSmall: 0, includedPhoto: 0, includedMedium: 0, includedLarge: 0 };
      expect(isCategoryIncludedInPlan(basico, "small")).toBe(false);
      expect(isCategoryIncludedInPlan(basico, "photo")).toBe(false);
      expect(isCategoryIncludedInPlan(basico, "medium")).toBe(false);
      expect(isCategoryIncludedInPlan(basico, "large")).toBe(false);
    });
  });

  describe("RN-JOB-04 / CA-06: cancelar antes de Comenzar devuelve el consumo; después, lo mantiene", () => {
    it("CA-06: antes de Comenzar (started_at null), con débito y ciclo aún vigente -> devolución", () => {
      expect(
        resolveCancellationOutcome({ jobStartedAt: null, hasDebitEntry: true, originalCycleIsCurrent: true }),
      ).toEqual({ jobState: "cancelled_before_start", entryType: "return" });
    });

    it("CA-06: después de Comenzar (started_at fijado) -> se mantiene el consumo, sin apunte nuevo", () => {
      expect(
        resolveCancellationOutcome({
          jobStartedAt: new Date("2026-08-30T10:00:00Z"),
          hasDebitEntry: true,
          originalCycleIsCurrent: true,
        }),
      ).toEqual({ jobState: "cancelled_after_start", entryType: null });
    });

    it("RN-CON-03: un trabajo presupuestado aparte (sin débito) no genera ningún apunte al cancelar, sea cual sea el momento", () => {
      expect(
        resolveCancellationOutcome({ jobStartedAt: null, hasDebitEntry: false, originalCycleIsCurrent: true }),
      ).toEqual({ jobState: "cancelled_before_start", entryType: null });
      expect(
        resolveCancellationOutcome({
          jobStartedAt: new Date("2026-08-30T10:00:00Z"),
          hasDebitEntry: false,
          originalCycleIsCurrent: true,
        }),
      ).toEqual({ jobState: "cancelled_after_start", entryType: null });
    });
  });

  describe("RN-CON-10 / CA-07: el ciclo original ya cerró -> crédito compensatorio, no reapertura", () => {
    it("antes de Comenzar, con débito, pero el ciclo original ya no es el vigente -> crédito compensatorio", () => {
      expect(
        resolveCancellationOutcome({ jobStartedAt: null, hasDebitEntry: true, originalCycleIsCurrent: false }),
      ).toEqual({ jobState: "cancelled_before_start", entryType: "compensatory_credit" });
    });

    it("después de Comenzar, aunque el ciclo original ya haya cerrado, no se genera ningún apunte (RN-JOB-04: se mantiene el consumo)", () => {
      expect(
        resolveCancellationOutcome({
          jobStartedAt: new Date("2026-08-30T10:00:00Z"),
          hasDebitEntry: true,
          originalCycleIsCurrent: false,
        }),
      ).toEqual({ jobState: "cancelled_after_start", entryType: null });
    });
  });
});

describe("consumption-ledger — HU-24 y HU-25 (Hito 7)", () => {
  // Impulso+, tal como lo siembra la migración 96 (el Impulso del Hito 2):
  // 16 pequeños, 12 fotográficos, 3 medianos y ningún grande (RN-COM-02).
  const cicloImpulso = {
    includedSmall: 16,
    includedPhoto: 12,
    includedMedium: 3,
    includedLarge: 0,
    renewsAt: new Date("2026-09-15T22:00:00.000Z"),
  };

  describe("HU-24: cuántos cambios de cada categoría quedan y cuándo se renuevan", () => {
    it("con la bolsa intacta, quedan los del plan y la renovación es el fin del ciclo guardado", () => {
      const allowance = cycleAllowance(cicloImpulso, []);
      expect(allowance.remaining).toEqual({ small: 16, photo: 12, medium: 3, large: 0 });
      expect(allowance.renewsAt).toEqual(new Date("2026-09-15T22:00:00.000Z"));
    });

    it("cada categoría descuenta la suya y no toca a las demás", () => {
      const allowance = cycleAllowance(cicloImpulso, [
        { category: "small", amount: DEBIT_AMOUNT },
        { category: "small", amount: DEBIT_AMOUNT },
        { category: "medium", amount: DEBIT_AMOUNT },
      ]);
      expect(allowance.remaining).toEqual({ small: 14, photo: 12, medium: 2, large: 0 });
    });

    it("una devolución vuelve a la bolsa de su categoría (RN-CON-08)", () => {
      const allowance = cycleAllowance(cicloImpulso, [
        { category: "photo", amount: DEBIT_AMOUNT },
        { category: "photo", amount: CREDIT_AMOUNT },
      ]);
      expect(allowance.remaining.photo).toBe(12);
    });

    it("'0 restantes' y 'no incluido en tu plan' se distinguen: Impulso+ no incluye cambios grandes (RN-COM-02)", () => {
      const allowance = cycleAllowance(cicloImpulso, [{ category: "medium", amount: DEBIT_AMOUNT * 3 }]);
      expect(allowance.remaining.medium).toBe(0);
      expect(allowance.included.medium).toBe(3);
      expect(allowance.remaining.large).toBe(0);
      expect(allowance.included.large).toBe(0);
    });
  });

  describe("HU-25: el libro de consumos con cada apunte, su motivo y su autor", () => {
    it("un débito ordinario conserva su tipo, su importe y quién lo generó", () => {
      expect(
        describeLedgerEntry({ entryType: "debit", reason: null, createdBy: "cliente-1", amount: DEBIT_AMOUNT }),
      ).toEqual({ reasonKey: "debit", explanation: null, authorId: "cliente-1", amount: -1 });
    });

    it("una devolución conserva el motivo que escribió la persona (RN-CON-12)", () => {
      expect(
        describeLedgerEntry({
          entryType: "return",
          reason: "Cancelado antes de comenzar",
          createdBy: "admin-2",
          amount: CREDIT_AMOUNT,
        }),
      ).toEqual({
        reasonKey: "return",
        explanation: "Cancelado antes de comenzar",
        authorId: "admin-2",
        amount: 1,
      });
    });

    it("sin motivo escrito no se inventa uno (P6)", () => {
      expect(describeLedgerEntry({ entryType: "compensatory_credit", reason: null, createdBy: null, amount: CREDIT_AMOUNT }).explanation).toBeNull();
    });
  });
});

describe("cycleUsage · la barra de 'Estado por restaurante' (página 22, decisión de Bosco 20/09/2026)", () => {
  const ciclo = (included: Record<ChangeCategory, number>, remaining: Record<ChangeCategory, number>) => ({
    included,
    remaining,
    renewsAt: new Date("2026-10-01T00:00:00Z"),
  });

  it("suma las cuatro categorías: lo gastado sobre lo incluido", () => {
    // Premium+: 20 pequeños, 15 fotos, 4 medianos, 1 grande = 40.
    // Gastados: 10 + 5 + 1 + 0 = 16 → 40 %.
    const uso = cycleUsage(
      ciclo(
        { small: 20, photo: 15, medium: 4, large: 1 },
        { small: 10, photo: 10, medium: 3, large: 1 },
      ),
    );

    expect(uso).toEqual({ kind: "measured", used: 16, included: 40, percent: 40 });
  });

  it("un plan sin ningún cambio incluido NO es un 0 %: no hay bolsa que medir", () => {
    // Básico (RN-COM-01). Un 0 % diría "no ha gastado nada de lo suyo" y
    // no tiene nada suyo que gastar.
    const uso = cycleUsage(
      ciclo(
        { small: 0, photo: 0, medium: 0, large: 0 },
        { small: 0, photo: 0, medium: 0, large: 0 },
      ),
    );

    expect(uso).toEqual({ kind: "nothing_included" });
  });

  it("sin ciclo vigente no hay porcentaje, y tampoco un cero", () => {
    expect(cycleUsage(null)).toEqual({ kind: "no_cycle" });
  });

  it("la bolsa entera gastada da 100, y nunca pasa de ahí", () => {
    const uso = cycleUsage(
      ciclo(
        { small: 5, photo: 0, medium: 0, large: 0 },
        // Un restante negativo no debería existir; si lo hubiera, la barra
        // se queda en 100 en vez de salirse de su caja.
        { small: -2, photo: 0, medium: 0, large: 0 },
      ),
    );

    expect(uso.kind).toBe("measured");
    expect(uso).toMatchObject({ percent: 100 });
  });
});
