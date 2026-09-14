/**
 * Search Console · Search Analytics API (§92.2): clics, impresiones, CTR,
 * posición media, búsquedas principales y páginas que aparecen en Google.
 *
 * La propiedad es el sitio tal como está en Search Console: una URL con
 * barra final (`https://magarinos.es/`) o un dominio (`sc-domain:
 * magarinos.es`). Search Console publica los datos con dos o tres días de
 * retraso, y por eso cada pasada repite los tres últimos días (RN-INT-09).
 */

import type { MetricPoint } from "@/core/integrations";

import {
  type AdapterContext,
  AdapterFailure,
  type IntegrationAdapter,
  asNumber,
  bearer,
  callJson,
  isoDay,
  point,
  requireProperty,
  topPerDay,
} from "./adapter";

const API = "https://www.googleapis.com/webmasters/v3";

interface QueryResponse {
  rows?: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }[];
}

function siteUrl(ctx: AdapterContext): string {
  return encodeURIComponent(requireProperty(ctx, "el sitio de Search Console"));
}

async function query(
  ctx: AdapterContext,
  dimensions: readonly string[],
  rowLimit: number,
): Promise<QueryResponse> {
  return callJson<QueryResponse>(
    ctx,
    `Search Console query (${dimensions.join(",")})`,
    `${API}/sites/${siteUrl(ctx)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { ...bearer(ctx), "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: ctx.window.from,
        endDate: ctx.window.to,
        dimensions,
        rowLimit,
        dataState: "final",
      }),
    },
  );
}

function breakdown(response: QueryResponse, metric: string): MetricPoint[] {
  const puntos: MetricPoint[] = [];
  for (const row of response.rows ?? []) {
    const day = isoDay(row.keys?.[0] ?? "");
    const dimension = row.keys?.[1] ?? "";
    const clicks = asNumber(row.clicks);
    if (day === null || dimension === "" || clicks === null || clicks <= 0) continue;
    puntos.push(point(metric, day, clicks, dimension));
  }
  return topPerDay(puntos);
}

export const searchConsoleAdapter: IntegrationAdapter = {
  provider: "search_console",

  async check(ctx) {
    // La ficha del sitio: exige el token y que la cuenta tenga acceso a
    // ESE sitio. No devuelve ningún dato de búsqueda.
    const site = await callJson<{ siteUrl?: string; permissionLevel?: string }>(
      ctx,
      "Search Console site",
      `${API}/sites/${siteUrl(ctx)}`,
      { headers: bearer(ctx) },
    );
    if (site.permissionLevel === "siteUnverifiedUser") {
      throw new AdapterFailure("La cuenta no tiene el sitio verificado en Search Console", "configuration");
    }
    return { accountLabel: null };
  },

  async sync(ctx) {
    const points: MetricPoint[] = [];

    const porDia = await query(ctx, ["date"], 1000);
    for (const row of porDia.rows ?? []) {
      const day = isoDay(row.keys?.[0] ?? "");
      if (day === null) continue;
      const clicks = asNumber(row.clicks);
      const impressions = asNumber(row.impressions);
      const ctr = asNumber(row.ctr);
      const position = asNumber(row.position);
      if (clicks !== null) points.push(point("clicks", day, clicks));
      if (impressions !== null) points.push(point("impressions", day, impressions));
      if (ctr !== null) points.push(point("ctr", day, ctr, "", "ratio"));
      if (position !== null) points.push(point("position", day, position));
    }

    points.push(...breakdown(await query(ctx, ["date", "query"], 5000), "clicks_by_query"));
    points.push(...breakdown(await query(ctx, ["date", "page"], 5000), "clicks_by_page"));

    return { points, accountLabel: null };
  },
};
