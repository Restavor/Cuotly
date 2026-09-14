/**
 * Microsoft Clarity · Data Export API (§92.3). La maestra solo nombra la
 * fuente; el catálogo es lo que la API devuelve por proyecto: tráfico
 * (sesiones, sesiones de robots, usuarios distintos, páginas por sesión),
 * comportamiento (profundidad de scroll, tiempo de interacción) y las
 * señales de fricción (clics muertos, clics de rabia, vueltas rápidas,
 * scroll excesivo, errores de script, clics con error).
 *
 * Dos límites de la fuente que mandan aquí:
 *
 *   · La API solo da agregados de los últimos 1 a 3 días "desde ahora",
 *     nunca un rango de fechas. Por eso cada punto se guarda con el día
 *     de la consulta (`today`) como periodo, y la sincronización diaria
 *     va formando la serie día a día. Un día que no se sincronizó no se
 *     recupera después: la fuente no lo permite.
 *   · Diez llamadas al día por proyecto. Una sincronización es una; la
 *     comprobación del botón de §116 es otra.
 *
 * La clave es el token de exportación del proyecto de Clarity (Settings ›
 * Data Export); no hace falta identificador de proyecto porque el token
 * ya es de uno.
 */

import type { MetricPoint } from "@/core/integrations";

import { type IntegrationAdapter, asNumber, bearer, callJson, point } from "./adapter";

export const CLARITY_EXPORT_URL = "https://www.clarity.ms/export-data/api/v1/project-live-insights";

interface ClarityMetric {
  metricName?: string;
  information?: Record<string, unknown>[];
}

/** Métrica de Clarity → campo de `information` → métrica de Cuotly y unidad. */
const FIELDS: readonly [string, string, string, string | null][] = [
  ["Traffic", "totalSessionCount", "sessions", null],
  ["Traffic", "totalBotSessionCount", "bot_sessions", null],
  ["Traffic", "distantUserCount", "distinct_users", null],
  ["Traffic", "PagesPerSessionPercentage", "pages_per_session", null],
  ["ScrollDepth", "averageScrollDepth", "scroll_depth", "percent"],
  ["EngagementTime", "totalTime", "engagement_time_seconds", "seconds"],
  ["DeadClickCount", "subTotal", "dead_clicks", null],
  ["RageClickCount", "subTotal", "rage_clicks", null],
  ["QuickbackClick", "subTotal", "quick_backs", null],
  ["ExcessiveScroll", "subTotal", "excessive_scroll", null],
  ["ScriptErrorCount", "subTotal", "script_errors", null],
  ["ErrorClickCount", "subTotal", "error_clicks", null],
];

async function liveInsights(ctx: Parameters<IntegrationAdapter["sync"]>[0]): Promise<ClarityMetric[]> {
  const respuesta = await callJson<unknown>(ctx, "Clarity project-live-insights", `${CLARITY_EXPORT_URL}?numOfDays=1`, {
    headers: bearer(ctx),
  });
  return Array.isArray(respuesta) ? (respuesta as ClarityMetric[]) : [];
}

export const clarityAdapter: IntegrationAdapter = {
  provider: "clarity",

  async check(ctx) {
    await liveInsights(ctx);
    return { accountLabel: null };
  },

  async sync(ctx) {
    const metrics = await liveInsights(ctx);
    const points: MetricPoint[] = [];

    for (const [clarityMetric, field, metric, unit] of FIELDS) {
      const bloque = metrics.find((m) => m.metricName === clarityMetric);
      // Sin desglose pedido, `information` trae una sola entrada con los totales.
      const total = bloque?.information?.[0];
      const value = total ? asNumber(total[field]) : null;
      if (value === null) continue;
      points.push(point(metric, ctx.today, value, "", unit));
    }

    return { points, accountLabel: null };
  },
};
