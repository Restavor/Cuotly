/**
 * PageSpeed Insights · API v5 (§92.3). La maestra solo nombra la fuente;
 * el catálogo es lo que un análisis de Lighthouse da de una URL: la
 * puntuación de rendimiento (0 a 100) y las métricas de laboratorio (LCP,
 * CLS, TBT, FCP, Speed Index), por estrategia —móvil y escritorio—, y el
 * INP de campo cuando Chrome tiene datos reales de esa URL.
 *
 * Es una MEDICIÓN, no una serie que la fuente guarde: cada pasada mide la
 * URL en ese momento y el punto lleva el día de la medición. Por eso la
 * frecuencia es semanal (§118) y el resumen enseña la última medición,
 * no una suma.
 *
 * La propiedad es la URL que se mide; la clave es una clave de API de
 * Google Cloud con PageSpeed Insights API habilitada.
 */

import type { MetricPoint } from "@/core/integrations";

import { type AdapterContext, type IntegrationAdapter, asNumber, callJson, point, requireProperty } from "./adapter";

export const PAGESPEED_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
export const STRATEGIES = ["mobile", "desktop"] as const;

interface PagespeedResponse {
  lighthouseResult?: {
    categories?: { performance?: { score?: number } };
    audits?: Record<
      string,
      { numericValue?: number; details?: { overallSavingsBytes?: number } }
    >;
  };
  loadingExperience?: {
    metrics?: Record<string, { percentile?: number }>;
  };
}

/**
 * Decisión 26 · las dos auditorías de imágenes, que se leen distinto que
 * las de arriba: en una auditoría de oportunidad, `numericValue` son los
 * milisegundos que se ganarían, y los BYTES están en
 * `details.overallSavingsBytes`. Lo que la regla de "imágenes pesadas"
 * mira son los kilobytes, así que es ese campo y no el otro.
 */
const SAVINGS_AUDITS: readonly [string, string][] = [
  ["uses-optimized-images", "optimized_images_savings_kb_by_strategy"],
  ["uses-responsive-images", "responsive_images_savings_kb_by_strategy"],
];

/** Auditoría de Lighthouse → métrica de Cuotly y unidad. */
const AUDITS: readonly [string, string, string][] = [
  ["largest-contentful-paint", "lcp_ms_by_strategy", "ms"],
  ["cumulative-layout-shift", "cls_by_strategy", "score"],
  ["total-blocking-time", "tbt_ms_by_strategy", "ms"],
  ["first-contentful-paint", "fcp_ms_by_strategy", "ms"],
  ["speed-index", "speed_index_ms_by_strategy", "ms"],
];

async function runPagespeed(
  ctx: AdapterContext,
  url: string,
  strategy: (typeof STRATEGIES)[number],
): Promise<PagespeedResponse> {
  const params = new URLSearchParams({ url, strategy, category: "performance", key: ctx.secret });
  return callJson<PagespeedResponse>(ctx, `PageSpeed (${strategy})`, `${PAGESPEED_URL}?${params.toString()}`);
}

export function pointsFromRun(
  response: PagespeedResponse,
  strategy: string,
  day: string,
): MetricPoint[] {
  const points: MetricPoint[] = [];
  const score = asNumber(response.lighthouseResult?.categories?.performance?.score);
  if (score !== null) {
    points.push(point("performance_score_by_strategy", day, Math.round(score * 100), strategy, "score"));
  }
  for (const [audit, metric, unit] of AUDITS) {
    const value = asNumber(response.lighthouseResult?.audits?.[audit]?.numericValue);
    if (value === null) continue;
    points.push(point(metric, day, unit === "ms" ? Math.round(value) : value, strategy, unit));
  }
  for (const [audit, metric] of SAVINGS_AUDITS) {
    const bytes = asNumber(response.lighthouseResult?.audits?.[audit]?.details?.overallSavingsBytes);
    // Cero es un dato: "no hay nada que ahorrar aquí". Se guarda, porque
    // si no, una web ya optimizada no se distinguiría de una sin medir.
    if (bytes === null) continue;
    points.push(point(metric, day, Math.round(bytes / 1024), strategy, "kb"));
  }

  const inp = asNumber(response.loadingExperience?.metrics?.INTERACTION_TO_NEXT_PAINT?.percentile);
  if (inp !== null) points.push(point("inp_ms_by_strategy", day, inp, strategy, "ms"));
  return points;
}

export const pagespeedAdapter: IntegrationAdapter = {
  provider: "pagespeed",

  async check(ctx) {
    const url = requireProperty(ctx, "la URL que mide PageSpeed");
    // No hay una llamada más barata que valide la clave y la URL: la
    // comprobación es un análisis en móvil, y su resultado se descarta.
    await runPagespeed(ctx, url, "mobile");
    return { accountLabel: null };
  },

  async sync(ctx) {
    const url = requireProperty(ctx, "la URL que mide PageSpeed");
    const points: MetricPoint[] = [];
    for (const strategy of STRATEGIES) {
      const response = await runPagespeed(ctx, url, strategy);
      points.push(...pointsFromRun(response, strategy, ctx.today));
    }
    return { points, accountLabel: null };
  },
};
