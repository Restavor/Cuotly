import { describe, expect, it } from "vitest";

import {
  chargeTimeline,
  countChargesByBucket,
  monthsEndingAt,
  percentChange,
  readFinanceParams,
} from "./finance-summary";

describe("M16 · el mes y la pestaña de Finanzas", () => {
  it("lee el mes y la pestaña; lo mal escrito o futuro cae en el mes de hoy", () => {
    expect(readFinanceParams({ mes: "2026-08", tab: "cobros" }, "2026-09-23")).toEqual({
      month: "2026-08",
      tab: "cobros",
    });
    expect(readFinanceParams({ mes: "2026-13" }, "2026-09-23").month).toBe("2026-09");
    expect(readFinanceParams({ mes: "2026-10" }, "2026-09-23").month).toBe("2026-09");
    expect(readFinanceParams({ tab: "otra" }, "2026-09-23").tab).toBe("resumen");
  });

  it("el gráfico lleva los doce meses que acaban en el elegido, cruzando el año", () => {
    const meses = monthsEndingAt("2026-02", 12);
    expect(meses).toHaveLength(12);
    expect(meses[0]).toBe("2025-03");
    expect(meses[11]).toBe("2026-02");
  });
});

describe("M16 · comparar con el mes anterior (RN-FIN-02)", () => {
  it("da el porcentaje redondeado cuando hay con qué comparar", () => {
    expect(percentChange(248000, 221400)).toBe(12);
    expect(percentChange(50, 100)).toBe(-50);
  });

  it("sin mes anterior, o a cero, no inventa un porcentaje", () => {
    expect(percentChange(1000, 0)).toBeNull();
    expect(percentChange(1000, null)).toBeNull();
  });
});

describe("M16 · cuántos cobros hay detrás de cada cifra", () => {
  it("cuenta filas por el estado del servidor: parcial en plazo es pendiente, vencido aparte", () => {
    expect(
      countChargesByBucket([
        { status: "pending", outstanding: 12100 },
        { status: "partially_paid", outstanding: 2100 },
        { status: "overdue", outstanding: 12100 },
        { status: "paid", outstanding: 0 },
        { status: "waived", outstanding: 0 },
      ]),
    ).toEqual({ pending: 2, overdue: 1 });
  });
});

describe("M17 · el historial de un cobro (RN-FIN-04)", () => {
  it("ordena de lo más antiguo a lo más reciente y un pago revertido sale dos veces", () => {
    const eventos = chargeTimeline({
      issuedAt: "2026-09-01T08:00:00Z",
      receipts: [{ at: "2026-09-14T08:24:00Z", side: "client", name: "justificante.pdf" }],
      payments: [
        {
          paidAt: "2026-09-10T10:00:00Z",
          amountCents: 5000,
          method: "bizum",
          reversedAt: "2026-09-12T09:00:00Z",
          reversalReason: "Importe equivocado",
        },
      ],
    });
    expect(eventos.map((e) => e.kind)).toEqual(["issued", "payment", "reversal", "receipt"]);
  });
});
