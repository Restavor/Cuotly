/**
 * GA4 · Google Analytics Data API v1beta (§92.1). Las siete métricas de la
 * maestra: usuarios, sesiones, páginas más visitadas, procedencia,
 * dispositivos, ubicaciones aproximadas y conversiones configuradas.
 *
 * Las "conversiones configuradas" son los eventos clave (`keyEvents`) de
 * la propiedad: "una conversión solo existe si se ha configurado el
 * evento correspondiente" (§92.1), así que solo entran los eventos con
 * algún evento clave contado; no se inventa ninguno.
 */

import type { MetricPoint } from "@/core/integrations";

import {
  type AdapterContext,
  type IntegrationAdapter,
  asNumber,
  bearer,
  callJson,
  isoDay,
  point,
  requireProperty,
  topPerDay,
} from "./adapter";

const DATA_API = "https://analyticsdata.googleapis.com/v1beta";

interface RunReportResponse {
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
}

/** `properties/123` o `123` a `properties/123`. */
export function ga4PropertyName(propertyId: string): string {
  const limpio = propertyId.trim().replace(/^properties\//, "");
  return `properties/${limpio}`;
}

async function runReport(
  ctx: AdapterContext,
  property: string,
  dimensions: readonly string[],
  metrics: readonly string[],
  limit: number,
): Promise<RunReportResponse> {
  return callJson<RunReportResponse>(ctx, `GA4 runReport (${dimensions.join(",")})`, `${DATA_API}/${property}:runReport`, {
    method: "POST",
    headers: { ...bearer(ctx), "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: ctx.window.from, endDate: ctx.window.to }],
      dimensions: dimensions.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })),
      limit,
      keepEmptyRows: false,
    }),
  });
}

/** Un desglose por día y una dimensión más, a puntos: los N mayores de cada día. */
function breakdown(
  response: RunReportResponse,
  metric: string,
  unit: string | null = null,
): MetricPoint[] {
  const puntos: MetricPoint[] = [];
  for (const row of response.rows ?? []) {
    const day = isoDay(row.dimensionValues?.[0]?.value ?? "");
    const dimension = row.dimensionValues?.[1]?.value ?? "";
    const value = asNumber(row.metricValues?.[0]?.value);
    if (day === null || value === null || dimension === "" || value <= 0) continue;
    puntos.push(point(metric, day, value, dimension, unit));
  }
  return topPerDay(puntos);
}

export const ga4Adapter: IntegrationAdapter = {
  provider: "ga4",

  async check(ctx) {
    const property = ga4PropertyName(requireProperty(ctx, "la propiedad de GA4"));
    // Los metadatos de la propiedad: una lectura que exige el token y el
    // acceso a ESA propiedad, y no trae ningún dato.
    await callJson(ctx, "GA4 metadata", `${DATA_API}/${property}/metadata`, { headers: bearer(ctx) });
    return { accountLabel: null };
  },

  async sync(ctx) {
    const property = ga4PropertyName(requireProperty(ctx, "la propiedad de GA4"));
    const points: MetricPoint[] = [];

    const totales = await runReport(ctx, property, ["date"], ["activeUsers", "sessions"], 1000);
    for (const row of totales.rows ?? []) {
      const day = isoDay(row.dimensionValues?.[0]?.value ?? "");
      if (day === null) continue;
      const users = asNumber(row.metricValues?.[0]?.value);
      const sessions = asNumber(row.metricValues?.[1]?.value);
      if (users !== null) points.push(point("users", day, users));
      if (sessions !== null) points.push(point("sessions", day, sessions));
    }

    const desgloses: readonly [string, string, string][] = [
      ["page_views_by_page", "pagePath", "screenPageViews"],
      ["sessions_by_source", "sessionSource", "sessions"],
      ["sessions_by_device", "deviceCategory", "sessions"],
      ["sessions_by_location", "city", "sessions"],
      ["conversions_by_event", "eventName", "keyEvents"],
      // Decisión 26 · los mismos eventos clave, pero por dispositivo: es el
      // dato que "baja conversión móvil" necesita y que no se puede sacar
      // cruzando los dos desgloses de arriba.
      ["conversions_by_device", "deviceCategory", "keyEvents"],
    ];
    for (const [metric, dimension, ga4Metric] of desgloses) {
      const response = await runReport(ctx, property, ["date", dimension], [ga4Metric], 10000);
      points.push(...breakdown(response, metric));
    }

    return { points, accountLabel: null };
  },
};
