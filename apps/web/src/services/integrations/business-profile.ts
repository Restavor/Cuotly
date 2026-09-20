/**
 * Business Profile · Business Profile Performance API v1 (§92.3). La
 * maestra solo nombra la fuente; el catálogo es lo que la API da por
 * ubicación y día: impresiones en Maps y en Búsqueda (escritorio y
 * móvil) y las acciones sobre la ficha (clics a la web, llamadas, cómo
 * llegar, conversaciones y reservas).
 *
 * La propiedad es la ubicación: `locations/123` (o solo el número).
 * Google publica estos datos con varios días de retraso; los días sin
 * valor no se guardan, no se rellenan con cero.
 */

import type { MetricPoint } from "@/core/integrations";

import {
  type FetchedReview,
  type IntegrationAdapter,
  asNumber,
  bearer,
  callJson,
  point,
  requireProperty,
} from "./adapter";

const PERFORMANCE_API = "https://businessprofileperformance.googleapis.com/v1";
const INFORMATION_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
// RN-INT-10 · las reseñas siguen viviendo en la API v4 de My Business:
// Google no las ha movido a las APIs nuevas, y la ruta exige la CUENTA
// además de la ubicación.
const REVIEWS_API = "https://mybusiness.googleapis.com/v4";

/** Cuántas trae cada sincronización. Las nuevas van primero. */
const REVIEWS_PAGE = 50;

/** Las cinco estrellas, tal como Google las nombra. */
const STAR_RATINGS: Readonly<Record<string, number>> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

interface ReviewsResponse {
  reviews?: {
    reviewId?: string;
    name?: string;
    starRating?: string;
    comment?: string;
    createTime?: string;
    updateTime?: string;
    reviewer?: { displayName?: string };
    reviewReply?: { comment?: string; updateTime?: string };
  }[];
}

/** Métrica de Google → (métrica de Cuotly, dimensión). Las impresiones suman además en `profile_impressions`. */
const DAILY_METRICS: readonly [string, string, string][] = [
  ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "impressions_by_surface", "maps_desktop"],
  ["BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "impressions_by_surface", "search_desktop"],
  ["BUSINESS_IMPRESSIONS_MOBILE_MAPS", "impressions_by_surface", "maps_mobile"],
  ["BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "impressions_by_surface", "search_mobile"],
  ["WEBSITE_CLICKS", "website_clicks", ""],
  ["CALL_CLICKS", "call_clicks", ""],
  ["BUSINESS_DIRECTION_REQUESTS", "direction_requests", ""],
  ["BUSINESS_CONVERSATIONS", "conversations", ""],
  ["BUSINESS_BOOKINGS", "bookings", ""],
];

interface DatedValue {
  date?: { year?: number; month?: number; day?: number };
  value?: string | number;
}

interface MultiDailyResponse {
  multiDailyMetricTimeSeries?: {
    dailyMetricTimeSeries?: { dailyMetric?: string; timeSeries?: { datedValues?: DatedValue[] } }[];
  }[];
}

export function locationName(propertyId: string): string {
  return `locations/${propertyId.trim().replace(/^locations\//, "")}`;
}

function dateParams(prefix: string, iso: string): Record<string, string> {
  const [y, m, d] = iso.split("-");
  return { [`${prefix}.year`]: y, [`${prefix}.month`]: String(Number(m)), [`${prefix}.day`]: String(Number(d)) };
}

function isoFromDate(date: DatedValue["date"]): string | null {
  if (!date || !date.year || !date.month || !date.day) return null;
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export const businessProfileAdapter: IntegrationAdapter = {
  provider: "business_profile",

  async check(ctx) {
    const location = locationName(requireProperty(ctx, "la ubicación de Business Profile"));
    const info = await callJson<{ title?: string }>(
      ctx,
      "Business Profile location",
      `${INFORMATION_API}/${location}?readMask=name,title`,
      { headers: bearer(ctx) },
    );
    return { accountLabel: typeof info.title === "string" && info.title ? info.title : null };
  },

  async sync(ctx) {
    const location = locationName(requireProperty(ctx, "la ubicación de Business Profile"));
    const params = new URLSearchParams({
      ...dateParams("dailyRange.startDate", ctx.window.from),
      ...dateParams("dailyRange.endDate", ctx.window.to),
    });
    for (const [metric] of DAILY_METRICS) params.append("dailyMetrics", metric);

    const response = await callJson<MultiDailyResponse>(
      ctx,
      "Business Profile fetchMultiDailyMetricsTimeSeries",
      `${PERFORMANCE_API}/${location}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`,
      { headers: bearer(ctx) },
    );

    const points: MetricPoint[] = [];
    const impresionesPorDia = new Map<string, number>();

    for (const grupo of response.multiDailyMetricTimeSeries ?? []) {
      for (const serie of grupo.dailyMetricTimeSeries ?? []) {
        const mapeo = DAILY_METRICS.find(([google]) => google === serie.dailyMetric);
        if (!mapeo) continue;
        const [, metric, dimension] = mapeo;
        for (const dated of serie.timeSeries?.datedValues ?? []) {
          const day = isoFromDate(dated.date);
          const value = asNumber(dated.value);
          if (day === null || value === null) continue;
          points.push(point(metric, day, value, dimension));
          if (metric === "impressions_by_surface") {
            impresionesPorDia.set(day, (impresionesPorDia.get(day) ?? 0) + value);
          }
        }
      }
    }

    for (const [day, total] of impresionesPorDia) {
      points.push(point("profile_impressions", day, total));
    }

    // RN-INT-10 · las reseñas, solo si el plan las vigila. Si no, ni se
    // piden: es un trabajo que no se está haciendo, no un dato que se
    // esconda.
    if (ctx.watchesReviews !== true) {
      return { points, accountLabel: null, reviewsUnavailable: "not_requested" };
    }

    // La API de reseñas necesita `accounts/A/locations/L`. Una conexión
    // que solo guardó `locations/L` **no se completa a ojo**: inventarse
    // una cuenta sería adivinar de quién es la ficha. Se dice, y la
    // pantalla explica que hay que volver a conectar eligiendo la cuenta.
    const propiedad = requireProperty(ctx, "la ubicación de Business Profile");
    if (!/accounts\/[^/]+\/locations\/[^/]+/.test(propiedad)) {
      return { points, accountLabel: null, reviewsUnavailable: "needs_account" };
    }

    const respuesta = await callJson<ReviewsResponse>(
      ctx,
      "Business Profile reviews",
      `${REVIEWS_API}/${propiedad}/reviews?pageSize=${REVIEWS_PAGE}&orderBy=updateTime%20desc`,
      { headers: bearer(ctx) },
    );

    const reviews: FetchedReview[] = [];
    for (const fila of respuesta.reviews ?? []) {
      const externalId = fila.reviewId ?? fila.name;
      const rating = fila.starRating ? STAR_RATINGS[fila.starRating] : undefined;
      // Sin identificador o sin estrellas no es una reseña que se pueda
      // guardar: se salta, no se inventa un 0 ni un id.
      if (!externalId || rating === undefined || !fila.createTime) continue;
      reviews.push({
        externalId,
        rating,
        // Google deja puntuar sin escribir: el comentario puede no existir
        // y eso NO se rellena con nada (CLAUDE.md).
        comment: fila.comment?.trim() || null,
        authorName: fila.reviewer?.displayName?.trim() || null,
        reviewedAt: fila.createTime,
        replyComment: fila.reviewReply?.comment?.trim() || null,
        repliedAt: fila.reviewReply?.updateTime ?? null,
      });
    }

    return { points, accountLabel: null, reviews };
  },
};
