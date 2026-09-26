import { describe, expect, it, vi } from "vitest";

import type { MetricPoint } from "@/core/integrations";
import { comparePlans, readPlanTermsForm } from "@/core/plan-catalogue";
import {
  type ReportFigure,
  type ReportSectionState,
  type ReportSnapshot,
  executiveSummaryFacts,
  headlineFigures,
  lastClosedQuarter,
  monthsOfPeriod,
  periodShape,
  previousPeriod,
  reportPeriodFor,
  trafficFigures,
  webTraffic,
} from "@/core/reports";
import { es } from "@/i18n/es";

import { buildSnapshot } from "./report-generation";
import type { ProviderState, ReportGateway, ReportRow } from "./report-gateway";
import { deviceName, figureLabel, sectionTitle, trafficShare } from "./report-pdf";
import { executiveSummaryText, periodPhrase, quarterName } from "./report-summary";

/**
 * El informe trimestral y el tráfico de la web (decisión 83, 26/09/2026).
 *
 * La ficha del plan Básico promete un **resumen trimestral automático** con
 * visitas, usuarios, páginas más visitadas, dispositivos y la evolución del
 * tráfico. RN-REP-32 es el periodo (un término del plan) y RN-REP-33 la
 * sección "Tráfico de la web", que llevan los cinco niveles.
 */

const JULIO_A_SEPTIEMBRE = { start: "2026-07-01", end: "2026-09-30" };
const AGOSTO = { start: "2026-08-01", end: "2026-08-31" };

describe("RN-REP-32 · el último trimestre natural cerrado", () => {
  it("RN-REP-32 · el 1 de octubre ya está cerrado julio a septiembre", () => {
    expect(lastClosedQuarter(new Date("2026-10-01T08:00:00Z"), "Europe/Madrid")).toEqual(JULIO_A_SEPTIEMBRE);
  });

  it("RN-REP-32 · el 30 de septiembre todavía no: toca abril a junio", () => {
    expect(lastClosedQuarter(new Date("2026-09-30T20:00:00Z"), "Europe/Madrid")).toEqual({
      start: "2026-04-01",
      end: "2026-06-30",
    });
  });

  it("RN-REP-32 · en la zona del espacio: la medianoche de Madrid del 1 de octubre ya es octubre", () => {
    // 22:30 UTC del 30 de septiembre son las 00:30 del 1 de octubre en Madrid.
    expect(lastClosedQuarter(new Date("2026-09-30T22:30:00Z"), "Europe/Madrid")).toEqual(JULIO_A_SEPTIEMBRE);
  });

  it("RN-REP-32 · en enero toca el último trimestre del año anterior", () => {
    expect(lastClosedQuarter(new Date("2027-01-15T10:00:00Z"), "Europe/Madrid")).toEqual({
      start: "2026-10-01",
      end: "2026-12-31",
    });
  });

  it("RN-REP-32 · el plan decide: mensual da el último mes, trimestral el último trimestre", () => {
    const hoy = new Date("2026-10-05T10:00:00Z");
    expect(reportPeriodFor("month", hoy, "Europe/Madrid")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(reportPeriodFor("quarter", hoy, "Europe/Madrid")).toEqual(JULIO_A_SEPTIEMBRE);
  });

  it("RN-REP-32 · sabe distinguir un mes natural, un trimestre natural y cualquier otra cosa", () => {
    expect(periodShape(AGOSTO)).toBe("month");
    expect(periodShape(JULIO_A_SEPTIEMBRE)).toBe("quarter");
    // Tres meses que no empiezan en un trimestre natural no son un trimestre.
    expect(periodShape({ start: "2026-08-01", end: "2026-10-31" })).toBe("other");
    expect(periodShape({ start: "2026-08-03", end: "2026-08-16" })).toBe("other");
  });

  it("RN-REP-32 · un trimestre se compara con el trimestre natural anterior, entero", () => {
    expect(previousPeriod(JULIO_A_SEPTIEMBRE)).toEqual({ start: "2026-04-01", end: "2026-06-30" });
    expect(previousPeriod({ start: "2026-01-01", end: "2026-03-31" })).toEqual({
      start: "2025-10-01",
      end: "2025-12-31",
    });
    // El mes sigue igual que antes.
    expect(previousPeriod(AGOSTO)).toEqual({ start: "2026-07-01", end: "2026-07-31" });
  });
});

describe("RN-REP-32 · cómo se nombra un trimestre", () => {
  it("RN-REP-32 · 'julio a septiembre de 2026' y, en una frase, 'el trimestre de…'", () => {
    expect(quarterName(JULIO_A_SEPTIEMBRE)).toBe("julio a septiembre de 2026");
    expect(periodPhrase(JULIO_A_SEPTIEMBRE)).toBe("el trimestre de julio a septiembre de 2026");
    expect(periodPhrase(AGOSTO)).toBe("agosto de 2026");
  });

  it("RN-REP-32 · el resumen automático de un trimestre no dice 'este mes'", () => {
    const texto = executiveSummaryText({
      period: JULIO_A_SEPTIEMBRE,
      changes: { delivered: 0, inProgress: 0, pendingStart: 0 },
      allowance: [],
      budgeted: 0,
      menusPublished: null,
      startCompliance: null,
      visits: 5921,
    });
    expect(texto).toBe("En el trimestre de julio a septiembre de 2026 no hubo cambios. La web recibió 5921 visitas.");
  });

  it("RN-REP-32 · el relato de un informe trimestral se titula 'este trimestre'", () => {
    const t = es.reportsPage;
    expect(sectionTitle("month_activity", JULIO_A_SEPTIEMBRE, t)).toBe("Lo que ha pasado este trimestre");
    expect(sectionTitle("month_activity", AGOSTO, t)).toBe("Lo que ha pasado este mes");
    expect(sectionTitle("web_traffic", JULIO_A_SEPTIEMBRE, t)).toBe("Tráfico de la web");
  });
});

describe("RN-REP-32 · el periodo del informe es un término del plan", () => {
  function formulario(extra: Record<string, string> = {}) {
    const datos: Record<string, string> = {
      price: "20",
      includedSmall: "0",
      includedPhoto: "0",
      includedMedium: "0",
      includedLarge: "0",
      startSlaHours: "48",
      executionSlaSmall: "72",
      executionSlaPhoto: "72",
      executionSlaMedium: "72",
      executionSlaLarge: "120",
      queueRank: "0",
      reportLevel: "basic",
      ...extra,
    };
    return { get: (name: string) => datos[name] ?? null };
  }

  it("RN-REP-32 · el formulario del plan lee mensual o trimestral, y sin el campo es mensual", () => {
    const trimestral = readPlanTermsForm(formulario({ reportPeriod: "quarter" }));
    expect(trimestral.ok && trimestral.value.reportPeriod).toBe("quarter");
    const sinCampo = readPlanTermsForm(formulario());
    expect(sinCampo.ok && sinCampo.value.reportPeriod).toBe("month");
    expect(readPlanTermsForm(formulario({ reportPeriod: "semanal" }))).toEqual({ ok: false, error: "reportPeriod" });
  });

  it("RN-REP-32 · en la comparativa, pasar de trimestral a mensual es mejor para el restaurante", () => {
    const basico = {
      priceCents: 2000,
      includedSmall: 0,
      includedPhoto: 0,
      includedMedium: 0,
      includedLarge: 0,
      startSlaHours: 48,
      canOrderRequests: false,
      reportLevelRank: 0,
      reportPeriod: "quarter" as const,
    };
    const fila = comparePlans(basico, { ...basico, reportPeriod: "month" }).find((r) => r.key === "reportPeriod");
    expect(fila).toEqual({ key: "reportPeriod", changed: true, better: true });
    const alReves = comparePlans({ ...basico, reportPeriod: "month" }, basico).find((r) => r.key === "reportPeriod");
    expect(alReves).toEqual({ key: "reportPeriod", changed: true, better: false });
  });
});

function punto(metric: string, dia: string, value: number, dimension = "") {
  return { metric, dimension, periodStart: dia, value };
}

describe("RN-REP-33 · el tráfico de la web", () => {
  it("RN-REP-33 · las páginas más visitadas son las cinco con más vistas del periodo", () => {
    const puntos = [
      ...["/", "/carta", "/reservas", "/contacto", "/historia", "/eventos"].map((pagina, i) =>
        punto("page_views_by_page", "2026-07-10", 100 - i * 10, pagina),
      ),
      punto("page_views_by_page", "2026-08-10", 50, "/eventos"),
      // Fuera del periodo: no cuenta.
      punto("page_views_by_page", "2026-10-01", 999, "/fuera"),
    ];
    const trafico = webTraffic(puntos, JULIO_A_SEPTIEMBRE);
    expect(trafico.topPages.map((p) => p.dimension)).toEqual(["/", "/eventos", "/carta", "/reservas", "/contacto"]);
    expect(trafico.topPages[1]).toEqual({ dimension: "/eventos", value: 100 });
  });

  it("RN-REP-33 · los dispositivos suman las visitas de cada tipo, y la parte se dice en entero", () => {
    const puntos = [
      punto("sessions_by_device", "2026-07-01", 60, "mobile"),
      punto("sessions_by_device", "2026-08-01", 60, "mobile"),
      punto("sessions_by_device", "2026-07-01", 70, "desktop"),
      punto("sessions_by_device", "2026-07-01", 10, "tablet"),
    ];
    const trafico = webTraffic(puntos, JULIO_A_SEPTIEMBRE);
    expect(trafico.devices).toEqual([
      { dimension: "mobile", value: 120 },
      { dimension: "desktop", value: 70 },
      { dimension: "tablet", value: 10 },
    ]);
    expect(trafficShare(120, trafico.devices)).toBe(60);
    expect(trafficShare(0, [])).toBeNull();
    expect(deviceName("mobile")).toBe("Móvil");
    expect(deviceName("desktop")).toBe("Ordenador");
  });

  it("RN-REP-33 · la evolución da un mes por fila, y un mes sin datos es null, no cero", () => {
    const puntos = [
      punto("sessions", "2026-07-02", 100),
      punto("sessions", "2026-07-03", 50),
      punto("users", "2026-07-02", 80),
      punto("sessions", "2026-09-15", 30),
    ];
    const trafico = webTraffic(puntos, JULIO_A_SEPTIEMBRE);
    expect(trafico.months).toEqual([
      { month: "2026-07", partial: false, sessions: 150, users: 80 },
      { month: "2026-08", partial: false, sessions: null, users: null },
      { month: "2026-09", partial: false, sessions: 30, users: null },
    ]);
  });

  it("RN-REP-33 · un solo mes no es una evolución, y sin ningún dato no se pinta la rejilla", () => {
    expect(webTraffic([punto("sessions", "2026-08-02", 10)], AGOSTO).months).toEqual([]);
    expect(webTraffic([], JULIO_A_SEPTIEMBRE).months).toEqual([]);
  });

  it("RN-REP-33 · un mes que el periodo no cubre entero se marca incompleto", () => {
    expect(monthsOfPeriod({ start: "2026-07-15", end: "2026-09-30" })).toEqual([
      { month: "2026-07", from: "2026-07-15", to: "2026-07-31", partial: true },
      { month: "2026-08", from: "2026-08-01", to: "2026-08-31", partial: false },
      { month: "2026-09", from: "2026-09-01", to: "2026-09-30", partial: false },
    ]);
  });

  it("RN-REP-33 · las visitas y los usuarios son las mismas cifras de Analytics, con su motivo si faltan", () => {
    const digital: ReportFigure[] = [
      { section: "digital", metric: "sessions", dimension: "ga4", value: 900, at: "2026-10-01" },
      { section: "digital", metric: "users", dimension: "ga4", value: null, noDataReason: "insufficient_period" },
      { section: "digital", metric: "sessions", dimension: "clarity", value: 40 },
      { section: "digital", metric: "clicks", dimension: "search_console", value: 12 },
    ];
    expect(trafficFigures(digital)).toEqual([
      { section: "web_traffic", metric: "sessions", dimension: "ga4", value: 900, at: "2026-10-01" },
      { section: "web_traffic", metric: "users", dimension: "ga4", value: null, noDataReason: "insufficient_period" },
    ]);
    expect(figureLabel(trafficFigures(digital)[0], es.reportsPage)).toBe("Visitas");
  });
});

describe("RN-REP-33 · Lo esencial y el resumen de un Básico", () => {
  const SOLO_BASICO: readonly ReportSectionState[] = [
    { key: "executive_summary", position: 1, included: true },
    { key: "month_activity", position: 2, included: true },
    { key: "web_traffic", position: 3, included: true },
    { key: "digital", position: 4, included: false },
  ];

  function version(sections: readonly ReportSectionState[], figures: ReportFigure[]): ReportSnapshot {
    return {
      category: "operation",
      period: JULIO_A_SEPTIEMBRE,
      generatedAt: "2026-10-01T09:00:00Z",
      sections,
      figures,
      opportunities: [],
      notes: {},
    };
  }

  const VISITAS: ReportFigure[] = [
    { section: "digital", metric: "sessions", dimension: "ga4", value: 900 },
    { section: "web_traffic", metric: "sessions", dimension: "ga4", value: 900 },
  ];

  it("RN-REP-33 · un Básico tiene la tarjeta de visitas en Lo esencial", () => {
    const tarjetas = headlineFigures(version(SOLO_BASICO, VISITAS));
    expect(tarjetas.map((f) => f.section)).toEqual(["web_traffic"]);
  });

  it("RN-REP-33 · con las dos secciones, las visitas salen una sola vez", () => {
    const tarjetas = headlineFigures(
      version(
        SOLO_BASICO.map((s) => ({ ...s, included: true })),
        VISITAS,
      ),
    );
    expect(tarjetas.filter((f) => f.metric === "sessions")).toHaveLength(1);
  });

  it("RN-REP-33 · el resumen de un Básico cuenta las visitas de la web", () => {
    const hechos = executiveSummaryFacts({
      period: JULIO_A_SEPTIEMBRE,
      figures: VISITAS,
      sections: SOLO_BASICO,
      activity: undefined,
      allowance: undefined,
    });
    expect(hechos.visits).toBe(900);
  });
});

describe("RN-REP-33 · la versión trae el tráfico", () => {
  function dias(metric: string, desde: string, cuantos: number, value: number, dimension = ""): MetricPoint[] {
    return Array.from({ length: cuantos }, (_, i) => {
      const fecha = new Date(`${desde}T00:00:00Z`);
      fecha.setUTCDate(fecha.getUTCDate() + i);
      const dia = fecha.toISOString().slice(0, 10);
      return { metric, dimension, period_start: dia, period_end: dia, value, unit: null };
    });
  }

  function gateway(puntos: MetricPoint[], estados: ProviderState[]): ReportGateway {
    return {
      report: vi.fn().mockResolvedValue(null),
      operationDataset: vi.fn().mockResolvedValue({}),
      financeDataset: vi.fn().mockResolvedValue({}),
      metricPoints: vi.fn().mockResolvedValue(new Map([["ga4", puntos]])),
      providerStates: vi.fn().mockResolvedValue(estados),
      monthActivity: vi.fn().mockResolvedValue({ changes: [], entries: [] }),
      changeAllowance: vi.fn().mockResolvedValue({ categories: [] }),
      approvedOpportunities: vi.fn().mockResolvedValue([]),
      previousReportOpportunities: vi.fn().mockResolvedValue([]),
      planUsageData: vi.fn().mockResolvedValue({ cycles: [], entries: [] }),
      holidays: vi.fn().mockResolvedValue([]),
      storeVersion: vi.fn().mockResolvedValue("version-1"),
      reportsDueForSend: vi.fn().mockResolvedValue([]),
      reportsDueForReminder: vi.fn().mockResolvedValue([]),
      send: vi.fn().mockResolvedValue(0),
      notifyScheduleDueSoon: vi.fn().mockResolvedValue(0),
    };
  }

  const BASICO: ReportRow = {
    id: "rep-q3",
    spaceId: "space-1",
    establishmentId: "est-1",
    category: "operation",
    periodStart: JULIO_A_SEPTIEMBRE.start,
    periodEnd: JULIO_A_SEPTIEMBRE.end,
    status: "preparing",
    sections: [
      { key: "executive_summary", position: 1, included: true },
      { key: "month_activity", position: 2, included: true },
      { key: "web_traffic", position: 3, included: true },
    ],
    notes: {},
    timezone: "Europe/Madrid",
    reportLevel: "basic",
  };

  it("RN-REP-33 · un Básico trimestral recibe visitas, usuarios, páginas, dispositivos y la evolución", async () => {
    const puntos = [
      ...dias("sessions", "2026-07-01", 92, 10),
      ...dias("users", "2026-07-01", 92, 8),
      ...dias("page_views_by_page", "2026-07-01", 92, 5, "/carta"),
      ...dias("sessions_by_device", "2026-07-01", 92, 7, "mobile"),
    ];
    const deps = {
      gateway: gateway(puntos, [{ provider: "ga4", status: "connected", lastSuccessAt: "2026-10-01T05:00:00Z" }]),
      now: () => new Date("2026-10-01T09:00:00Z"),
    };
    const snapshot = await buildSnapshot(deps, BASICO);

    expect(snapshot.figures.find((f) => f.section === "web_traffic" && f.metric === "sessions")?.value).toBe(920);
    expect(snapshot.figures.find((f) => f.section === "web_traffic" && f.metric === "users")?.value).toBe(736);
    expect(snapshot.traffic?.topPages).toEqual([{ dimension: "/carta", value: 460 }]);
    expect(snapshot.traffic?.devices).toEqual([{ dimension: "mobile", value: 644 }]);
    expect(snapshot.traffic?.months.map((m) => m.sessions)).toEqual([310, 310, 300]);
    // RN-REP-15 · un Básico no lleva comparación: ni se pide el periodo anterior.
    expect(snapshot.figures.every((f) => f.previous === undefined)).toBe(true);
    // RN-REP-28 · el resumen nombra el trimestre y cuenta las visitas.
    expect(snapshot.notes.executive_summary).toContain("En el trimestre de julio a septiembre de 2026");
    expect(snapshot.notes.executive_summary).toContain("920 visitas");
  });

  it("RN-REP-33 · sin Analytics, las visitas dicen el motivo y no hay detalle que lo contradiga", async () => {
    const deps = { gateway: gateway([], []), now: () => new Date("2026-10-01T09:00:00Z") };
    const snapshot = await buildSnapshot(deps, BASICO);

    const visitas = snapshot.figures.find((f) => f.section === "web_traffic" && f.metric === "sessions");
    expect(visitas?.value).toBeNull();
    expect(visitas?.noDataReason).toBe("not_connected");
    expect(snapshot.traffic).toEqual({ topPages: [], devices: [], months: [] });
  });

  it("RN-REP-33 · si el equipo desmarca la sección, la versión no trae el detalle", async () => {
    const deps = { gateway: gateway([], []), now: () => new Date("2026-10-01T09:00:00Z") };
    const snapshot = await buildSnapshot(deps, {
      ...BASICO,
      sections: BASICO.sections.map((s) => (s.key === "web_traffic" ? { ...s, included: false } : s)),
    });
    expect(snapshot.traffic).toBeUndefined();
  });
});
