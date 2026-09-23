import { describe, expect, it } from "vitest";

import { digitalRow, issuedByOrigin, jobsPerWorker, readSpaceReportParams } from "./space-reports";

describe("M18 · la pestaña, el mes y el restaurante de Informes", () => {
  it("lee los tres; sin pestaña es Operación, y con filtros de la biblioteca, la biblioteca", () => {
    expect(readSpaceReportParams({ tab: "finanzas", mes: "2026-08", restaurante: "e" }, "2026-09-23")).toEqual({
      tab: "finanzas",
      month: "2026-08",
      establishmentId: "e",
    });
    expect(readSpaceReportParams({}, "2026-09-23").tab).toBe("operacion");
    expect(readSpaceReportParams({ estado: "draft" }, "2026-09-23").tab).toBe("generados");
    expect(readSpaceReportParams({ mes: "2026-10" }, "2026-09-23").month).toBe("2026-09");
  });
});

describe("M65 · carga por trabajador (RN-ASG-17)", () => {
  it("cuenta los trabajos de cada persona y los publicados dentro del mes, sin los que no tienen responsable", () => {
    const periodo = { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-10-01T00:00:00Z") };
    const cuenta = jobsPerWorker(
      [
        { assigneeId: "ana", publishedAt: new Date("2026-09-10T10:00:00Z") },
        { assigneeId: "ana", publishedAt: null },
        { assigneeId: "ana", publishedAt: new Date("2026-08-30T10:00:00Z") },
        { assigneeId: "diego", publishedAt: null },
        { assigneeId: null, publishedAt: new Date("2026-09-10T10:00:00Z") },
      ],
      periodo,
    );
    expect(cuenta.get("ana")).toEqual({ assigned: 3, completed: 1 });
    expect(cuenta.get("diego")).toEqual({ assigned: 1, completed: 0 });
    expect(cuenta.size).toBe(2);
  });
});

describe("M66 · lo emitido por origen (§84)", () => {
  it("un presupuesto es extra, una suscripción es recurrente, y lo demás va aparte", () => {
    expect(
      issuedByOrigin([
        { totalCents: 12100, subscriptionId: "s", quoteId: null },
        { totalCents: 24200, subscriptionId: null, quoteId: "q" },
        { totalCents: 500, subscriptionId: null, quoteId: null },
      ]),
    ).toEqual({ recurring: 12100, extras: 24200, other: 500 });
  });
});

describe("M67 · una fila digital por restaurante (§92, §178)", () => {
  it("toma sesiones de GA4 y clics de Search Console, y cada fuente dice si hay dato o por qué no", () => {
    const fila = digitalRow([
      { section: "digital", metric: "sessions", value: 3842, dimension: "ga4", at: "2026-09-29T08:00:00Z" },
      { section: "digital", metric: "users", value: 2100, dimension: "ga4", at: "2026-09-29T08:00:00Z" },
      { section: "digital", metric: "clicks", value: null, dimension: "search_console", noDataReason: "not_connected" },
      { section: "digital", metric: "sessions", value: 999, dimension: "clarity", at: "2026-09-30T08:00:00Z" },
    ]);
    expect(fila.sessions).toBe(3842);
    expect(fila.clicks).toBeNull();
    expect(fila.providers.ga4).toEqual({ kind: "ok" });
    expect(fila.providers.search_console).toEqual({ kind: "missing", reason: "not_connected" });
    expect(fila.providers.pagespeed.kind).toBe("missing");
    expect(fila.lastUpdate).toBe("2026-09-30T08:00:00Z");
  });
});
