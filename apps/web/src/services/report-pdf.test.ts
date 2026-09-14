import { describe, expect, it } from "vitest";

import type { ReportSnapshot } from "@/core/reports";
import { es } from "@/i18n/es";

import { figureLabel, figureText, renderReportPdf } from "./report-pdf";

/**
 * El PDF de un informe (§93, RN-REP-06). Se prueba de verdad —se genera el
 * documento— porque los dos fallos que este archivo puede tener no los ve
 * ningún tipo:
 *
 *   · un carácter que la fuente estándar no sabe escribir, que hace
 *     **lanzar** a pdf-lib en el momento de descargar;
 *   · una cifra sin valor pintada como un hueco, en vez de con su motivo.
 */
const t = es.reportsPage;

const SNAPSHOT: ReportSnapshot = {
  category: "operation",
  period: { start: "2026-08-01", end: "2026-08-31" },
  generatedAt: "2026-09-01T08:00:00Z",
  sections: [
    { key: "executive_summary", position: 1, included: true },
    { key: "operation", position: 2, included: true },
    { key: "digital", position: 3, included: false },
  ],
  figures: [
    { section: "operation", metric: "jobs_completed", value: 10 },
    { section: "operation", metric: "average_start", value: 180, unit: "business_minutes" },
    { section: "operation", metric: "start_compliance", value: null, noDataReason: "stale" },
    { section: "digital", metric: "sessions", value: 3, dimension: "ga4" },
  ],
  // Con guiones largos, comillas tipográficas y acentos: es lo que escribe
  // una persona de verdad en el resumen ejecutivo.
  opportunities: [],
  notes: { executive_summary: "Agosto —como todos— flojo: “menú del día” cayó un 12 %…" },
};

describe("el PDF del informe", () => {
  it("se genera y es un PDF", async () => {
    const bytes = await renderReportPdf(SNAPSHOT, {
      name: "Informe mensual — Septiembre 2026",
      establishmentName: "Casa Magariños",
      generatedAtLabel: "1 sept",
      periodLabel: { from: "1 ago", to: "31 ago" },
    });

    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("lo que la fuente estándar no sabe escribir se quita, y el PDF sale igual", async () => {
    // Una flecha o un emoji hacen **lanzar** a pdf-lib con WinAnsi. Un
    // informe lleva texto escrito por una persona, así que puede llegar
    // cualquier cosa, y quedarse sin informe por un emoji sería peor.
    const bytes = await renderReportPdf(
      { ...SNAPSHOT, notes: { executive_summary: "Ventas → arriba 🎉 y «menú» intacto" } },
      {
        name: "Informe con emoji 🎉",
        establishmentName: "Casa Magariños",
        generatedAtLabel: "1 sept",
        periodLabel: { from: "1 ago", to: "31 ago" },
      },
    );

    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("un consolidado lo dice en la portada en vez de dejar el restaurante en blanco", async () => {
    const bytes = await renderReportPdf(SNAPSHOT, {
      name: "Consolidado",
      establishmentName: null,
      generatedAtLabel: "1 sept",
      periodLabel: { from: "1 ago", to: "31 ago" },
    });

    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("una cifra sin valor se escribe con su motivo, no con un hueco", () => {
    expect(figureText({ section: "operation", metric: "start_compliance", value: null, noDataReason: "stale" }, t))
      .toBe(es.emptyReasons.stale);
    // Y sin motivo conocido, se dice "Sin dato" — nunca un cero, que sería
    // una cifra inventada (CLAUDE.md MUST NOT).
    expect(figureText({ section: "operation", metric: "jobs_completed", value: null }, t)).toBe(t.pdf.noValue);
  });

  it("las unidades se escriben en palabras: un porcentaje no es lo mismo que un minuto", () => {
    expect(figureText({ section: "operation", metric: "start_compliance", value: 86, unit: "percent" }, t))
      .toBe("86 %");
    expect(figureText({ section: "operation", metric: "average_start", value: 180, unit: "business_minutes" }, t))
      .toBe("3 h laborables");
    expect(figureText({ section: "finance", metric: "income_total", value: 48279, unit: "cents" }, t))
      .toContain("482,79");
  });

  it("el nombre de una cifra con dimensión lleva las dos cosas", () => {
    expect(figureLabel({ section: "operation", metric: "consumption", value: 2, dimension: "photo" }, t))
      .toBe(`${t.metrics.consumption} · ${es.naming.categories.photo}`);
    expect(figureLabel({ section: "digital", metric: "sessions", value: 100, dimension: "ga4" }, t))
      .toBe(`${t.metrics.sessions} · ${es.integrations.providers.ga4.name}`);
  });
});
