/**
 * El barrido de oportunidades entero, sin base de datos y sin red (Fase 3,
 * Hito 15; RN-OPP-02, RN-OPP-06).
 *
 * Lo que se vigila aquí no son los umbrales —eso es `opportunities.test.ts`—
 * sino las tres cosas que solo pasan cuando el barrido corre de verdad: la
 * ventana en la zona del ESPACIO, que una fuente sin dato actual no
 * dispare nada, y que un restaurante que falla no tumbe a los demás.
 */
import { describe, expect, it, vi } from "vitest";

import type { MetricPoint } from "@/core/integrations";

import { liveProviders, runOpportunityDetection } from "./opportunity-detection";
import type { DetectionToStore, EstablishmentToScan, OpportunityGateway, ProviderState } from "./opportunity-gateway";

const AHORA = new Date("2026-09-14T09:00:00Z");

function dias(metric: string, value: number, from: string, to: string, dimension = ""): MetricPoint[] {
  const puntos: MetricPoint[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const fin = new Date(`${to}T00:00:00Z`);
  while (d <= fin) {
    const day = d.toISOString().slice(0, 10);
    puntos.push({ metric, dimension, period_start: day, period_end: day, value, unit: null });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return puntos;
}

function gateway(overrides: Partial<OpportunityGateway> = {}) {
  const almacenadas: DetectionToStore[] = [];
  const establecimientos: EstablishmentToScan[] = [
    { establishment_id: "est-1", space_id: "esp-1", timezone: "Europe/Madrid" },
  ];
  const estados: ProviderState[] = [
    { provider: "ga4", status: "connected", lastSuccessAt: "2026-09-14T06:00:00Z" },
  ];
  // Una caída del 40 %: 28 días a 3 sesiones frente a 28 días a 5.
  const puntos = new Map<string, readonly MetricPoint[]>([
    ["ga4", [...dias("sessions", 5, "2026-07-20", "2026-08-16"), ...dias("sessions", 3, "2026-08-17", "2026-09-13")]],
  ]);

  const base: OpportunityGateway = {
    establishmentsToScan: vi.fn(async () => establecimientos),
    providerStates: vi.fn(async () => estados),
    metricPoints: vi.fn(async () => puntos),
    store: vi.fn(async (d: DetectionToStore) => {
      almacenadas.push(d);
      return "opp-1";
    }),
  };
  return { gateway: { ...base, ...overrides }, almacenadas };
}

describe("RN-OPP-02 · el barrido de oportunidades", () => {
  it("detecta sobre los 28 últimos días completos y guarda la detección con su evidencia", async () => {
    const { gateway: g, almacenadas } = gateway();

    const resultado = await runOpportunityDetection({ gateway: g, now: () => AHORA });

    expect(resultado).toEqual({ scanned: 1, detections: 1, failed: 0 });
    expect(almacenadas[0]).toMatchObject({
      establishmentId: "est-1",
      rule: "traffic_drop",
      subject: "",
      impact: "medium",
      periodStart: "2026-08-17",
      periodEnd: "2026-09-13",
    });
    expect(almacenadas[0].evidence).toEqual([
      { provider: "ga4", metric: "sessions", dimension: "", value: 84, previous: 140, unit: "count" },
    ]);
    // Y se piden los puntos de las DOS ventanas, que es lo que la
    // variación necesita.
    expect(g.metricPoints).toHaveBeenCalledWith("est-1", "2026-07-20", "2026-09-13");
  });

  it("la ventana es la del espacio, no la del servidor (CLAUDE.md)", async () => {
    // A las 09:00 UTC del 14 en Honolulu todavía es el 13, así que su
    // ventana acaba un día antes. Con la zona del servidor (UTC en
    // Vercel) el fallo no se vería en Madrid y correría un día en
    // cualquier espacio al oeste: exactamente el que arregló la
    // migración 83.
    const { gateway: g } = gateway({
      establishmentsToScan: vi.fn(async () => [
        { establishment_id: "est-1", space_id: "esp-1", timezone: "Pacific/Honolulu" },
      ]),
    });

    await runOpportunityDetection({ gateway: g, now: () => AHORA });

    expect(g.metricPoints).toHaveBeenCalledWith("est-1", "2026-07-19", "2026-09-12");
  });

  it("una fuente desconectada, con error o con el dato viejo no dispara nada (P6)", async () => {
    for (const estado of [
      { provider: "ga4", status: "disconnected", lastSuccessAt: "2026-09-14T06:00:00Z" },
      { provider: "ga4", status: "error", lastSuccessAt: "2026-09-14T06:00:00Z" },
      // Conectada, pero sin éxito desde hace cuatro días en una fuente diaria.
      { provider: "ga4", status: "connected", lastSuccessAt: "2026-09-10T06:00:00Z" },
      { provider: "ga4", status: "pending_authorization", lastSuccessAt: null },
    ]) {
      const { gateway: g, almacenadas } = gateway({ providerStates: vi.fn(async () => [estado]) });
      const resultado = await runOpportunityDetection({ gateway: g, now: () => AHORA });

      expect(almacenadas, estado.status).toEqual([]);
      expect(resultado.detections).toBe(0);
      // Y ni siquiera se leen los puntos: sin fuente viva no hay nada que calcular.
      expect(g.metricPoints).not.toHaveBeenCalled();
    }
  });

  it("un restaurante que falla no tumba a los demás", async () => {
    const { gateway: g } = gateway({
      establishmentsToScan: vi.fn(async () => [
        { establishment_id: "est-1", space_id: "esp-1", timezone: "Europe/Madrid" },
        { establishment_id: "est-2", space_id: "esp-1", timezone: "Europe/Madrid" },
      ]),
      providerStates: vi.fn(async (id: string) => {
        if (id === "est-1") throw new Error("la base dijo que no");
        return [{ provider: "ga4", status: "connected", lastSuccessAt: "2026-09-14T06:00:00Z" }];
      }),
    });

    const resultado = await runOpportunityDetection({ gateway: g, now: () => AHORA });

    expect(resultado.failed).toBe(1);
    expect(resultado.detections).toBe(1);
  });
});

describe("liveProviders()", () => {
  it("una fuente sin fila de integración no existe, y una con estado que no reconoce tampoco", () => {
    expect(liveProviders([], AHORA)).toEqual([]);
    expect(
      liveProviders([{ provider: "ga4", status: "inventado", lastSuccessAt: "2026-09-14T06:00:00Z" }], AHORA),
    ).toEqual([]);
    expect(
      liveProviders([{ provider: "reservas", status: "connected", lastSuccessAt: "2026-09-14T06:00:00Z" }], AHORA),
    ).toEqual([]);
  });

  it("PageSpeed es semanal: un análisis de hace diez días sigue siendo actual", () => {
    expect(
      liveProviders([{ provider: "pagespeed", status: "connected", lastSuccessAt: "2026-09-04T06:00:00Z" }], AHORA),
    ).toEqual(["pagespeed"]);
    expect(
      liveProviders([{ provider: "ga4", status: "connected", lastSuccessAt: "2026-09-04T06:00:00Z" }], AHORA),
    ).toEqual([]);
  });
});
