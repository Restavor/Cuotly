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
  TOP_PER_DAY,
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

/**
 * Decisión 26 · las tres reglas de oportunidad que se calculan "por
 * consulta" (CTR bajo, pérdida de posición y búsquedas que salen muy
 * abajo) necesitan impresiones, CTR y posición de CADA consulta, y el
 * catálogo solo guardaba sus clics.
 *
 * Por qué no vale `breakdown()` para esto, que es lo que hace falta
 * entender antes de tocarlo: ahí se descarta la fila sin clics y se
 * guardan las diez mayores POR CLICS de cada día (decisión 25f). Las
 * consultas que disparan estas tres reglas son justamente las que tienen
 * impresiones y **no** tienen clics —esa es la avería que la regla
 * detecta—, así que con aquel criterio no se guardaría ninguna. Estas
 * tres métricas se quedan con las diez mayores POR IMPRESIONES, y las
 * tres comparten esa misma selección para que la regla pueda cruzarlas
 * por la consulta sin quedarse coja.
 *
 * `clicks_by_query` no se toca: es lo que "búsquedas principales" enseña
 * en la pantalla y ahí lo principal son los clics.
 */
const QUERY_FIELDS: readonly [string, "impressions" | "ctr" | "position", string | null][] = [
  ["impressions_by_query", "impressions", null],
  ["ctr_by_query", "ctr", "ratio"],
  ["position_by_query", "position", null],
];

function queryBreakdown(response: QueryResponse): MetricPoint[] {
  const porDia = new Map<string, { dimension: string; impressions: number; ctr: number | null; position: number | null }[]>();
  for (const row of response.rows ?? []) {
    const day = isoDay(row.keys?.[0] ?? "");
    const dimension = row.keys?.[1] ?? "";
    const impressions = asNumber(row.impressions);
    if (day === null || dimension === "" || impressions === null || impressions <= 0) continue;
    const lista = porDia.get(day) ?? [];
    lista.push({ dimension, impressions, ctr: asNumber(row.ctr), position: asNumber(row.position) });
    porDia.set(day, lista);
  }

  const puntos: MetricPoint[] = [];
  for (const [day, lista] of porDia) {
    const mayores = [...lista].sort((a, b) => b.impressions - a.impressions).slice(0, TOP_PER_DAY);
    for (const fila of mayores) {
      for (const [metric, campo, unit] of QUERY_FIELDS) {
        const value = campo === "impressions" ? fila.impressions : fila[campo];
        if (value === null) continue;
        puntos.push(point(metric, day, value, fila.dimension, unit));
      }
    }
  }
  return puntos;
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

    const porConsulta = await query(ctx, ["date", "query"], 5000);
    points.push(...breakdown(porConsulta, "clicks_by_query"));
    points.push(...queryBreakdown(porConsulta));
    points.push(...breakdown(await query(ctx, ["date", "page"], 5000), "clicks_by_page"));

    return { points, accountLabel: null };
  },
};
