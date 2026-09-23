import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";

import { FinanceView } from "./FinanceView";
import { QuotesListView } from "./presupuestos/QuotesListView";
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
      <FinanceView slug="s" timeZone="Europe/Madrid" month="2026-09" today="2026-09-23" content={{ tab: "resumen", summary: resumen, rows: [], nonpayment: [] }} />,
    );
    expect(screen.getByText(t.noPreviousToCompare)).toBeTruthy();
  });

  it("un mes que no se pudo leer se dice, no se pinta a cero", () => {
    render(
      <FinanceView slug="s" timeZone="Europe/Madrid" month="2026-09" today="2026-09-23" content={{ tab: "resumen", summary: resumen, rows: [], nonpayment: [] }} />,
    );
    expect(screen.getByText(`Agosto de 2026: ${t.monthlyFailed}`)).toBeTruthy();
  });

  it("no deja avanzar más allá del mes de hoy", () => {
    render(
      <FinanceView slug="s" timeZone="Europe/Madrid" month="2026-09" today="2026-09-23" content={{ tab: "resumen", summary: resumen, rows: [], nonpayment: [] }} />,
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

describe("M52 · la pestaña Facturas, a la espera del agente", () => {
  it("dice que no está conectada, sin ninguna factura de ejemplo (CLAUDE.md)", () => {
    render(
      <FinanceView slug="s" timeZone="Europe/Madrid" month="2026-09" today="2026-09-23" content={{ tab: "facturas", invoices: { kind: "not_connected" } }} />,
    );
    expect(screen.getByText(t.invoicesNotConnectedTitle)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    // La pestaña y su primera subpestaña se llaman igual y llevan al mismo sitio.
    for (const enlace of screen.getAllByRole("link", { name: t.tabInvoices })) {
      expect(enlace.getAttribute("href")).toBe("/espacios/s/finanzas?tab=facturas");
    }
    expect(screen.getByRole("link", { name: t.tabDue }).getAttribute("href")).toBe("/espacios/s/finanzas?tab=vencimientos");
  });
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

describe("M51 · pagos parciales y justificantes", () => {
  it("sin nada pendiente lo dice, sin desplegable vacío", () => {
    render(
      <FinanceView slug="s" timeZone="Europe/Madrid" month="2026-09" today="2026-09-23" content={{ tab: "pagos", data: { options: [], selected: null }, registerForm: null }} />,
    );
    expect(screen.getByText(t.paymentsNoneTitle)).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("RN-FIN-04 · un pago revertido sigue en el historial, con su motivo", () => {
    render(
      <FinanceView
        slug="s"
        timeZone="Europe/Madrid"
        month="2026-09"
        today="2026-09-23"
        content={{
          tab: "pagos",
          registerForm: <p>form</p>,
          data: {
            options: [{ id: "c", label: "Oliva · Cuota · 121,00 €" }],
            selected: {
              id: "c",
              totalCents: 12100,
              collectedCents: 0,
              outstandingCents: 12100,
              status: "pending",
              payments: [{ id: "p", amount_cents: 5000, method: "bizum", paid_at: "2026-09-08T10:00:00Z", reversed_at: "2026-09-09T10:00:00Z", reversal_reason: "Importe equivocado" }],
              receipts: [],
            },
          },
        }}
      />,
    );
    expect(screen.getByText(/Importe equivocado/)).toBeTruthy();
    expect(screen.getByText(t.receiptsReviewEmpty)).toBeTruthy();
  });
});

describe("M52 · vencimientos (RN-REC-01, RN-REC-05)", () => {
  it("dice si la fecha de cada aviso llegó, nunca que se envió", () => {
    const fila = {
      id: "c",
      establishmentId: "e",
      establishment: "Oliva",
      concept: "Cuota",
      dueAt: "2026-09-20T08:00:00Z",
      baseCents: 10000,
      taxCents: 2100,
      taxRatePercent: 21,
      totalCents: 12100,
      outstanding: 12100,
      status: "overdue",
    };
    const { container } = render(
      <FinanceView
        slug="s"
        timeZone="Europe/Madrid"
        month="2026-09"
        today="2026-09-23"
        content={{
          tab: "vencimientos",
          now: new Date("2026-09-21T10:00:00Z"),
          total: 1,
          rows: [fila],
          establishments: [],
          filters: { establishmentId: null, state: null },
          selectedId: "c",
        }}
      />,
    );
    expect(screen.getAllByText(new RegExp(t.reminderReached)).length).toBe(2);
    expect(screen.getAllByText(new RegExp(t.reminderUpcoming)).length).toBe(1);
    expect(container.textContent?.toLowerCase()).not.toContain("enviado");
  });
});

describe("M49 · la lista de presupuestos", () => {
  it("con filtros que no casan dice que no coincide, no que no hay presupuestos", () => {
    render(
      <QuotesListView
        slug="s"
        timeZone="Europe/Madrid"
        params={{ q: "nada", establishmentId: null, state: null, selected: null }}
        total={3}
        rows={[]}
        establishments={[]}
        failed={false}
        canCreate
      />,
    );
    expect(screen.getByText(es.quotesTeam.filteredEmptyTitle)).toBeTruthy();
    expect(screen.getByText(es.quotesTeam.pickTitle)).toBeTruthy();
  });
});
