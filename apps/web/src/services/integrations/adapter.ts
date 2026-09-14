/**
 * `src/services/integrations/adapter.ts` — lo que tienen en común los
 * cinco adaptadores (RN-INT-01, RN-INT-08; Fase 3, Hito 14).
 *
 * Un adaptador sabe dos cosas de su fuente: **comprobar** la credencial
 * sin importar datos (el botón de §116) y **sincronizar** una ventana de
 * fechas devolviendo puntos de métrica con la clave natural que
 * `finish_integration_run()` espera. No sabe nada de la base de datos ni
 * de la bóveda: recibe el secreto ya descifrado —el token de acceso de
 * Google o la clave API— y un `fetch` inyectable para poder probarse
 * entero sin red.
 *
 * Lo que sí decide aquí, y para los cinco igual, es **por qué** falló una
 * llamada (RN-INT-08): 401 y 403 son de autorización (hace falta una
 * persona), 404 y 400 son de configuración (la propiedad ya no existe o
 * se dio mal), 429 y 5xx y los cortes de red son transitorios (Cuotly
 * reintenta sola). Es lo que `finish_integration_run()` convierte en
 * "Requiere atención" o "Error".
 */

import type { IntegrationProvider, MetricPoint, SyncFailureKind, SyncWindow } from "@/core/integrations";

export interface AdapterContext {
  readonly provider: IntegrationProvider;
  /** El token de acceso de Google (OAuth) o la clave API, ya descifrados. */
  readonly secret: string;
  /** `integrations.external_property_id`: la propiedad, el sitio, la ubicación o la URL. */
  readonly propertyId: string | null;
  readonly window: SyncWindow;
  /** Hoy en la zona del espacio, `YYYY-MM-DD`: el día de una medición puntual. */
  readonly today: string;
  readonly fetchImpl: typeof fetch;
}

export interface CheckResult {
  /** Un nombre para reconocer la cuenta o la propiedad, si la fuente lo da. Nunca una credencial. */
  readonly accountLabel: string | null;
}

export interface SyncResult {
  readonly points: readonly MetricPoint[];
  readonly accountLabel: string | null;
}

export interface IntegrationAdapter {
  readonly provider: IntegrationProvider;
  check(ctx: AdapterContext): Promise<CheckResult>;
  sync(ctx: AdapterContext): Promise<SyncResult>;
}

export class AdapterFailure extends Error {
  constructor(
    message: string,
    readonly failureKind: SyncFailureKind,
  ) {
    super(message);
    this.name = "AdapterFailure";
  }
}

export function classifyHttpStatus(status: number): SyncFailureKind {
  if (status === 401 || status === 403) return "authorization";
  if (status === 429 || status >= 500) return "transient";
  return "configuration";
}

/** Cuánto de la respuesta de error se conserva para el motivo: una frase, no la respuesta entera (RN-INT-08). */
const ERROR_BODY_MAX = 200;

/**
 * Una llamada JSON a la fuente, con el error ya clasificado. El texto del
 * error se recorta aquí y el proceso lo pasa además por el filtro de
 * secretos antes de guardarlo.
 */
export async function callJson<T>(
  ctx: Pick<AdapterContext, "fetchImpl">,
  what: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await ctx.fetchImpl(url, init);
  } catch (error) {
    throw new AdapterFailure(
      `${what}: sin respuesta (${error instanceof Error ? error.message : String(error)})`,
      "transient",
    );
  }
  if (!response.ok) {
    const body = (await response.text().catch(() => "")).replace(/\s+/g, " ").trim();
    throw new AdapterFailure(
      `${what}: HTTP ${response.status}${body ? ` ${body.slice(0, ERROR_BODY_MAX)}` : ""}`,
      classifyHttpStatus(response.status),
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new AdapterFailure(`${what}: la respuesta no es JSON`, "transient");
  }
}

export function bearer(ctx: Pick<AdapterContext, "secret">): Record<string, string> {
  return { Authorization: `Bearer ${ctx.secret}` };
}

export function requireProperty(ctx: AdapterContext, what: string): string {
  const value = ctx.propertyId?.trim() ?? "";
  if (!value) {
    throw new AdapterFailure(`Falta ${what} en la integración: hay que volver a conectarla indicándolo`, "configuration");
  }
  return value;
}

/** Un número que puede llegar como texto ("12") o no llegar; lo que no es número se salta. */
export function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** `YYYYMMDD` (GA4) o `YYYY-MM-DD` a `YYYY-MM-DD`. */
export function isoDay(value: string): string | null {
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function point(
  metric: string,
  day: string,
  value: number,
  dimension = "",
  unit: string | null = null,
): MetricPoint {
  return { metric, dimension, period_start: day, period_end: day, value, unit };
}

/**
 * De un desglose por día (página, fuente, búsqueda…) se guardan los N
 * mayores de cada día: es lo que "páginas más visitadas" o "búsquedas
 * principales" significan (§92), y lo que evita guardar miles de filas de
 * cola larga por restaurante y día.
 */
export const TOP_PER_DAY = 10;

export function topPerDay(points: readonly MetricPoint[], limit = TOP_PER_DAY): MetricPoint[] {
  const porDia = new Map<string, MetricPoint[]>();
  for (const p of points) {
    const lista = porDia.get(p.period_start) ?? [];
    lista.push(p);
    porDia.set(p.period_start, lista);
  }
  const out: MetricPoint[] = [];
  for (const lista of porDia.values()) {
    out.push(...[...lista].sort((a, b) => b.value - a.value).slice(0, limit));
  }
  return out;
}
