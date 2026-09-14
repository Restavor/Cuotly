import { describe, expect, it, vi } from "vitest";

import { INTEGRATION_PROVIDERS, METRICS_BY_PROVIDER, isMetricOf } from "@/core/integrations";

import { ADAPTERS, AdapterFailure, adapterFor, classifyHttpStatus, type AdapterContext } from "./index";
import { asNumber, callJson, isoDay, topPerDay } from "./adapter";
import { CLARITY_EXPORT_URL } from "./clarity";
import { pointsFromRun } from "./pagespeed";

/**
 * RN-INT-01 · un adaptador por fuente. Cada uno se prueba con un `fetch`
 * falso que devuelve lo que la API de verdad devuelve (recortado a lo que
 * se lee), y lo que se vigila es: que llame a la URL correcta con la
 * credencial en la cabecera, que convierta la respuesta en puntos del
 * catálogo de `METRICS_BY_PROVIDER` con la clave natural, que la
 * comprobación no importe datos, y que los fallos se clasifiquen como
 * RN-INT-08 manda.
 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function ctx(provider: AdapterContext["provider"], overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    provider,
    secret: "SECRETO",
    propertyId: "prop",
    window: { from: "2026-09-10", to: "2026-09-13" },
    today: "2026-09-14",
    fetchImpl: vi.fn<typeof fetch>(),
    ...overrides,
  };
}

function urlOf(fetchImpl: AdapterContext["fetchImpl"], n = 0): string {
  return String(vi.mocked(fetchImpl).mock.calls[n][0]);
}

function headerOf(fetchImpl: AdapterContext["fetchImpl"], name: string, n = 0): string | undefined {
  const init = vi.mocked(fetchImpl).mock.calls[n][1];
  return (init?.headers as Record<string, string> | undefined)?.[name];
}

describe("adaptadores (RN-INT-01, RN-INT-08)", () => {
  it("RN-INT-01 · hay un adaptador por fuente de §115, y ninguno para lo que no es una integración", () => {
    for (const provider of INTEGRATION_PROVIDERS) {
      expect(ADAPTERS[provider].provider).toBe(provider);
      expect(adapterFor(provider)).toBe(ADAPTERS[provider]);
    }
    expect(adapterFor("reservations")).toBeUndefined();
  });

  it("RN-INT-08 · 401 y 403 son autorización; 429 y 5xx transitorios; 400 y 404 configuración", () => {
    expect(classifyHttpStatus(401)).toBe("authorization");
    expect(classifyHttpStatus(403)).toBe("authorization");
    expect(classifyHttpStatus(429)).toBe("transient");
    expect(classifyHttpStatus(500)).toBe("transient");
    expect(classifyHttpStatus(503)).toBe("transient");
    expect(classifyHttpStatus(400)).toBe("configuration");
    expect(classifyHttpStatus(404)).toBe("configuration");
  });

  it("callJson clasifica y recorta: la respuesta de error entra en el motivo como una frase, no entera", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("x".repeat(1000), { status: 403 }));
    const fallo = await callJson({ fetchImpl }, "prueba", "https://x").catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(AdapterFailure);
    expect((fallo as AdapterFailure).failureKind).toBe("authorization");
    expect((fallo as AdapterFailure).message.length).toBeLessThan(260);

    fetchImpl.mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(callJson({ fetchImpl }, "prueba", "https://x")).rejects.toMatchObject({ failureKind: "transient" });

    fetchImpl.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    await expect(callJson({ fetchImpl }, "prueba", "https://x")).rejects.toMatchObject({ failureKind: "transient" });
  });

  it("las ayudas: números que llegan como texto, fechas de GA4 y los N mayores de cada día", () => {
    expect(asNumber("12")).toBe(12);
    expect(asNumber(3.5)).toBe(3.5);
    expect(asNumber("")).toBeNull();
    expect(asNumber("abc")).toBeNull();
    expect(asNumber(undefined)).toBeNull();
    expect(isoDay("20260913")).toBe("2026-09-13");
    expect(isoDay("2026-09-13")).toBe("2026-09-13");
    expect(isoDay("13/09/2026")).toBeNull();

    const puntos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((v) => ({
      metric: "m",
      dimension: `d${v}`,
      period_start: "2026-09-13",
      period_end: "2026-09-13",
      value: v,
      unit: null,
    }));
    const top = topPerDay([...puntos, { ...puntos[0], period_start: "2026-09-12", period_end: "2026-09-12" }]);
    expect(top.filter((p) => p.period_start === "2026-09-13")).toHaveLength(10);
    expect(top.filter((p) => p.period_start === "2026-09-13").map((p) => p.value)).not.toContain(1);
    expect(top.filter((p) => p.period_start === "2026-09-12")).toHaveLength(1);
  });

  it("falta la propiedad: es un fallo de configuración, no una llamada a la fuente", async () => {
    for (const provider of ["ga4", "search_console", "business_profile", "pagespeed"] as const) {
      const c = ctx(provider, { propertyId: null });
      await expect(ADAPTERS[provider].sync(c)).rejects.toMatchObject({ failureKind: "configuration" });
      expect(c.fetchImpl).not.toHaveBeenCalled();
    }
  });

  describe("GA4 (§92.1)", () => {
    const totales = {
      rows: [
        { dimensionValues: [{ value: "20260912" }], metricValues: [{ value: "40" }, { value: "55" }] },
        { dimensionValues: [{ value: "20260913" }], metricValues: [{ value: "42" }, { value: "60" }] },
      ],
    };
    const paginas = {
      rows: [
        { dimensionValues: [{ value: "20260913" }, { value: "/carta" }], metricValues: [{ value: "30" }] },
        { dimensionValues: [{ value: "20260913" }, { value: "/" }], metricValues: [{ value: "25" }] },
        { dimensionValues: [{ value: "20260913" }, { value: "/vacia" }], metricValues: [{ value: "0" }] },
      ],
    };
    const vacio = { rows: [] };

    it("sincroniza: totales por día y desgloses de los N mayores, todo dentro del catálogo", async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json(totales))
        .mockResolvedValueOnce(json(paginas))
        .mockResolvedValueOnce(json(vacio))
        .mockResolvedValueOnce(json(vacio))
        .mockResolvedValueOnce(json(vacio))
        .mockResolvedValueOnce(json({ rows: [{ dimensionValues: [{ value: "20260913" }, { value: "reserva" }], metricValues: [{ value: "2" }] }] }))
        // Decisión 26 · el séptimo desglose: los mismos eventos clave, por
        // dispositivo. Sin él no se puede comparar cómo convierte el móvil.
        .mockResolvedValueOnce(json({ rows: [
          { dimensionValues: [{ value: "20260913" }, { value: "mobile" }], metricValues: [{ value: "1" }] },
          { dimensionValues: [{ value: "20260913" }, { value: "desktop" }], metricValues: [{ value: "5" }] },
        ] }));
      const c = ctx("ga4", { propertyId: "123", fetchImpl });

      const { points } = await ADAPTERS.ga4.sync(c);

      expect(urlOf(fetchImpl)).toBe("https://analyticsdata.googleapis.com/v1beta/properties/123:runReport");
      expect(headerOf(fetchImpl, "Authorization")).toBe("Bearer SECRETO");
      const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0][1]?.body)) as { dateRanges: unknown[] };
      expect(body.dateRanges).toEqual([{ startDate: "2026-09-10", endDate: "2026-09-13" }]);

      expect(points).toContainEqual({ metric: "users", dimension: "", period_start: "2026-09-12", period_end: "2026-09-12", value: 40, unit: null });
      expect(points).toContainEqual({ metric: "sessions", dimension: "", period_start: "2026-09-13", period_end: "2026-09-13", value: 60, unit: null });
      expect(points).toContainEqual({ metric: "page_views_by_page", dimension: "/carta", period_start: "2026-09-13", period_end: "2026-09-13", value: 30, unit: null });
      expect(points.find((p) => p.dimension === "/vacia")).toBeUndefined();
      expect(points).toContainEqual({ metric: "conversions_by_event", dimension: "reserva", period_start: "2026-09-13", period_end: "2026-09-13", value: 2, unit: null });
      expect(points.every((p) => isMetricOf("ga4", p.metric))).toBe(true);
      // Las conversiones son los eventos clave de la propiedad, no un evento inventado.
      const conversiones = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[5][1]?.body)) as { metrics: { name: string }[] };
      expect(conversiones.metrics).toEqual([{ name: "keyEvents" }]);

      // Decisión 26 · y las mismas conversiones por dispositivo, que son
      // otra consulta: GA4 no las devuelve cruzadas con el desglose de
      // eventos, y es justo el dato que faltaba para "baja conversión
      // móvil".
      expect(points).toContainEqual({ metric: "conversions_by_device", dimension: "mobile", period_start: "2026-09-13", period_end: "2026-09-13", value: 1, unit: null });
      expect(points).toContainEqual({ metric: "conversions_by_device", dimension: "desktop", period_start: "2026-09-13", period_end: "2026-09-13", value: 5, unit: null });
      const porDispositivo = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[6][1]?.body)) as {
        dimensions: { name: string }[];
        metrics: { name: string }[];
      };
      expect(porDispositivo.dimensions).toEqual([{ name: "date" }, { name: "deviceCategory" }]);
      expect(porDispositivo.metrics).toEqual([{ name: "keyEvents" }]);
    });

    it("comprueba leyendo los metadatos de la propiedad, sin pedir ningún informe", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ name: "properties/123/metadata" }));
      await ADAPTERS.ga4.check(ctx("ga4", { propertyId: "properties/123", fetchImpl }));
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(urlOf(fetchImpl)).toBe("https://analyticsdata.googleapis.com/v1beta/properties/123/metadata");
    });

    it("una propiedad a la que la cuenta no llega es un fallo de autorización", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ error: { message: "permission" } }, 403));
      await expect(ADAPTERS.ga4.check(ctx("ga4", { fetchImpl }))).rejects.toMatchObject({ failureKind: "authorization" });
    });
  });

  describe("Search Console (§92.2)", () => {
    it("sincroniza: clics, impresiones, CTR y posición por día, y los desgloses por búsqueda y página", async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json({ rows: [{ keys: ["2026-09-13"], clicks: 12, impressions: 300, ctr: 0.04, position: 8.2 }] }))
        .mockResolvedValueOnce(json({ rows: [{ keys: ["2026-09-13", "restaurante magariños"], clicks: 9, impressions: 20, ctr: 0.45, position: 1.1 }] }))
        .mockResolvedValueOnce(json({ rows: [{ keys: ["2026-09-13", "https://magarinos.es/carta"], clicks: 5, impressions: 40, ctr: 0.1, position: 3 }] }));
      const c = ctx("search_console", { propertyId: "https://magarinos.es/", fetchImpl });

      const { points } = await ADAPTERS.search_console.sync(c);

      expect(urlOf(fetchImpl)).toBe(
        "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fmagarinos.es%2F/searchAnalytics/query",
      );
      const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0][1]?.body)) as { startDate: string; endDate: string; dimensions: string[] };
      expect(body).toMatchObject({ startDate: "2026-09-10", endDate: "2026-09-13", dimensions: ["date"] });

      expect(points).toContainEqual({ metric: "clicks", dimension: "", period_start: "2026-09-13", period_end: "2026-09-13", value: 12, unit: null });
      expect(points).toContainEqual({ metric: "ctr", dimension: "", period_start: "2026-09-13", period_end: "2026-09-13", value: 0.04, unit: "ratio" });
      expect(points).toContainEqual({ metric: "position", dimension: "", period_start: "2026-09-13", period_end: "2026-09-13", value: 8.2, unit: null });
      expect(points).toContainEqual({ metric: "clicks_by_query", dimension: "restaurante magariños", period_start: "2026-09-13", period_end: "2026-09-13", value: 9, unit: null });
      expect(points).toContainEqual({ metric: "clicks_by_page", dimension: "https://magarinos.es/carta", period_start: "2026-09-13", period_end: "2026-09-13", value: 5, unit: null });
      expect(points.every((p) => isMetricOf("search_console", p.metric))).toBe(true);
    });

    it("guarda impresiones, CTR y posición POR CONSULTA, incluida la consulta sin un solo clic (decisión 26)", async () => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json({ rows: [{ keys: ["2026-09-13"], clicks: 12, impressions: 300, ctr: 0.04, position: 8.2 }] }))
        .mockResolvedValueOnce(
          json({
            rows: [
              { keys: ["2026-09-13", "menú del día pontevedra"], clicks: 0, impressions: 220, ctr: 0, position: 24.5 },
              { keys: ["2026-09-13", "restaurante magariños"], clicks: 9, impressions: 20, ctr: 0.45, position: 1.1 },
            ],
          }),
        )
        .mockResolvedValueOnce(json({ rows: [] }));

      const { points } = await ADAPTERS.search_console.sync(
        ctx("search_console", { propertyId: "https://magarinos.es/", fetchImpl }),
      );

      // La consulta de 220 impresiones y CERO clics es la que disparan
      // "CTR bajo" y "búsquedas sin contenido adecuado": `clicks_by_query`
      // la tira (no tiene clics) y estas tres la guardan.
      expect(points).toContainEqual({ metric: "impressions_by_query", dimension: "menú del día pontevedra", period_start: "2026-09-13", period_end: "2026-09-13", value: 220, unit: null });
      expect(points).toContainEqual({ metric: "ctr_by_query", dimension: "menú del día pontevedra", period_start: "2026-09-13", period_end: "2026-09-13", value: 0, unit: "ratio" });
      expect(points).toContainEqual({ metric: "position_by_query", dimension: "menú del día pontevedra", period_start: "2026-09-13", period_end: "2026-09-13", value: 24.5, unit: null });
      expect(points.filter((p) => p.metric === "clicks_by_query").map((p) => p.dimension)).toEqual(["restaurante magariños"]);
      expect(points.every((p) => isMetricOf("search_console", p.metric))).toBe(true);
    });

    it("de las consultas de un día se guardan las diez con más impresiones, no las de más clics (decisión 25f)", async () => {
      const filas = Array.from({ length: 14 }, (_, i) => ({
        keys: ["2026-09-13", `consulta ${i}`],
        clicks: i,
        impressions: 500 - i * 10,
        ctr: 0.01,
        position: 12,
      }));
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json({ rows: [] }))
        .mockResolvedValueOnce(json({ rows: filas }))
        .mockResolvedValueOnce(json({ rows: [] }));

      const { points } = await ADAPTERS.search_console.sync(ctx("search_console", { fetchImpl }));

      const porImpresiones = points.filter((p) => p.metric === "impressions_by_query");
      expect(porImpresiones).toHaveLength(10);
      expect(porImpresiones.map((p) => p.dimension)).toContain("consulta 0");
      expect(porImpresiones.map((p) => p.dimension)).not.toContain("consulta 13");
    });

    it("comprueba leyendo la ficha del sitio; un sitio sin verificar es configuración", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ siteUrl: "sc-domain:magarinos.es", permissionLevel: "siteOwner" }));
      await ADAPTERS.search_console.check(ctx("search_console", { propertyId: "sc-domain:magarinos.es", fetchImpl }));
      expect(urlOf(fetchImpl)).toBe("https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Amagarinos.es");

      fetchImpl.mockResolvedValueOnce(json({ permissionLevel: "siteUnverifiedUser" }));
      await expect(ADAPTERS.search_console.check(ctx("search_console", { fetchImpl }))).rejects.toMatchObject({ failureKind: "configuration" });
    });
  });

  describe("Business Profile (§92.3)", () => {
    it("sincroniza: impresiones por superficie (y su total) y las acciones sobre la ficha, por día", async () => {
      const serie = (dailyMetric: string, value: string) => ({
        dailyMetric,
        timeSeries: { datedValues: [{ date: { year: 2026, month: 9, day: 12 }, value }, { date: { year: 2026, month: 9, day: 13 } }] },
      });
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
        json({
          multiDailyMetricTimeSeries: [
            {
              dailyMetricTimeSeries: [
                serie("BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "10"),
                serie("BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "30"),
                serie("WEBSITE_CLICKS", "4"),
                serie("CALL_CLICKS", "2"),
                serie("BUSINESS_DIRECTION_REQUESTS", "7"),
              ],
            },
          ],
        }),
      );
      const c = ctx("business_profile", { propertyId: "locations/987", fetchImpl });

      const { points } = await ADAPTERS.business_profile.sync(c);

      const url = new URL(urlOf(fetchImpl));
      expect(url.origin + url.pathname).toBe("https://businessprofileperformance.googleapis.com/v1/locations/987:fetchMultiDailyMetricsTimeSeries");
      expect(url.searchParams.getAll("dailyMetrics")).toContain("BUSINESS_BOOKINGS");
      expect(url.searchParams.get("dailyRange.startDate.day")).toBe("10");
      expect(url.searchParams.get("dailyRange.endDate.month")).toBe("9");
      expect(headerOf(fetchImpl, "Authorization")).toBe("Bearer SECRETO");

      expect(points).toContainEqual({ metric: "impressions_by_surface", dimension: "maps_desktop", period_start: "2026-09-12", period_end: "2026-09-12", value: 10, unit: null });
      expect(points).toContainEqual({ metric: "profile_impressions", dimension: "", period_start: "2026-09-12", period_end: "2026-09-12", value: 40, unit: null });
      expect(points).toContainEqual({ metric: "website_clicks", dimension: "", period_start: "2026-09-12", period_end: "2026-09-12", value: 4, unit: null });
      expect(points).toContainEqual({ metric: "direction_requests", dimension: "", period_start: "2026-09-12", period_end: "2026-09-12", value: 7, unit: null });
      // El día sin valor no se rellena con cero.
      expect(points.find((p) => p.period_start === "2026-09-13")).toBeUndefined();
      expect(points.every((p) => isMetricOf("business_profile", p.metric))).toBe(true);
    });

    it("comprueba leyendo la ubicación, y su nombre sirve para reconocerla", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ name: "locations/987", title: "Magariños" }));
      const resultado = await ADAPTERS.business_profile.check(ctx("business_profile", { propertyId: "987", fetchImpl }));
      expect(urlOf(fetchImpl)).toBe("https://mybusinessbusinessinformation.googleapis.com/v1/locations/987?readMask=name,title");
      expect(resultado.accountLabel).toBe("Magariños");
    });
  });

  describe("Clarity (§92.3)", () => {
    const respuesta = [
      { metricName: "Traffic", information: [{ totalSessionCount: "120", totalBotSessionCount: "4", distantUserCount: "90", PagesPerSessionPercentage: 2.3 }] },
      { metricName: "ScrollDepth", information: [{ averageScrollDepth: 61.5 }] },
      { metricName: "EngagementTime", information: [{ totalTime: 5400, activeTime: 3000 }] },
      { metricName: "DeadClickCount", information: [{ sessionsCount: "7", subTotal: "9" }] },
      { metricName: "RageClickCount", information: [{ sessionsCount: "2", subTotal: "3" }] },
    ];

    it("sincroniza con el token del proyecto y guarda cada agregado con el día de la consulta", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json(respuesta));
      const c = ctx("clarity", { propertyId: null, fetchImpl });

      const { points } = await ADAPTERS.clarity.sync(c);

      expect(urlOf(fetchImpl)).toBe(`${CLARITY_EXPORT_URL}?numOfDays=1`);
      expect(headerOf(fetchImpl, "Authorization")).toBe("Bearer SECRETO");
      expect(points).toContainEqual({ metric: "sessions", dimension: "", period_start: "2026-09-14", period_end: "2026-09-14", value: 120, unit: null });
      expect(points).toContainEqual({ metric: "scroll_depth", dimension: "", period_start: "2026-09-14", period_end: "2026-09-14", value: 61.5, unit: "percent" });
      expect(points).toContainEqual({ metric: "engagement_time_seconds", dimension: "", period_start: "2026-09-14", period_end: "2026-09-14", value: 5400, unit: "seconds" });
      expect(points).toContainEqual({ metric: "dead_clicks", dimension: "", period_start: "2026-09-14", period_end: "2026-09-14", value: 9, unit: null });
      expect(points).toContainEqual({ metric: "rage_clicks", dimension: "", period_start: "2026-09-14", period_end: "2026-09-14", value: 3, unit: null });
      // Lo que la respuesta no trae no se inventa.
      expect(points.find((p) => p.metric === "quick_backs")).toBeUndefined();
      expect(points.every((p) => isMetricOf("clarity", p.metric))).toBe(true);
    });

    it("un token rechazado es autorización; comprobar es una llamada sin puntos", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
      await expect(ADAPTERS.clarity.check(ctx("clarity", { fetchImpl }))).rejects.toMatchObject({ failureKind: "authorization" });

      fetchImpl.mockResolvedValueOnce(json(respuesta));
      expect(await ADAPTERS.clarity.check(ctx("clarity", { fetchImpl }))).toEqual({ accountLabel: null });
    });
  });

  describe("PageSpeed (§92.3)", () => {
    const analisis = {
      lighthouseResult: {
        categories: { performance: { score: 0.87 } },
        audits: {
          "largest-contentful-paint": { numericValue: 2345.6 },
          "cumulative-layout-shift": { numericValue: 0.02 },
          "total-blocking-time": { numericValue: 150.2 },
          "first-contentful-paint": { numericValue: 1200 },
          "speed-index": { numericValue: 3100 },
          // Decisión 26 · en una auditoría de oportunidad los bytes están
          // en `details`, no en `numericValue`: ahí van los milisegundos.
          // Leer el campo equivocado daría "2340 KB" cuando son 320.
          "uses-optimized-images": {
            numericValue: 2340,
            details: { overallSavingsBytes: 327_680 },
          },
          "uses-responsive-images": {
            numericValue: 880,
            details: { overallSavingsBytes: 102_400 },
          },
        },
      },
      loadingExperience: { metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 180 } } },
    };

    it("un análisis se convierte en la puntuación y las métricas por estrategia, con el día de la medición", () => {
      const points = pointsFromRun(analisis, "mobile", "2026-09-14");
      expect(points).toContainEqual({ metric: "performance_score_by_strategy", dimension: "mobile", period_start: "2026-09-14", period_end: "2026-09-14", value: 87, unit: "score" });
      expect(points).toContainEqual({ metric: "lcp_ms_by_strategy", dimension: "mobile", period_start: "2026-09-14", period_end: "2026-09-14", value: 2346, unit: "ms" });
      expect(points).toContainEqual({ metric: "cls_by_strategy", dimension: "mobile", period_start: "2026-09-14", period_end: "2026-09-14", value: 0.02, unit: "score" });
      expect(points).toContainEqual({ metric: "inp_ms_by_strategy", dimension: "mobile", period_start: "2026-09-14", period_end: "2026-09-14", value: 180, unit: "ms" });
      expect(points.every((p) => isMetricOf("pagespeed", p.metric))).toBe(true);
      // Sin datos de campo, sin INP.
      expect(pointsFromRun({ lighthouseResult: analisis.lighthouseResult }, "desktop", "2026-09-14").find((p) => p.metric === "inp_ms_by_strategy")).toBeUndefined();
    });

    it("trae los kilobytes ahorrables de las imágenes, que es lo que «imágenes pesadas» necesita (decisión 26)", () => {
      const points = pointsFromRun(analisis, "mobile", "2026-09-14");

      // 327 680 bytes son 320 KB. Si se leyera `numericValue` saldría
      // 2340, que son milisegundos: el fixture los distingue a propósito.
      expect(points).toContainEqual({
        metric: "optimized_images_savings_kb_by_strategy",
        dimension: "mobile",
        period_start: "2026-09-14",
        period_end: "2026-09-14",
        value: 320,
        unit: "kb",
      });
      expect(points).toContainEqual({
        metric: "responsive_images_savings_kb_by_strategy",
        dimension: "mobile",
        period_start: "2026-09-14",
        period_end: "2026-09-14",
        value: 100,
        unit: "kb",
      });
      expect(points.every((p) => isMetricOf("pagespeed", p.metric))).toBe(true);
    });

    it("una web ya optimizada da cero, que es un dato distinto de no haberla medido", () => {
      const optimizada = {
        lighthouseResult: {
          categories: { performance: { score: 0.99 } },
          audits: { "uses-optimized-images": { details: { overallSavingsBytes: 0 } } },
        },
      };

      const points = pointsFromRun(optimizada, "mobile", "2026-09-14");
      const ahorro = points.find((p) => p.metric === "optimized_images_savings_kb_by_strategy");

      expect(ahorro?.value).toBe(0);
      // Y la que no viene en la respuesta no se inventa como cero.
      expect(points.find((p) => p.metric === "responsive_images_savings_kb_by_strategy")).toBeUndefined();
    });

    it("sincroniza midiendo en móvil y en escritorio con la clave en la URL", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => json(analisis));
      const c = ctx("pagespeed", { propertyId: "https://magarinos.es/", fetchImpl });

      const { points } = await ADAPTERS.pagespeed.sync(c);

      expect(fetchImpl).toHaveBeenCalledTimes(2);
      const primera = new URL(urlOf(fetchImpl, 0));
      expect(primera.origin + primera.pathname).toBe("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
      expect(primera.searchParams.get("url")).toBe("https://magarinos.es/");
      expect(primera.searchParams.get("strategy")).toBe("mobile");
      expect(primera.searchParams.get("key")).toBe("SECRETO");
      expect(new URL(urlOf(fetchImpl, 1)).searchParams.get("strategy")).toBe("desktop");
      expect(points.filter((p) => p.metric === "performance_score_by_strategy").map((p) => p.dimension)).toEqual(["mobile", "desktop"]);
    });

    it("una clave rechazada es autorización; una URL que la API no acepta, configuración", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ error: { code: 403 } }, 403));
      await expect(ADAPTERS.pagespeed.check(ctx("pagespeed", { fetchImpl }))).rejects.toMatchObject({ failureKind: "authorization" });
      fetchImpl.mockResolvedValueOnce(json({ error: { code: 400 } }, 400));
      await expect(ADAPTERS.pagespeed.check(ctx("pagespeed", { fetchImpl }))).rejects.toMatchObject({ failureKind: "configuration" });
    });
  });

  it("el catálogo de cada fuente tiene solo métricas de esa fuente (RN-INT-01) y las tres nuevas no se adelantaron al PRD", () => {
    // Las tres fuentes de las que la maestra solo da el nombre tienen catálogo desde este hito, no antes.
    expect(METRICS_BY_PROVIDER.business_profile.length).toBeGreaterThan(0);
    expect(METRICS_BY_PROVIDER.clarity.length).toBeGreaterThan(0);
    expect(METRICS_BY_PROVIDER.pagespeed.length).toBeGreaterThan(0);
  });
});
