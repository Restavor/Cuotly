import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";
import type { SheetData } from "./Sheet";
import { EstablishmentSheet } from "./Sheet";
import { MANAGEMENT_BLOCKS, SHEET_TABS } from "./tabs";

/**
 * Vista 14 · "Gestión — Pagos y presupuestos", pintada.
 *
 * Dos cosas que esta suite vigila y que no se ven mirando la pantalla:
 *
 *   · **El desglose no se calcula aquí.** La maqueta enseña "599,00 € /
 *     IVA (21%) 125,79 € / Total 724,79 €", y esos tres importes salen
 *     guardados del cobro con el tipo que regía al emitirlo (RN-FIN-08).
 *     Un 21 % multiplicado en la pantalla reescribiría lo facturado el año
 *     pasado en cuanto cambiara el tipo, así que el test da un cobro con
 *     un tipo distinto del 21 y comprueba que la pantalla dice el suyo.
 *   · **Los presupuestos no se inventan.** `quotes` es una entidad
 *     preparada y NO explotada en Fase 1 (PRD §5.3) y no existe en ninguna
 *     migración.
 */
const t = es.establishmentSheet;

afterEach(cleanup);

// El formulario de registrar un pago es un componente de cliente con
// `useActionState` sobre una acción de servidor. Aquí se sustituye por su
// hueco: lo que esta suite comprueba es la composición de la pantalla, y
// la acción tiene sus propias pruebas del lado del servidor.
vi.mock("@/components/RegisterPaymentForm", () => ({
  RegisterPaymentForm: ({ chargeId }: { chargeId: string }) => (
    <div data-testid={`registrar-pago-${chargeId}`}>registrar pago</div>
  ),
}));

const GESTION = SHEET_TABS.find((tab) => tab.key === "management")!;
const BLOQUE_PAGOS = MANAGEMENT_BLOCKS.find((block) => block.key === "payments")!;

const cobroPendiente = {
  id: "c-1",
  concept: "Cuota mensual — Plan Premium",
  baseCents: 59900,
  // A PROPÓSITO no es 21: si la pantalla multiplicara por su cuenta, aquí
  // se vería.
  taxRatePercent: 10,
  taxCents: 5990,
  totalCents: 65890,
  periodStart: "2026-09-01T00:00:00.000Z",
  periodEnd: "2026-09-30T00:00:00.000Z",
  dueAt: "2026-09-05T00:00:00.000Z",
  status: "pending",
  outstandingCents: 65890,
};

function sheetData(payments: SheetData["payments"]): SheetData {
  return {
    header: {
      id: "est-1",
      name: "Magariños",
      code: "EST-0048",
      status: "active",
      groupId: "g-1",
      groupName: "Grupo Magariños",
      planId: "p-1",
      planName: "Premium",
      planPriceCents: 59900,
      services: [],
      commitmentEndsAt: null,
      commitmentStartedAt: null,
      cycleStart: null,
      cycleEnd: null,
      identity: {
        legalName: null,
        taxId: null,
        address: null,
        postalCode: null,
        city: null,
        contactName: null,
        contactEmail: null,
        phonePrimary: null,
        phoneSecondary: null,
        websiteUrl: null,
        instagram: null,
        facebookUrl: null,
        domain: null,
        openingHours: null,
        webPlatform: null,
      },
    },
    canEditData: false,
    summary: {
      bags: [],
      attention: [],
      pendingValidation: [],
      openRequests: 0,
      currentJob: null,
      liveJobs: 0,
      payment: { allowed: false, outstandingCents: 0, overdueCount: 0 },
    },
    operation: {
      requests: { shown: [], hidden: 0 },
      jobs: { shown: [], hidden: 0 },
      tasks: { shown: [], hidden: 0 },
    },
    counts: { requestsByState: [], jobsByState: [], files: 0 },
    today: "2026-09-11",
    payments,
    users: { rows: [], failed: false },
    canManageClients: false,
    staff: [],
    files: { files: [], selected: null, categories: [], folders: [], total: 0, category: null },
    audit: {
      rows: [],
      actors: [],
      filters: { from: null, to: null, family: null, actorId: null, page: 1 },
      hasMore: false,
    },
  };
}

function pintar(payments: SheetData["payments"]) {
  return render(
    <EstablishmentSheet
      base="/espacios/demo/restaurantes/est-1"
      slug="demo"
      tab={GESTION}
      block={BLOQUE_PAGOS}
      data={sheetData(payments)}
    />,
  );
}

function tarjeta(titulo: string): HTMLElement {
  const encabezado = screen.getByRole("heading", { name: titulo });
  return encabezado.closest("section") ?? encabezado.parentElement!.parentElement!;
}

describe("vista 14 · la cuota del periodo", () => {
  it("enseña el desglose GUARDADO, no uno calculado con el 21 %", () => {
    pintar({ allowed: true, charges: [cobroPendiente], payments: [] });
    const card = within(tarjeta(cobroPendiente.concept));
    expect(card.getByText("599,00 €")).toBeInTheDocument();
    expect(card.getByText(t.taxLabel(10))).toBeInTheDocument();
    expect(card.getByText("59,90 €")).toBeInTheDocument();
    expect(card.getByText("658,90 €")).toBeInTheDocument();
    // El 21 % de 599 serían 125,79 €: si saliera, la pantalla estaría
    // calculando en vez de leer.
    expect(card.queryByText("125,79 €")).not.toBeInTheDocument();
  });

  it("cada cuota viva lleva su formulario de registrar el pago (HU-26)", () => {
    pintar({ allowed: true, charges: [cobroPendiente], payments: [] });
    expect(screen.getByTestId("registrar-pago-c-1")).toBeInTheDocument();
  });

  it("un cobro saldado no ocupa tarjeta: ya está en el historial", () => {
    pintar({
      allowed: true,
      charges: [{ ...cobroPendiente, status: "paid", outstandingCents: 0 }],
      payments: [],
    });
    expect(screen.queryByTestId("registrar-pago-c-1")).not.toBeInTheDocument();
    expect(screen.getByText(t.chargesAllPaidTitle)).toBeInTheDocument();
  });

  it("sin permiso de facturación se dice el motivo, no una tabla vacía", () => {
    // RN-FIN-07 · lo decide el servidor; la pantalla solo cuenta lo que
    // contestó. Una tabla vacía parecería "no hay cobros".
    pintar({ allowed: false, charges: [], payments: [] });
    expect(screen.getByText(t.chargesNoAccessReason)).toBeInTheDocument();
    expect(screen.queryByText(t.paymentHistoryTitle)).not.toBeInTheDocument();
  });
});

describe("vista 14 · el historial de pagos", () => {
  const pago = {
    id: "p-1",
    chargeId: "c-1",
    chargeConcept: "Cuota mensual — Plan Premium",
    amountCents: 65890,
    method: "transfer",
    paidAt: "2026-08-01T10:00:00.000Z",
    receiptFileId: null,
    reversedAt: null,
  };

  it("enseña fecha, concepto, importe y método", () => {
    pintar({ allowed: true, charges: [cobroPendiente], payments: [pago] });
    const card = within(tarjeta(t.paymentHistoryTitle));
    expect(card.getByText(es.teamArea.methods.transfer)).toBeInTheDocument();
    expect(card.getByText("658,90 €")).toBeInTheDocument();
  });

  it("un pago revertido lo dice (RN-FIN-04), no desaparece", () => {
    // Sin la marca, el historial sumaría un dinero que ya no cuenta.
    pintar({
      allowed: true,
      charges: [cobroPendiente],
      payments: [{ ...pago, reversedAt: "2026-08-02T10:00:00.000Z" }],
    });
    expect(within(tarjeta(t.paymentHistoryTitle)).getByText(t.paymentReversed)).toBeInTheDocument();
  });

  it("NO inventa un número fiscal de factura: dice si hay justificante", () => {
    // La maqueta enseña "FAC-2026-083". Esa numeración es fiscal y
    // CLAUDE.md la deja aplazada; lo que existe es un archivo adjunto.
    pintar({
      allowed: true,
      charges: [cobroPendiente],
      payments: [pago, { ...pago, id: "p-2", receiptFileId: "f-1" }],
    });
    const card = within(tarjeta(t.paymentHistoryTitle));
    expect(card.getByText(t.receiptNone)).toBeInTheDocument();
    expect(card.getByText(t.receiptAttached)).toBeInTheDocument();
    expect(card.queryByText(/FAC-/)).not.toBeInTheDocument();
  });

  it("sin pagos lo dice, con su motivo", () => {
    pintar({ allowed: true, charges: [cobroPendiente], payments: [] });
    expect(
      within(tarjeta(t.paymentHistoryTitle)).getByText(t.paymentHistoryEmptyReason),
    ).toBeInTheDocument();
  });
});

describe("vista 14 · los presupuestos", () => {
  it("no se inventa ninguno: se dice que no están construidos y por qué", () => {
    pintar({ allowed: true, charges: [cobroPendiente], payments: [] });
    const card = within(tarjeta(t.quotesTitle));
    expect(card.getByText(t.quotesEmptyTitle)).toBeInTheDocument();
    expect(card.getByText(t.quotesEmptyReason)).toBeInTheDocument();
  });
});
