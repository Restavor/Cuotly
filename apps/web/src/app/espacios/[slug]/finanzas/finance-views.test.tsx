import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";

import { FinanceView } from "./FinanceView";
import { ChargeDetailView, type ChargeDetailData } from "./cobros/[id]/ChargeDetailView";

const t = es.teamArea.finance;
afterEach(cleanup);

const resumen = {
  collected: 1000,
  collectedChange: null,
  pending: 0,
  pendingCount: 0,
  overdue: 0,
  overdueCount: 0,
  issued: 1000,
  recurring: 0,
  monthly: [
    { month: "2026-08", collected: null },
    { month: "2026-09", collected: 1000 },
  ],
};

describe("M16 · Finanzas del espacio", () => {
  it("sin mes anterior con cobros no inventa un porcentaje (RN-FIN-02)", () => {
    render(
      <FinanceView slug="s" timeZone="Europe/Madrid" month="2026-09" today="2026-09-23" tab="resumen" summary={resumen} rows={[]} nonpayment={[]} />,
    );
    expect(screen.getByText(t.noPreviousToCompare)).toBeTruthy();
  });

  it("un mes que no se pudo leer se dice, no se pinta a cero", () => {
    render(
      <FinanceView slug="s" timeZone="Europe/Madrid" month="2026-09" today="2026-09-23" tab="resumen" summary={resumen} rows={[]} nonpayment={[]} />,
    );
    expect(screen.getByText(`Agosto de 2026: ${t.monthlyFailed}`)).toBeTruthy();
  });

  it("no deja avanzar más allá del mes de hoy", () => {
    render(
      <FinanceView slug="s" timeZone="Europe/Madrid" month="2026-09" today="2026-09-23" tab="resumen" summary={resumen} rows={[]} nonpayment={[]} />,
    );
    expect(screen.getByLabelText(t.previousMonth)).toBeTruthy();
    expect(screen.queryByLabelText(t.nextMonth)).toBeNull();
  });
});

const detalle = (cambios: Partial<ChargeDetailData> = {}): ChargeDetailData => ({
  concept: "Cuota de septiembre",
  periodStart: "2026-09-01T00:00:00Z",
  periodEnd: "2026-09-30T00:00:00Z",
  dueAt: "2026-09-10T00:00:00Z",
  baseCents: 10000,
  taxCents: 2100,
  taxRatePercent: 21,
  totalCents: 12100,
  receivedCents: 12100,
  outstandingCents: 0,
  status: "paid",
  establishment: { id: "e", name: "Oliva", code: "EST-1", city: null, photoUrl: null },
  plan: null,
  quoteId: null,
  receipts: [{ fileId: "f", name: "j.pdf", side: "client", at: "2026-09-05T10:00:00Z" }],
  timeline: [{ kind: "issued", at: "2026-09-01T08:00:00Z" }],
  ...cambios,
});

describe("M17 · el detalle de un cobro", () => {
  it("RN-FIN-05 · sin nada pendiente no ofrece registrar un pago", () => {
    render(<ChargeDetailView slug="s" timeZone="Europe/Madrid" data={detalle()} registerForm={null} />);
    expect(screen.getByText(t.nothingToRegister)).toBeTruthy();
  });

  it("dice si el justificante lo subió el restaurante, sin el nombre de nadie (P7)", () => {
    render(<ChargeDetailView slug="s" timeZone="Europe/Madrid" data={detalle()} registerForm={<p>form</p>} />);
    expect(screen.getByText(new RegExp(t.receiptFromClient))).toBeTruthy();
    expect(screen.getByText(t.receiptReviewNote)).toBeTruthy();
  });

  it("un cobro que sale de un presupuesto lleva a él", () => {
    render(<ChargeDetailView slug="s" timeZone="Europe/Madrid" data={detalle({ quoteId: "q1" })} registerForm={null} />);
    expect(screen.getByRole("link", { name: t.seeQuote }).getAttribute("href")).toBe("/espacios/s/finanzas/presupuestos/q1");
  });
});
