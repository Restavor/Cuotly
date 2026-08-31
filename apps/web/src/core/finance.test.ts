import { describe, expect, it } from "vitest";
import {
  COMMITMENT_MONTHS,
  NONPAYMENT_PAUSE_HOURS,
  NONPAYMENT_SUSPENSION_HOURS,
  PAYMENT_METHODS,
  RESTAVOR_TAX_RATE_PERCENT,
  canClientViewBilling,
  canPerformFinanceAction,
  chargeAmounts,
  chargeStatus,
  collectedCents,
  elapsedIsPreservedAcrossPause,
  establishmentNonpaymentStage,
  financialSummary,
  nonpaymentStage,
  outstandingCents,
  terminationSettlementCents,
  type FinancialEntry,
} from "./finance";

const VENCIMIENTO = new Date("2026-09-01T08:00:00.000Z");
const horasDespues = (hours: number) => new Date(VENCIMIENTO.getTime() + hours * 3_600_000);

/** Impulso: 399 € + IVA (RN-COM-04, semilla del Hito 2). */
const IMPULSO_BASE = 39_900;
const IMPULSO_TOTAL = 48_279;

const cargo = (totalCents: number): FinancialEntry => ({ type: "charge", amountCents: totalCents });
const pago = (amountCents: number): FinancialEntry => ({ type: "payment", amountCents: -amountCents });

describe("finance — RN-FIN, HU-26, HU-27, HU-28", () => {
  describe("RN-FIN-08: base imponible, impuesto y total", () => {
    it("Restavor usa IVA del 21 %", () => {
      expect(RESTAVOR_TAX_RATE_PERCENT).toBe(21);
    });

    it("399 € + 21 % son 482,79 €, y el desglose cuadra con el total", () => {
      const importes = chargeAmounts(IMPULSO_BASE, RESTAVOR_TAX_RATE_PERCENT);
      expect(importes).toEqual({ baseCents: IMPULSO_BASE, taxCents: 8_379, totalCents: IMPULSO_TOTAL });
      expect(importes.baseCents + importes.taxCents).toBe(importes.totalCents);
    });

    it("otro espacio puede configurar otro tipo impositivo", () => {
      expect(chargeAmounts(10_000, 10).totalCents).toBe(11_000);
    });

    it("el impuesto se redondea al céntimo una sola vez, de forma determinista", () => {
      // 99 € al 21 % son 20,79 € exactos; 99,99 € al 21 % son 20,9979 € -> 21,00 €.
      expect(chargeAmounts(9_900, 21).taxCents).toBe(2_079);
      expect(chargeAmounts(9_999, 21).taxCents).toBe(2_100);
    });
  });

  describe("RN-FIN-02 · RN-DAT-04: el estado del cobro se deriva del libro de apuntes", () => {
    it("recién emitido y en plazo está pendiente, y su deuda viva es el total", () => {
      const entries = [cargo(IMPULSO_TOTAL)];
      expect(outstandingCents(entries)).toBe(IMPULSO_TOTAL);
      expect(chargeStatus({ entries, dueAt: VENCIMIENTO, now: horasDespues(-24) })).toBe("pending");
    });

    it("con un pago parcial en plazo queda 'pagado parcialmente'", () => {
      const entries = [cargo(IMPULSO_TOTAL), pago(10_000)];
      expect(chargeStatus({ entries, dueAt: VENCIMIENTO, now: horasDespues(-1) })).toBe("partially_paid");
      expect(collectedCents(entries)).toBe(10_000);
      expect(outstandingCents(entries)).toBe(IMPULSO_TOTAL - 10_000);
    });

    it("cobrado del todo queda 'pagado', y la deuda viva es cero", () => {
      const entries = [cargo(IMPULSO_TOTAL), pago(IMPULSO_TOTAL)];
      expect(outstandingCents(entries)).toBe(0);
      expect(chargeStatus({ entries, dueAt: VENCIMIENTO, now: horasDespues(48) })).toBe("paid");
    });

    it("pasada la fecha con deuda viva es 'vencido', aunque hubiera un pago parcial", () => {
      expect(chargeStatus({ entries: [cargo(IMPULSO_TOTAL), pago(10_000)], dueAt: VENCIMIENTO, now: horasDespues(1) })).toBe(
        "overdue",
      );
    });

    it("perdonado y reembolsado tienen sus propios estados", () => {
      expect(
        chargeStatus({
          entries: [cargo(IMPULSO_TOTAL), { type: "waiver", amountCents: -IMPULSO_TOTAL }],
          dueAt: VENCIMIENTO,
          now: horasDespues(200),
        }),
      ).toBe("waived");
      expect(
        chargeStatus({
          entries: [cargo(IMPULSO_TOTAL), pago(IMPULSO_TOTAL), { type: "refund", amountCents: IMPULSO_TOTAL }],
          dueAt: VENCIMIENTO,
          now: horasDespues(200),
        }),
      ).toBe("refunded");
    });

    it("RN-FIN-04: corregir un cobro mal registrado es un apunte contrario, no una edición", () => {
      const entries: FinancialEntry[] = [
        cargo(IMPULSO_TOTAL),
        pago(IMPULSO_TOTAL),
        { type: "payment_reversal", amountCents: IMPULSO_TOTAL },
      ];
      expect(collectedCents(entries)).toBe(0);
      expect(outstandingCents(entries)).toBe(IMPULSO_TOTAL);
    });
  });

  describe("RN-FIN-03: métodos de pago registrados", () => {
    it("son exactamente los cinco del PRD", () => {
      expect([...PAYMENT_METHODS]).toEqual(["transfer", "card", "cash", "direct_debit", "other"]);
    });
  });

  describe("RN-FIN-10 · RN-FIN-11: ciclo de impago de 24 h y 72 h naturales", () => {
    it("los umbrales son 24 h y 72 h", () => {
      expect(NONPAYMENT_PAUSE_HOURS).toBe(24);
      expect(NONPAYMENT_SUSPENSION_HOURS).toBe(72);
    });

    it("recién vencido todavía no pasa nada", () => {
      expect(nonpaymentStage({ dueAt: VENCIMIENTO, outstandingCents: IMPULSO_TOTAL, now: horasDespues(23) })).toBe(
        "current",
      );
    });

    it("a las 24 h exactas queda Pausado por impago", () => {
      expect(nonpaymentStage({ dueAt: VENCIMIENTO, outstandingCents: IMPULSO_TOTAL, now: horasDespues(24) })).toBe(
        "paused",
      );
    });

    it("a las 72 h exactas queda Suspendido por impago", () => {
      expect(nonpaymentStage({ dueAt: VENCIMIENTO, outstandingCents: IMPULSO_TOTAL, now: horasDespues(72) })).toBe(
        "suspended",
      );
    });

    it("son horas naturales: el fin de semana cuenta igual que un martes", () => {
      // 2026-09-05 es sábado. 24 h después del vencimiento del viernes.
      const viernes = new Date("2026-09-04T08:00:00.000Z");
      const sabado = new Date("2026-09-05T08:00:00.000Z");
      expect(nonpaymentStage({ dueAt: viernes, outstandingCents: 100, now: sabado })).toBe("paused");
    });

    it("sin deuda viva no hay impago aunque haya pasado un mes", () => {
      expect(nonpaymentStage({ dueAt: VENCIMIENTO, outstandingCents: 0, now: horasDespues(720) })).toBe("current");
    });

    it("manda el cobro vencido más antiguo: uno nuevo en plazo no rescata al establecimiento", () => {
      expect(
        establishmentNonpaymentStage(
          [
            { dueAt: VENCIMIENTO, outstandingCents: IMPULSO_TOTAL },
            { dueAt: horasDespues(100), outstandingCents: IMPULSO_TOTAL },
          ],
          horasDespues(80),
        ),
      ).toBe("suspended");
    });
  });

  describe("RN-FIN-13: al confirmarse el pago se reactiva y los contadores continúan exactamente donde se pausaron", () => {
    it("los minutos consumidos antes de la pausa y después de la reactivación son el mismo número", () => {
      expect(elapsedIsPreservedAcrossPause({ elapsedMinutesAtPause: 465, elapsedMinutesAtResume: 465 })).toBe(true);
    });

    it("si el contador hubiera seguido corriendo durante la pausa, la comprobación falla", () => {
      expect(elapsedIsPreservedAcrossPause({ elapsedMinutesAtPause: 465, elapsedMinutesAtResume: 1_905 })).toBe(false);
    });
  });

  describe("RN-FIN-14 · RN-COM-04: la suspensión no cancela el compromiso", () => {
    it("la permanencia mínima son 3 meses", () => {
      expect(COMMITMENT_MONTHS).toBe(3);
    });

    it("para causar baja en el primer mes se abona la deuda vencida más las dos mensualidades que faltan", () => {
      expect(
        terminationSettlementCents({
          outstandingCents: IMPULSO_TOTAL,
          elapsedFullMonths: 1,
          monthlyTotalCents: IMPULSO_TOTAL,
        }),
      ).toEqual({ remainingCommitmentMonths: 2, totalCents: IMPULSO_TOTAL * 3 });
    });

    it("cumplida la permanencia solo queda la deuda viva", () => {
      expect(
        terminationSettlementCents({
          outstandingCents: IMPULSO_TOTAL,
          elapsedFullMonths: 7,
          monthlyTotalCents: IMPULSO_TOTAL,
        }),
      ).toEqual({ remainingCommitmentMonths: 0, totalCents: IMPULSO_TOTAL });
    });
  });

  describe("RN-FIN-04 · RN-FIN-05 · HU-27 · CA-03: quién puede hacer qué", () => {
    it("HU-27: el trabajador marca 'Pagado' en un restaurante asignado", () => {
      expect(
        canPerformFinanceAction({ side: "space", role: "worker", isAuthorizedForEstablishment: true }, "register_payment"),
      ).toBe(true);
    });

    it("pero no en uno que no tiene asignado", () => {
      expect(
        canPerformFinanceAction({ side: "space", role: "worker", isAuthorizedForEstablishment: false }, "register_payment"),
      ).toBe(false);
    });

    it("RN-FIN-05: no perdona deuda, no reembolsa, no corrige y no emite cobros", () => {
      const trabajador = { side: "space", role: "worker", isAuthorizedForEstablishment: true } as const;
      expect(canPerformFinanceAction(trabajador, "waive_charge")).toBe(false);
      expect(canPerformFinanceAction(trabajador, "refund_charge")).toBe(false);
      expect(canPerformFinanceAction(trabajador, "correct_payment")).toBe(false);
      expect(canPerformFinanceAction(trabajador, "issue_charge")).toBe(false);
    });

    it("CA-03: el trabajador no ve el panel financiero", () => {
      expect(
        canPerformFinanceAction({ side: "space", role: "worker", isAuthorizedForEstablishment: true }, "view_dashboard"),
      ).toBe(false);
    });

    it("RN-FIN-04: propietario y administrador gestionan todo el módulo", () => {
      for (const action of ["view_dashboard", "issue_charge", "register_payment", "correct_payment", "waive_charge", "refund_charge"] as const) {
        expect(canPerformFinanceAction({ side: "space", role: "owner" }, action)).toBe(true);
        expect(canPerformFinanceAction({ side: "space", role: "admin" }, action)).toBe(true);
      }
    });

    it("RN-FIN-06: el cliente no confirma nada, ni siquiera subiendo el justificante", () => {
      expect(canPerformFinanceAction({ side: "client" }, "register_payment")).toBe(false);
    });
  });

  describe("RN-FIN-07: visibilidad financiera del cliente", () => {
    it("propietario global y propietario local ven facturación", () => {
      expect(canClientViewBilling({ role: "global_owner", hasViewBillingPermission: false })).toBe(true);
      expect(canClientViewBilling({ role: "local_owner", hasViewBillingPermission: false })).toBe(true);
    });

    it("el Editor solo con el permiso `view_billing`", () => {
      expect(canClientViewBilling({ role: "editor", hasViewBillingPermission: false })).toBe(false);
      expect(canClientViewBilling({ role: "editor", hasViewBillingPermission: true })).toBe(true);
    });

    it("Consulta nunca, ni con el permiso puesto", () => {
      expect(canClientViewBilling({ role: "consulta", hasViewBillingPermission: true })).toBe(false);
    });
  });

  describe("HU-28: panel financiero con previsto, cobrado, pendiente, vencido e ingreso recurrente", () => {
    const resumen = financialSummary({
      charges: [
        // Cobrado del todo.
        { baseCents: IMPULSO_BASE, totalCents: IMPULSO_TOTAL, dueAt: VENCIMIENTO, entries: [cargo(IMPULSO_TOTAL), pago(IMPULSO_TOTAL)] },
        // Emitido y todavía en plazo.
        { baseCents: IMPULSO_BASE, totalCents: IMPULSO_TOTAL, dueAt: horasDespues(48), entries: [cargo(IMPULSO_TOTAL)] },
        // Vencido y sin pagar.
        { baseCents: 9_900, totalCents: 11_979, dueAt: horasDespues(-48), entries: [cargo(11_979)] },
      ],
      activeSubscriptions: [
        { baseCents: IMPULSO_BASE, totalCents: IMPULSO_TOTAL },
        { baseCents: 9_900, totalCents: 11_979 },
      ],
      now: VENCIMIENTO,
    });

    it("el previsto es todo lo emitido en el periodo, con y sin IVA", () => {
      expect(resumen.forecast).toEqual({
        baseCents: IMPULSO_BASE * 2 + 9_900,
        totalCents: IMPULSO_TOTAL * 2 + 11_979,
      });
    });

    it("lo cobrado es solo lo confirmado", () => {
      expect(resumen.collectedCents).toBe(IMPULSO_TOTAL);
    });

    it("pendiente y vencido son deudas distintas y no se mezclan", () => {
      expect(resumen.pendingCents).toBe(IMPULSO_TOTAL);
      expect(resumen.overdueCents).toBe(11_979);
    });

    it("el ingreso recurrente sale de las suscripciones activas, no del histórico emitido", () => {
      expect(resumen.recurringMonthly).toEqual({ baseCents: IMPULSO_BASE + 9_900, totalCents: IMPULSO_TOTAL + 11_979 });
    });

    it("P6: sin datos, el panel devuelve ceros, no una estimación", () => {
      expect(financialSummary({ charges: [], activeSubscriptions: [], now: VENCIMIENTO })).toEqual({
        forecast: { baseCents: 0, totalCents: 0 },
        collectedCents: 0,
        pendingCents: 0,
        overdueCents: 0,
        recurringMonthly: { baseCents: 0, totalCents: 0 },
      });
    });
  });
});
