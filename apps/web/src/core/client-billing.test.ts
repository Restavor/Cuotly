import { describe, expect, it } from "vitest";

import { billingGroup, billingSummary, filterCharges, lastPayment, readBillingFilters } from "./client-billing";

const AHORA = new Date("2026-09-22T10:00:00Z");
const fila = (id: string, due_at: string, group: "paid" | "in_review" | "pending", outstandingCents = 0) => ({
  id,
  due_at,
  group,
  outstandingCents,
});

describe("R25 · RN-FIN-02 · RN-FIN-06 · el grupo de cada cobro sale del estado del servidor", () => {
  it("pagado o perdonado es pagado; con deuda y justificante, en revisión; si no, pendiente", () => {
    expect(billingGroup({ status: "paid", outstandingCents: 0, hasReceipt: false })).toBe("paid");
    expect(billingGroup({ status: "waived", outstandingCents: 0, hasReceipt: false })).toBe("paid");
    expect(billingGroup({ status: "pending", outstandingCents: 72479, hasReceipt: true })).toBe("in_review");
    expect(billingGroup({ status: "overdue", outstandingCents: 72479, hasReceipt: false })).toBe("pending");
  });
});

describe("R25 · filtros de la lista", () => {
  const filas = [
    fila("oct", "2026-10-14T00:00:00Z", "pending", 72479),
    fila("sep", "2026-09-14T00:00:00Z", "paid"),
    fila("ago", "2026-08-14T00:00:00Z", "in_review", 72479),
    fila("viejo-pagado", "2025-12-14T00:00:00Z", "paid"),
    fila("viejo-debe", "2025-11-14T00:00:00Z", "pending", 10000),
  ];

  it("lee la dirección y usa los valores por defecto si no cuadran", () => {
    expect(readBillingFilters({ ver: "pagados", periodo: "6" })).toEqual({ tab: "pagados", period: "6" });
    expect(readBillingFilters({ ver: "x", periodo: "3" })).toEqual({ tab: "todos", period: "12" });
  });

  it("cada pestaña enseña su grupo, del más reciente al más antiguo", () => {
    expect(filterCharges(filas, { tab: "pendientes", period: "todo" }, AHORA).map((f) => f.id)).toEqual([
      "oct",
      "viejo-debe",
    ]);
    expect(filterCharges(filas, { tab: "revision", period: "todo" }, AHORA).map((f) => f.id)).toEqual(["ago"]);
  });

  it("el periodo recorta lo pagado, nunca lo que se debe", () => {
    expect(filterCharges(filas, { tab: "todos", period: "6" }, AHORA).map((f) => f.id)).toEqual([
      "oct",
      "sep",
      "ago",
      "viejo-debe",
    ]);
  });
});

describe("R25 · las tarjetas de arriba no suman dinero", () => {
  it("cuenta los pendientes y da el vencimiento más cercano", () => {
    const resumen = billingSummary([
      fila("oct", "2026-10-14T00:00:00Z", "pending", 72479),
      fila("ago", "2026-08-14T00:00:00Z", "in_review", 72479),
      fila("sep", "2026-09-14T00:00:00Z", "paid"),
    ]);
    expect(resumen.pendingCount).toBe(2);
    expect(resumen.onlyPending).toBeNull();
    expect(resumen.nextDue?.id).toBe("ago");
  });

  it("con uno solo pendiente, ese es el importe que se enseña", () => {
    expect(billingSummary([fila("oct", "2026-10-14T00:00:00Z", "pending", 72479)]).onlyPending?.outstandingCents).toBe(
      72479,
    );
  });

  it("el último pago es el más reciente que no se anuló", () => {
    expect(
      lastPayment([
        { id: "a", paid_at: "2026-09-14T10:00:00Z", reversed_at: null },
        { id: "b", paid_at: "2026-09-20T10:00:00Z", reversed_at: "2026-09-21T10:00:00Z" },
        { id: "c", paid_at: "2026-08-14T10:00:00Z", reversed_at: null },
      ])?.id,
    ).toBe("a");
  });
});
