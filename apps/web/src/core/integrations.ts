/**
 * `src/core/integrations.ts` — integraciones analíticas (PRD §27, RN-INT;
 * §115 a §122, §126, §94, §163 y §178 de la maestra; Fase 3, Hito 13).
 * Lógica de dominio pura, sin Supabase ni React ni red (CLAUDE.md).
 *
 * La autoridad es la migración 81: los estados son el CHECK de
 * `integrations.status`, las frecuencias y la espera entre reintentos son
 * `integration_sync_frequency()` e `integration_retry_delay()`, y qué es
 * "desactualizado" lo decide `integration_data_is_stale()`. Este archivo
 * es la misma cuenta, probable sin Postgres, para que la pantalla del Hito
 * 14 y el proceso de sincronización (`src/services/integration-sync.ts`)
 * digan lo mismo que el servidor. `listas-compartidas.test.ts` vigila que
 * las listas no se separen en silencio.
 *
 * Nada de aquí es un control de acceso: quién puede conectar lo vuelve a
 * comprobar el servidor (`assert_can_manage_integrations()`,
 * `store_integration_credential()`). Lo que hay aquí es lo que la pantalla
 * usa para decir por qué no se puede antes de que el botón conteste con un
 * error.
 */

/** RN-INT-01 · las cinco fuentes de §115, en su orden. */
export const INTEGRATION_PROVIDERS = [
  "ga4",
  "search_console",
  "business_profile",
  "clarity",
  "pagespeed",
] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export function isIntegrationProvider(value: string): value is IntegrationProvider {
  return (INTEGRATION_PROVIDERS as readonly string[]).includes(value);
}

/** RN-INT-03 · los siete estados de §117, en su orden. */
export const INTEGRATION_STATES = [
  "not_connected",
  "pending_authorization",
  "connected",
  "syncing",
  "needs_attention",
  "error",
  "disconnected",
] as const;
export type IntegrationState = (typeof INTEGRATION_STATES)[number];

export function isIntegrationState(value: string): value is IntegrationState {
  return (INTEGRATION_STATES as readonly string[]).includes(value);
}

/** RN-INT-02 · OAuth cuando exista, clave solo cuando sea necesaria. */
export type IntegrationAuthKind = "oauth" | "api_key";

export function integrationAuthKind(provider: IntegrationProvider): IntegrationAuthKind {
  switch (provider) {
    case "ga4":
    case "search_console":
    case "business_profile":
      return "oauth";
    case "clarity":
    case "pagespeed":
      return "api_key";
  }
}

/** Lo que la base guarda en `integration_credentials.kind` para cada forma de conectar. */
export function credentialKindFor(authKind: IntegrationAuthKind): "oauth_refresh_token" | "api_key" {
  return authKind === "oauth" ? "oauth_refresh_token" : "api_key";
}

/** RN-INT-04 · §118: GA4 y Search Console a diario, PageSpeed semanal; las demás, a diario (decisión 24). */
export type SyncFrequency = "daily" | "weekly";

export function integrationSyncFrequency(provider: IntegrationProvider): SyncFrequency {
  return provider === "pagespeed" ? "weekly" : "daily";
}

export const FREQUENCY_HOURS: Readonly<Record<SyncFrequency, number>> = {
  daily: 24,
  weekly: 24 * 7,
};

const HOUR_MS = 60 * 60 * 1000;

/** RN-INT-04 · cuándo toca la siguiente pasada tras una correcta. */
export function nextAttemptAfterSuccess(provider: IntegrationProvider, finishedAt: Date): Date {
  return new Date(finishedAt.getTime() + FREQUENCY_HOURS[integrationSyncFrequency(provider)] * HOUR_MS);
}

/**
 * RN-INT-04 · "reintenta": 1 h, 4 h, 16 h y 24 h como máximo, según
 * cuántos fallos seguidos lleva. La misma cuenta que
 * `integration_retry_delay()`.
 */
export function retryDelayHours(consecutiveFailures: number): number {
  const n = Math.max(1, Math.floor(consecutiveFailures));
  return Math.min(24, 4 ** (n - 1));
}

export function nextAttemptAfterFailure(consecutiveFailures: number, now: Date): Date {
  return new Date(now.getTime() + retryDelayHours(consecutiveFailures) * HOUR_MS);
}

/**
 * RN-INT-07 / §94 · "nunca se presenta información desactualizada como
 * actual". Tres respuestas y no dos, porque §178 distingue "todavía no hay
 * datos" de "última sincronización": una fuente que nunca sincronizó bien
 * no tiene un dato viejo, no tiene ninguno.
 */
export type DataFreshness = "never" | "fresh" | "stale";

export function dataFreshness(
  provider: IntegrationProvider,
  lastSuccessAt: Date | null,
  now: Date,
): DataFreshness {
  if (lastSuccessAt === null) return "never";
  const limit = 2 * FREQUENCY_HOURS[integrationSyncFrequency(provider)] * HOUR_MS;
  return now.getTime() - lastSuccessAt.getTime() > limit ? "stale" : "fresh";
}

/** RN-INT-08 · por qué falló una ejecución, que es lo que decide el estado siguiente. */
export const SYNC_FAILURE_KINDS = ["transient", "authorization", "configuration"] as const;
export type SyncFailureKind = (typeof SYNC_FAILURE_KINDS)[number];

export type SyncOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly failureKind: SyncFailureKind };

/**
 * RN-INT-03/04 · el estado en que queda la integración según el resultado
 * de una sincronización: la misma regla que `finish_integration_run()`.
 * Una desconectada mientras corría no cambia: se guarda lo importado y se
 * queda desconectada.
 */
export function stateAfterSync(current: IntegrationState, outcome: SyncOutcome): IntegrationState {
  if (current === "disconnected") return current;
  if (outcome.ok) return "connected";
  return outcome.failureKind === "transient" ? "error" : "needs_attention";
}

/** Un fallo de autorización o de configuración no se reintenta solo: espera a una persona (§117). */
export function retriesAutomatically(failureKind: SyncFailureKind): boolean {
  return failureKind === "transient";
}

/**
 * RN-INT-04 · a quién se avisa de un fallo: al propietario y a los
 * administradores del espacio, una vez por racha; y al propietario del
 * restaurante solo si debe autorizar de nuevo (§118). Un trabajador,
 * nunca (RN-NOT-01).
 */
export type IntegrationNotificationEvent =
  | "integration_sync_failed"
  | "integration_reauthorization_required";

export function failureNotification(
  failureKind: SyncFailureKind,
  consecutiveFailures: number,
): IntegrationNotificationEvent | null {
  if (failureKind === "authorization") return "integration_reauthorization_required";
  if (failureKind === "configuration") return "integration_sync_failed";
  return consecutiveFailures === 1 ? "integration_sync_failed" : null;
}

export function failureNotifiesClientOwners(event: IntegrationNotificationEvent): boolean {
  return event === "integration_reauthorization_required";
}

/**
 * RN-INT-09 · la ventana de una sincronización: hasta ayer (hoy está a
 * medias), desde tres días antes del último éxito para recoger las
 * revisiones tardías, y 90 días hacia atrás la primera vez (pendiente
 * 13). La misma cuenta que `claim_integration_runs()`; las fechas son
 * días de calendario en la zona del espacio, que aquí ya llegan resueltos.
 */
export const INITIAL_BACKFILL_DAYS = 90;
export const RESYNC_OVERLAP_DAYS = 3;

export interface SyncWindow {
  readonly from: string;
  readonly to: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): Date {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function syncWindow(todayIso: string, lastSuccessIso: string | null): SyncWindow {
  const to = addDays(todayIso, -1);
  const floor = addDays(todayIso, -INITIAL_BACKFILL_DAYS);
  const fromCandidate = lastSuccessIso === null ? floor : addDays(lastSuccessIso, -RESYNC_OVERLAP_DAYS);
  const from = fromCandidate > floor ? fromCandidate : floor;
  return { from: isoDate(from), to: isoDate(to) };
}

/**
 * RN-INT-05 · quién puede qué, dicho para la pantalla. El servidor lo
 * vuelve a comprobar; esto decide qué botones tiene sentido enseñar.
 */
export type IntegrationActor =
  | { readonly kind: "staff"; readonly role: "owner" | "admin" | "worker" }
  | { readonly kind: "client"; readonly role: "global_owner" | "local_owner" | "editor" | "consulta" };

/** Empezar, cancelar, comprobar y desconectar: `manage_clients` o el propietario del restaurante. */
export function canManageConnections(actor: IntegrationActor): boolean {
  if (actor.kind === "staff") return actor.role === "owner" || actor.role === "admin";
  return actor.role === "global_owner" || actor.role === "local_owner";
}

/**
 * Guardar la credencial: una clave API, solo el propietario del espacio
 * (§126); una autorización OAuth, el propietario del espacio o el del
 * restaurante ("puede autorizar una cuenta que le pertenezca", §116).
 */
export function canProvideCredential(actor: IntegrationActor, authKind: IntegrationAuthKind): boolean {
  if (actor.kind === "staff") return actor.role === "owner";
  if (authKind === "api_key") return false;
  return actor.role === "global_owner" || actor.role === "local_owner";
}

/** §119: los trabajadores nunca ven credenciales; tampoco el restaurante. Solo el propietario ve que existen. */
export function canSeeCredentialMetadata(actor: IntegrationActor): boolean {
  return actor.kind === "staff" && actor.role === "owner";
}

/** RN-INT-02 · la comprobación existe para una integración que llegó a conectarse. */
export function canRequestCheck(state: IntegrationState): boolean {
  return state === "connected" || state === "error" || state === "needs_attention";
}

/** Una autorización a medias se cancela; una conectada se desconecta. */
export function canCancelConnection(state: IntegrationState): boolean {
  return state === "pending_authorization";
}

export function canDisconnect(state: IntegrationState): boolean {
  return state !== "not_connected" && state !== "disconnected" && state !== "pending_authorization";
}

/**
 * RN-INT-08 / §163 · "registrar error sin secretos". Antes de guardar el
 * texto de un error de la fuente se tapa lo que parezca un token o una
 * clave, y se recorta: un mensaje de error no necesita 4 KB de respuesta.
 * La base vuelve a recortar a 500 por si acaso; el filtro solo puede
 * estar aquí, porque SQL no sabe qué es un token.
 */
export const SYNC_ERROR_MAX_LENGTH = 500;
const REDACTED = "[oculto]";

const SECRET_PATTERNS: readonly RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/g, // cabeceras de autorización
  /ya29\.[A-Za-z0-9._-]+/g, // tokens de acceso de Google
  /1\/\/[A-Za-z0-9._-]+/g, // tokens de refresco de Google
  /AIza[0-9A-Za-z_-]{20,}/g, // claves de API de Google
  /([?&](?:key|token|access_token|refresh_token|api_key|client_secret)=)[^&\s]+/gi, // parámetros de URL
  /("?(?:access_token|refresh_token|api_key|client_secret|id_token)"?\s*[:=]\s*"?)[A-Za-z0-9._~+/=-]+/gi, // JSON o pares clave=valor
];

export function sanitizeSyncError(message: string): string {
  let out = message;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match, prefix?: string) =>
      typeof prefix === "string" && match.startsWith(prefix) ? `${prefix}${REDACTED}` : REDACTED,
    );
  }
  out = out.replace(/\s+/g, " ").trim();
  return out.length > SYNC_ERROR_MAX_LENGTH ? out.slice(0, SYNC_ERROR_MAX_LENGTH) : out;
}

/**
 * §92 · las métricas que guarda cada fuente. Para GA4 y Search Console las
 * nombra la maestra; para Business Profile, Clarity y PageSpeed solo
 * nombra la fuente, así que su catálogo lo fija el adaptador de cada una
 * (Hito 14) y es lo que aquí se enumera: lo que la API de cada fuente da
 * sin inventar nada por encima. El nombre de la métrica lleva el desglose
 * (`_by_source`) y la columna `dimension` de `metric_points` lleva el
 * valor del desglose. `adapters.test.ts` comprueba que cada adaptador
 * escribe solo métricas de su lista, y el proceso (`integration-sync.ts`)
 * descarta y cuenta las que no lo sean antes de guardarlas.
 */
export const METRICS_BY_PROVIDER: Readonly<Record<IntegrationProvider, readonly string[]>> = {
  ga4: [
    "users",
    "sessions",
    "page_views_by_page",
    "sessions_by_source",
    "sessions_by_device",
    "sessions_by_location",
    "conversions_by_event",
    // Decisión 26 · las conversiones POR DISPOSITIVO, que es lo que falta
    // para saber si el móvil convierte peor que el escritorio. Con
    // `conversions_by_event` sola no se puede: no está cruzada.
    "conversions_by_device",
  ],
  search_console: [
    "clicks",
    "impressions",
    "ctr",
    "position",
    "clicks_by_query",
    "clicks_by_page",
    // Hito 15 · las mismas tres cifras que arriba pero POR CONSULTA, que
    // es como la decisión 26 escribe tres de sus nueve reglas ("una
    // consulta con 100 impresiones o más…"). Con `clicks_by_query` sola
    // no se pueden: guarda los clics de las diez consultas con más
    // clics, y lo que estas reglas buscan es la consulta que tiene
    // impresiones y NO tiene clics. Las tres salen de la misma respuesta
    // de la API que ya se pedía (`date`, `query`), sin llamada nueva.
    "impressions_by_query",
    "ctr_by_query",
    "position_by_query",
  ],
  // Business Profile Performance API: las impresiones por superficie
  // (Maps y Búsqueda, escritorio y móvil) y las acciones sobre la ficha.
  business_profile: [
    "profile_impressions",
    "impressions_by_surface",
    "website_clicks",
    "call_clicks",
    "direction_requests",
    "conversations",
    "bookings",
  ],
  // Clarity Data Export API: tráfico, comportamiento y las señales de
  // fricción (clics muertos, clics de rabia, vueltas rápidas).
  clarity: [
    "sessions",
    "bot_sessions",
    "distinct_users",
    "pages_per_session",
    "scroll_depth",
    "engagement_time_seconds",
    "dead_clicks",
    "rage_clicks",
    "quick_backs",
    "excessive_scroll",
    "script_errors",
    "error_clicks",
  ],
  // PageSpeed Insights: la puntuación de rendimiento y las métricas de
  // laboratorio, por estrategia (móvil o escritorio); INP solo llega
  // cuando Chrome tiene datos de campo de esa URL.
  pagespeed: [
    "performance_score_by_strategy",
    "lcp_ms_by_strategy",
    "cls_by_strategy",
    "tbt_ms_by_strategy",
    "fcp_ms_by_strategy",
    "speed_index_ms_by_strategy",
    "inp_ms_by_strategy",
    // Decisión 26 · los kilobytes que Lighthouse dice que se ahorrarían
    // recomprimiendo (`uses-optimized-images`) y sirviendo las imágenes a
    // su tamaño (`uses-responsive-images`). Sin esto, "imágenes pesadas"
    // no se puede detectar: la puntuación sola no dice de qué es la culpa.
    "optimized_images_savings_kb_by_strategy",
    "responsive_images_savings_kb_by_strategy",
  ],
};

export function isMetricOf(provider: IntegrationProvider, metric: string): boolean {
  return METRICS_BY_PROVIDER[provider].includes(metric);
}

/**
 * Un punto de métrica tal como lo escribe un adaptador y lo guarda
 * `finish_integration_run()`: por clave natural (métrica, dimensión y
 * periodo), sin identificadores de la base.
 */
export interface MetricPoint {
  readonly metric: string;
  readonly dimension: string;
  readonly period_start: string;
  readonly period_end: string;
  readonly value: number;
  readonly unit: string | null;
}

// ---------------------------------------------------------------------
// §178 / RN-INT-07 · el resumen de "Informes y datos"
// ---------------------------------------------------------------------

/**
 * La ventana del resumen: los 28 últimos días completos (hasta ayer),
 * que es lo que enseñan las propias fuentes por defecto. No es un
 * informe (§89 a §95, Hito 16): es la comprobación de que la integración
 * trae datos y de qué antigüedad son.
 */
export const SUMMARY_WINDOW_DAYS = 28;

/**
 * Cuántos días de la ventana hacen falta para dar una cifra. La maestra
 * dice "periodo insuficiente" (§178) y no dice cuánto es suficiente:
 * aquí se lee como una semana de datos para una fuente diaria y una sola
 * medición para una semanal. Es una lectura aplicada y está anotada como
 * decisión 25a en `docs/DECISIONES.md`, confirmada por Bosco el 14/09/2026.
 */
export function minimumCoveredDays(provider: IntegrationProvider): number {
  return integrationSyncFrequency(provider) === "weekly" ? 1 : 7;
}

export type SummaryAggregate = "sum" | "mean" | "latest";

export interface HeadlineMetric {
  readonly metric: string;
  readonly aggregate: SummaryAggregate;
}

/** Lo que el resumen enseña de cada fuente: pocas cifras y las de la maestra. */
export const HEADLINE_METRICS: Readonly<Record<IntegrationProvider, readonly HeadlineMetric[]>> = {
  ga4: [
    { metric: "users", aggregate: "sum" },
    { metric: "sessions", aggregate: "sum" },
  ],
  search_console: [
    { metric: "clicks", aggregate: "sum" },
    { metric: "impressions", aggregate: "sum" },
    { metric: "position", aggregate: "mean" },
  ],
  business_profile: [
    { metric: "profile_impressions", aggregate: "sum" },
    { metric: "website_clicks", aggregate: "sum" },
    { metric: "call_clicks", aggregate: "sum" },
    { metric: "direction_requests", aggregate: "sum" },
  ],
  clarity: [
    { metric: "sessions", aggregate: "sum" },
    { metric: "dead_clicks", aggregate: "sum" },
    { metric: "rage_clicks", aggregate: "sum" },
  ],
  pagespeed: [{ metric: "performance_score_by_strategy", aggregate: "latest" }],
};

export function summaryWindow(todayIso: string): SyncWindow {
  return {
    from: isoDate(addDays(todayIso, -SUMMARY_WINDOW_DAYS)),
    to: isoDate(addDays(todayIso, -1)),
  };
}

/** Los puntos de un total (sin dimensión) que caen dentro de la ventana. */
function inWindow(points: readonly MetricPoint[], metric: string, window: SyncWindow): MetricPoint[] {
  return points.filter(
    (p) => p.metric === metric && p.period_start >= window.from && p.period_end <= window.to,
  );
}

/** Cuántos días distintos de la ventana tienen algún punto de la métrica. */
export function coveredDays(points: readonly MetricPoint[], metric: string, window: SyncWindow): number {
  return new Set(inWindow(points, metric, window).map((p) => p.period_start)).size;
}

export interface HeadlineValue {
  readonly metric: string;
  readonly aggregate: SummaryAggregate;
  /** `null` cuando no hay ningún punto en la ventana. */
  readonly value: number | null;
  /** Solo para `latest`: el desglose de cada valor (la estrategia de PageSpeed). */
  readonly byDimension: readonly { readonly dimension: string; readonly value: number }[];
  readonly coveredDays: number;
  /** El último día con dato, para decir "datos hasta". */
  readonly lastPeriodEnd: string | null;
}

export function headlineValue(
  points: readonly MetricPoint[],
  headline: HeadlineMetric,
  window: SyncWindow,
): HeadlineValue {
  const dentro = inWindow(points, headline.metric, window);
  const days = new Set(dentro.map((p) => p.period_start)).size;
  const lastPeriodEnd = dentro.reduce<string | null>(
    (max, p) => (max === null || p.period_end > max ? p.period_end : max),
    null,
  );

  if (headline.aggregate === "latest") {
    const porDimension = new Map<string, MetricPoint>();
    for (const p of dentro) {
      const actual = porDimension.get(p.dimension);
      if (actual === undefined || p.period_end > actual.period_end) porDimension.set(p.dimension, p);
    }
    const byDimension = [...porDimension.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dimension, p]) => ({ dimension, value: p.value }));
    return {
      metric: headline.metric,
      aggregate: headline.aggregate,
      value: byDimension.length === 0 ? null : byDimension[0].value,
      byDimension,
      coveredDays: days,
      lastPeriodEnd,
    };
  }

  const totales = dentro.filter((p) => p.dimension === "");
  if (totales.length === 0) {
    return { metric: headline.metric, aggregate: headline.aggregate, value: null, byDimension: [], coveredDays: days, lastPeriodEnd };
  }
  const suma = totales.reduce((acc, p) => acc + p.value, 0);
  const value = headline.aggregate === "sum" ? suma : suma / totales.length;
  return { metric: headline.metric, aggregate: headline.aggregate, value, byDimension: [], coveredDays: days, lastPeriodEnd };
}

export type SummaryReason = NoDataReason | "insufficient_period";

/**
 * §178 · los cinco motivos, en el orden en que se deciden: los cuatro de
 * `noDataReason()` y, con dato actual pero poco, "periodo insuficiente".
 * `null` es "hay cifra y es actual".
 */
export function summaryReason(
  provider: IntegrationProvider,
  state: IntegrationState,
  lastSuccessAt: Date | null,
  now: Date,
  covered: number,
): SummaryReason | null {
  const base = noDataReason(provider, state, lastSuccessAt, now);
  if (base !== null) return base;
  return covered < minimumCoveredDays(provider) ? "insufficient_period" : null;
}

/** El tono de la insignia de una integración, uno por estado (CA-21, §21.4: estado con texto e icono, no solo color). */
export function integrationTone(state: IntegrationState): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (state) {
    case "connected":
      return "success";
    case "syncing":
      return "info";
    case "pending_authorization":
    case "needs_attention":
      return "warning";
    case "error":
      return "danger";
    case "not_connected":
    case "disconnected":
      return "neutral";
  }
}

/**
 * §178 · el motivo que se dice cuando no hay dato, en el orden en que se
 * decide: no conectada; conectada pero sin ninguna pasada correcta; un
 * fallo vigente; el dato existe pero es viejo. `null` es "hay dato y es
 * actual". "Periodo insuficiente" no se decide aquí: depende de lo que la
 * pantalla quiera calcular sobre los puntos.
 */
export type NoDataReason = "not_connected" | "no_data_yet" | "error" | "stale";

export function noDataReason(
  provider: IntegrationProvider,
  state: IntegrationState,
  lastSuccessAt: Date | null,
  now: Date,
): NoDataReason | null {
  if (state === "not_connected" || state === "pending_authorization") return "not_connected";
  const freshness = dataFreshness(provider, lastSuccessAt, now);
  if (freshness === "never") return state === "error" || state === "needs_attention" ? "error" : "no_data_yet";
  if (state === "error" || state === "needs_attention") return "error";
  return freshness === "stale" ? "stale" : null;
}

// ---------------------------------------------------------------------
// Las secciones de "Informes y datos" (maquetas 09 a 12 y las seis vistas
// "sin datos" del PDF de Restaurantes)
// ---------------------------------------------------------------------

/**
 * Las seis secciones que el diseño pone bajo "Informes y datos", en su
 * orden: Resumen · Analítica · Búsqueda · Comportamiento · Rendimiento ·
 * Oportunidades. Cada una es de una o dos fuentes; el Resumen las enseña
 * todas (la tabla "Estado de las fuentes") y Oportunidades no tiene fuente
 * porque es el Hito 15, bloqueado por CLAUDE.md hasta que Bosco fije los
 * umbrales.
 *
 * Business Profile va con Búsqueda y no con Rendimiento: la maqueta 11 lo
 * pinta debajo de PageSpeed por sitio, pero lo que enseña es "Visibilidad"
 * —cuántas veces apareció la ficha en Google y qué hizo quien la vio—, que
 * es lo mismo que mide Search Console para la web ("Visibilidad de tu web
 * en Google", vista sin datos 3/6). Rendimiento es "velocidad y experiencia
 * de uso de tu web" (vista 5/6), y ahí la ficha de Google no pinta nada.
 */
export const DATA_SECTIONS = [
  "summary",
  "analytics",
  "search",
  "behavior",
  "performance",
  "opportunities",
] as const;
export type DataSection = (typeof DATA_SECTIONS)[number];

export const DATA_SECTION_PROVIDERS: Readonly<Record<DataSection, readonly IntegrationProvider[]>> = {
  summary: INTEGRATION_PROVIDERS,
  analytics: ["ga4"],
  search: ["search_console", "business_profile"],
  behavior: ["clarity"],
  performance: ["pagespeed"],
  opportunities: [],
};

/**
 * La ventana anterior a una dada, del mismo tamaño y pegada a ella: es
 * contra lo que se dice "variación" (maquetas 10, 11 y 22.02 escriben "vs.
 * mes anterior"; aquí la ventana son 28 días, así que es "frente a los 28
 * días anteriores", y se dice así).
 */
export function previousWindow(window: SyncWindow): SyncWindow {
  const from = new Date(`${window.from}T00:00:00Z`);
  const to = new Date(`${window.to}T00:00:00Z`);
  const days = Math.round((to.getTime() - from.getTime()) / (24 * HOUR_MS)) + 1;
  return {
    from: isoDate(addDays(window.from, -days)),
    to: isoDate(addDays(window.from, -1)),
  };
}

/**
 * La variación en tanto por ciento entre dos cifras. `null` cuando no se
 * puede decir: sin cifra actual, sin cifra anterior o con la anterior a
 * cero (una subida "infinita" no es un dato, es una división). La pantalla
 * enseña entonces "sin periodo anterior", no un guion ni un 0 %.
 */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export interface DailyPoint {
  readonly day: string;
  readonly value: number;
}

/**
 * La serie diaria de un total (sin desglose) dentro de la ventana, en
 * orden de fecha. Solo los días con dato: un día sin punto no es un cero,
 * es un hueco, y la gráfica lo deja como hueco (RN-INT-07: nunca un dato
 * de relleno).
 */
export function dailySeries(points: readonly MetricPoint[], metric: string, window: SyncWindow): DailyPoint[] {
  return inWindow(points, metric, window)
    .filter((p) => p.dimension === "")
    .map((p) => ({ day: p.period_start, value: p.value }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export interface DimensionTotal {
  readonly dimension: string;
  readonly value: number;
}

/**
 * Los desgloses mayores de la ventana: la suma (o la media) de cada valor
 * de `dimension` a lo largo de los días, ordenada de mayor a menor y
 * recortada. Es lo que "páginas más visitadas", "búsquedas principales" y
 * "dispositivos" significan en §92 sobre lo que el adaptador guardó (los
 * diez mayores de cada día, decisión 25f).
 */
export function topDimensions(
  points: readonly MetricPoint[],
  metric: string,
  window: SyncWindow,
  limit: number,
  aggregate: "sum" | "mean" = "sum",
): DimensionTotal[] {
  const sumas = new Map<string, { total: number; n: number }>();
  for (const p of inWindow(points, metric, window)) {
    if (p.dimension === "") continue;
    const actual = sumas.get(p.dimension) ?? { total: 0, n: 0 };
    sumas.set(p.dimension, { total: actual.total + p.value, n: actual.n + 1 });
  }
  return [...sumas.entries()]
    .map(([dimension, { total, n }]) => ({ dimension, value: aggregate === "sum" ? total : total / n }))
    .sort((a, b) => b.value - a.value || a.dimension.localeCompare(b.dimension))
    .slice(0, limit);
}

/**
 * La última medición de cada desglose dentro de la ventana, con su día:
 * las métricas de PageSpeed por estrategia (móvil y escritorio). La misma
 * cuenta que `headlineValue()` con `latest`, pero con la fecha, que la
 * maqueta 11 escribe ("Datos del 10 sept 2026").
 */
export interface LatestMeasurement {
  readonly dimension: string;
  readonly value: number;
  readonly day: string;
}

export function latestByDimension(
  points: readonly MetricPoint[],
  metric: string,
  window: SyncWindow,
): LatestMeasurement[] {
  const porDimension = new Map<string, MetricPoint>();
  for (const p of inWindow(points, metric, window)) {
    const actual = porDimension.get(p.dimension);
    if (actual === undefined || p.period_end > actual.period_end) porDimension.set(p.dimension, p);
  }
  return [...porDimension.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dimension, p]) => ({ dimension, value: p.value, day: p.period_end }));
}
