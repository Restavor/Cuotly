import { describe, expect, it } from "vitest";
import {
  CREDIT_AMOUNT,
  DEBIT_AMOUNT,
  calculateConsumptionBalance,
  isCategoryIncludedInPlan,
  resolveCancellationOutcome,
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
    const impulso: PlanAllowance = { includedSmall: 16, includedPhoto: 12, includedMedium: 3, includedLarge: 0 };

    it("Impulso incluye pequeño, fotográfico y mediano", () => {
      expect(isCategoryIncludedInPlan(impulso, "small")).toBe(true);
      expect(isCategoryIncludedInPlan(impulso, "photo")).toBe(true);
      expect(isCategoryIncludedInPlan(impulso, "medium")).toBe(true);
    });

    it("RN-COM-02: Impulso no incluye \"grande\" — se presupuesta aparte", () => {
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
