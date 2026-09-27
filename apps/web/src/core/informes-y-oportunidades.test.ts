import { describe, expect, it } from "vitest";

import { comparePlans, readPlanTermsForm } from "./plan-catalogue";
import { isPlanReportPeriod, planReportPeriodRank, reportKindsFor } from "./reports";

describe("RN-CRE-26 · el informe mensual y además el trimestral", () => {
  it("RN-CRE-26 · con los dos tocan el del mes y el del trimestre; con uno, solo ese", () => {
    expect(reportKindsFor("both")).toEqual(["month", "quarter"]);
    expect(reportKindsFor("month")).toEqual(["month"]);
    expect(reportKindsFor("quarter")).toEqual(["quarter"]);
  });

  it("RN-CRE-26 · solo existen mensual, trimestral y los dos", () => {
    expect(isPlanReportPeriod("both")).toBe(true);
    expect(isPlanReportPeriod("year")).toBe(false);
  });

  it("RN-CRE-26 · trimestral < mensual < los dos", () => {
    expect(planReportPeriodRank("quarter")).toBeLessThan(planReportPeriodRank("month"));
    expect(planReportPeriodRank("month")).toBeLessThan(planReportPeriodRank("both"));
  });

  const form = (extra: Record<string, string>) => {
    const m = new Map(
      Object.entries({
        price: "99",
        includedSmall: "0",
        includedPhoto: "0",
        includedMedium: "0",
        includedLarge: "0",
        startSlaHours: "24",
        executionSlaSmall: "48",
        executionSlaPhoto: "48",
        executionSlaMedium: "72",
        executionSlaLarge: "120",
        reportLevel: "standard",
        ...extra,
      }),
    );
    return { get: (k: string) => m.get(k) ?? null };
  };

  it("RN-CRE-26 · el formulario del plan acepta los dos y rechaza lo que no existe", () => {
    const r = readPlanTermsForm(form({ reportPeriod: "both" }));
    expect(r.ok && r.value.reportPeriod).toBe("both");
    expect(readPlanTermsForm(form({ reportPeriod: "year" }))).toEqual({ ok: false, error: "reportPeriod" });
  });

  it("RN-CRE-26 · en la comparativa, pasar a los dos es mejor y quitar uno es peor", () => {
    const base = {
      priceCents: 9900,
      includedSmall: 0,
      includedPhoto: 0,
      includedMedium: 0,
      includedLarge: 0,
      startSlaHours: 24,
      canOrderRequests: false,
      reportLevelRank: 2,
    };
    const fila = (a: "month" | "quarter" | "both", b: "month" | "quarter" | "both") =>
      comparePlans({ ...base, reportPeriod: a }, { ...base, reportPeriod: b }).find((r) => r.key === "reportPeriod");
    expect(fila("quarter", "both")).toEqual({ key: "reportPeriod", changed: true, better: true });
    expect(fila("month", "both")).toEqual({ key: "reportPeriod", changed: true, better: true });
    expect(fila("both", "month")).toEqual({ key: "reportPeriod", changed: true, better: false });
    expect(fila("quarter", "month")).toEqual({ key: "reportPeriod", changed: true, better: true });
  });
});
