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
 * §92 · las métricas que nombra la maestra para las dos fuentes de las que
 * habla. Para Business Profile, Clarity y PageSpeed solo nombra la fuente:
 * su catálogo se fija con el adaptador (Hito 14) y no se adelanta aquí.
 * El nombre de la métrica lleva el desglose (`_by_source`) y la columna
 * `dimension` de `metric_points` lleva el valor del desglose.
 */
export const METRICS_BY_PROVIDER: Readonly<Partial<Record<IntegrationProvider, readonly string[]>>> = {
  ga4: [
    "users",
    "sessions",
    "page_views_by_page",
    "sessions_by_source",
    "sessions_by_device",
    "sessions_by_location",
    "conversions_by_event",
  ],
  search_console: [
    "clicks",
    "impressions",
    "ctr",
    "position",
    "clicks_by_query",
    "clicks_by_page",
  ],
};

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
