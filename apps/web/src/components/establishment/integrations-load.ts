import type { SupabaseClient } from "@supabase/supabase-js";

import {
  HEADLINE_METRICS,
  type IntegrationActor,
  type IntegrationAuthKind,
  type IntegrationProvider,
  type IntegrationState,
  type MetricPoint,
  type SummaryReason,
  type SyncFailureKind,
  type SyncWindow,
  coveredDays,
  isIntegrationProvider,
  isIntegrationState,
  previousWindow,
  summaryReason,
  summaryWindow,
} from "@/core/integrations";
import { es } from "@/i18n/es";
import type { Database } from "@/lib/supabase/database.types";
import { vaultIsConfigured } from "@/services/credential-vault";
import { googleOAuthIsConfigured } from "@/services/google-oauth";

/**
 * Lo que las pantallas de integraciones leen (Fase 3, Hito 14): el bloque
 * de la ficha (maqueta 17), la tarjeta del restaurante, el resumen de
 * "Informes y datos" y la sección de Ajustes.
 *
 * Todo sale de `establishment_integrations()` y de `metric_points`, que
 * ya vienen filtrados por RLS y por `can_read_establishment()`: esta capa
 * no comprueba permisos, los traduce a lo que la pantalla pinta. Los
 * metadatos de las credenciales (§126, "solo el propietario ve que
 * existen") los da la política de `integration_credentials`: a quien no
 * puede, la consulta le devuelve cero filas y aquí no se enseña nada.
 */
type Client = SupabaseClient<Database>;

export type IntegrationFlash = keyof typeof es.integrations.flash;

export interface CredentialMeta {
  readonly kind: "oauth_refresh_token" | "api_key";
  readonly keyVersion: number;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly status: "active" | "replaced" | "revoked";
}

export interface IntegrationRow {
  readonly provider: IntegrationProvider;
  readonly integrationId: string | null;
  readonly status: IntegrationState;
  readonly authKind: IntegrationAuthKind;
  readonly accountLabel: string | null;
  readonly externalPropertyId: string | null;
  readonly lastSyncAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly nextAttemptAt: string | null;
  readonly lastError: string | null;
  readonly lastFailureKind: SyncFailureKind | null;
  readonly isStale: boolean;
  readonly checkPending: boolean;
  readonly externalRevocationPending: boolean;
  /** Vacío para quien no es propietario del espacio (§126). */
  readonly credentials: readonly CredentialMeta[];
}

export type LastPublication =
  | { readonly kind: "published"; readonly at: string }
  | { readonly kind: "none" }
  | { readonly kind: "unavailable" };

export interface IntegrationsView {
  readonly rows: readonly IntegrationRow[];
  /** RN-INT-05 · quién mira, para decidir qué botones tiene sentido pintar. El servidor lo vuelve a comprobar. */
  readonly actor: IntegrationActor;
  readonly vaultConfigured: boolean;
  readonly oauthConfigured: boolean;
  readonly establishmentArchived: boolean;
  readonly websiteUrl: string | null;
  readonly webPlatform: string | null;
  /** Vista 17 · "Proyecto": el dominio de la ficha, o la web si no hay dominio. */
  readonly domain: string | null;
  /**
   * Vista 17 · "Última publicación" de la tarjeta de LandingSite: la
   * última vez que un menú de este restaurante se marcó como publicado
   * (§121: la publicación es manual y se registra al marcarla).
   *
   * Es un resultado de tres casos y no una fecha anulable a propósito
   * (CLAUDE.md: "errores de negocio como tipos de resultado explícitos"):
   * "no hay ninguna" y "no se pudo leer" son cosas distintas, y pintar la
   * segunda como la primera sería afirmar algo que nadie sabe (CA-20).
   */
  readonly lastWebPublication: LastPublication;
  readonly timezone: string;
  /** Lo que la vuelta de Google (o una acción) dejó en la dirección. */
  readonly flash: IntegrationFlash | null;
}

export function parseIntegrationFlash(value: string | undefined): IntegrationFlash | null {
  if (value === undefined) return null;
  return value in es.integrations.flash ? (value as IntegrationFlash) : null;
}

function asFailureKind(value: string | null): SyncFailureKind | null {
  return value === "transient" || value === "authorization" || value === "configuration" ? value : null;
}

export async function loadIntegrationRows(
  supabase: Client,
  establishmentId: string,
): Promise<readonly IntegrationRow[]> {
  const { data: rows, error } = await supabase.rpc("establishment_integrations", {
    p_establishment_id: establishmentId,
  });
  if (error) throw new Error(`establishment_integrations: ${error.message}`);

  const ids = (rows ?? []).flatMap((r) => (r.integration_id ? [r.integration_id] : []));
  // Columnas enumeradas: `ciphertext` está revocada para todos (CLAUDE.md).
  // A quien no tiene `manage_space` la política le devuelve cero filas.
  const { data: credentialRows } =
    ids.length === 0
      ? { data: [] }
      : await supabase
          .from("integration_credentials")
          .select("integration_id, kind, key_version, expires_at, created_at, replaced_at, revoked_at")
          .in("integration_id", ids)
          .order("created_at", { ascending: false });

  const credentialsByIntegration = new Map<string, CredentialMeta[]>();
  for (const c of credentialRows ?? []) {
    const lista = credentialsByIntegration.get(c.integration_id) ?? [];
    lista.push({
      kind: c.kind === "api_key" ? "api_key" : "oauth_refresh_token",
      keyVersion: c.key_version,
      expiresAt: c.expires_at,
      createdAt: c.created_at,
      status: c.revoked_at !== null ? "revoked" : c.replaced_at !== null ? "replaced" : "active",
    });
    credentialsByIntegration.set(c.integration_id, lista);
  }

  return (rows ?? []).flatMap((r): IntegrationRow[] => {
    if (!isIntegrationProvider(r.provider) || !isIntegrationState(r.status)) return [];
    return [
      {
        provider: r.provider,
        integrationId: r.integration_id ?? null,
        status: r.status,
        authKind: r.auth_kind === "api_key" ? "api_key" : "oauth",
        accountLabel: r.account_label ?? null,
        externalPropertyId: r.external_property_id ?? null,
        lastSyncAt: r.last_sync_at ?? null,
        lastSuccessAt: r.last_success_at ?? null,
        nextAttemptAt: r.next_attempt_at ?? null,
        lastError: r.last_error ?? null,
        lastFailureKind: asFailureKind(r.last_failure_kind ?? null),
        isStale: r.is_stale,
        checkPending: r.check_pending,
        externalRevocationPending: r.external_revocation_pending,
        credentials: r.integration_id ? (credentialsByIntegration.get(r.integration_id) ?? []) : [],
      },
    ];
  });
}

export async function loadIntegrationsView(
  supabase: Client,
  input: {
    readonly establishmentId: string;
    readonly actor: IntegrationActor;
    readonly establishmentStatus: string;
    readonly websiteUrl: string | null;
    readonly webPlatform: string | null;
    readonly domain: string | null;
    readonly timezone: string;
    readonly flash: string | undefined;
  },
): Promise<IntegrationsView> {
  const [rows, { data: ultimoMenu, error: falloMenu }] = await Promise.all([
    loadIntegrationRows(supabase, input.establishmentId),
    // `menus` la lee también el restaurante (es suya). Columnas
    // enumeradas: la 77 le revocó el `select` entero para taparle el
    // actor, así que `select *` devolvería 403 (CLAUDE.md).
    supabase
      .from("menus")
      .select("published_at")
      .eq("establishment_id", input.establishmentId)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const lastWebPublication: LastPublication = falloMenu
    ? { kind: "unavailable" }
    : ultimoMenu?.published_at
      ? { kind: "published", at: ultimoMenu.published_at }
      : { kind: "none" };
  return {
    rows,
    actor: input.actor,
    vaultConfigured: vaultIsConfigured(),
    oauthConfigured: googleOAuthIsConfigured(),
    establishmentArchived: input.establishmentStatus === "archived",
    websiteUrl: input.websiteUrl,
    webPlatform: input.webPlatform,
    domain: input.domain,
    lastWebPublication,
    timezone: input.timezone,
    flash: parseIntegrationFlash(input.flash),
  };
}

// ---------------------------------------------------------------------
// "Informes y datos" (§178, RN-INT-07; maquetas 09 a 12 y las vistas sin datos)
// ---------------------------------------------------------------------

export interface ProviderData {
  readonly provider: IntegrationProvider;
  readonly status: IntegrationState;
  /** §178 · por qué no hay cifra; `null` es "hay cifra y es actual". */
  readonly reason: SummaryReason | null;
  readonly lastSuccessAt: string | null;
  readonly lastSyncAt: string | null;
  readonly lastError: string | null;
  readonly coveredDays: number;
  /**
   * Todos los puntos de la fuente en la ventana y en la anterior. Las
   * secciones calculan sobre ellos (series, desgloses, variación) con las
   * funciones de `src/core/integrations.ts`, sin volver a la base.
   */
  readonly points: readonly MetricPoint[];
}

export interface DigitalDataView {
  readonly window: SyncWindow;
  readonly previousWindow: SyncWindow;
  readonly timezone: string;
  readonly providers: readonly ProviderData[];
}

/**
 * Los puntos de un restaurante entre dos fechas, agrupados por fuente.
 *
 * Se pide por páginas porque PostgREST corta en 1000 filas (`max_rows` de
 * `supabase/config.toml`) y 56 días de una fuente con desgloses pasan de
 * ahí: sin paginar, la sección enseñaría una serie recortada sin decirlo,
 * que es justo lo que RN-INT-07 prohíbe. Ordenado por clave natural para
 * que las páginas no se solapen ni se salten filas.
 *
 * `provider` no es parte de `MetricPoint` —esa es la clave natural que
 * escribe el adaptador, que ya sabe de quién es—, así que se usa para
 * agrupar aquí y no viaja dentro de cada punto.
 */
const PAGE = 1000;

async function fetchPointsByProvider(
  supabase: Client,
  establishmentId: string,
  from: string,
  to: string,
): Promise<Map<string, MetricPoint[]>> {
  const byProvider = new Map<string, MetricPoint[]>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("metric_points")
      .select("provider, metric, dimension, period_start, period_end, value, unit")
      .eq("establishment_id", establishmentId)
      .gte("period_start", from)
      .lte("period_end", to)
      .order("provider", { ascending: true })
      .order("metric", { ascending: true })
      .order("dimension", { ascending: true })
      .order("period_start", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`metric_points: ${error.message}`);
    for (const p of data ?? []) {
      const lista = byProvider.get(p.provider) ?? [];
      lista.push({
        metric: p.metric,
        dimension: p.dimension,
        period_start: p.period_start,
        period_end: p.period_end,
        value: Number(p.value),
        unit: p.unit,
      });
      byProvider.set(p.provider, lista);
    }
    if ((data ?? []).length < PAGE) break;
  }
  return byProvider;
}

/**
 * Lo que "Informes y datos" enseña: por fuente, el motivo de no tener
 * cifra (§178) o los puntos de la ventana de 28 días y de los 28
 * anteriores, para decir la variación. Se traen enteros porque las
 * secciones (maquetas 10 y 11) enseñan series, desgloses y últimas
 * mediciones, no solo dos totales.
 */
export async function loadDigitalData(
  supabase: Client,
  input: {
    readonly establishmentId: string;
    readonly rows: readonly IntegrationRow[];
    readonly todayIso: string;
    readonly timezone: string;
    readonly now: Date;
  },
): Promise<DigitalDataView> {
  const window = summaryWindow(input.todayIso);
  const anterior = previousWindow(window);
  const byProvider = await fetchPointsByProvider(supabase, input.establishmentId, anterior.from, window.to);

  const providers = input.rows.map((row): ProviderData => {
    const points = byProvider.get(row.provider) ?? [];
    const headlines = HEADLINE_METRICS[row.provider];
    const covered = headlines.length === 0 ? 0 : coveredDays(points, headlines[0].metric, window);
    const lastSuccessAt = row.lastSuccessAt === null ? null : new Date(row.lastSuccessAt);
    return {
      provider: row.provider,
      status: row.status,
      reason: summaryReason(row.provider, row.status, lastSuccessAt, input.now, covered),
      lastSuccessAt: row.lastSuccessAt,
      lastSyncAt: row.lastSyncAt,
      lastError: row.lastError,
      coveredDays: covered,
      points,
    };
  });

  return { window, previousWindow: anterior, timezone: input.timezone, providers };
}

// ---------------------------------------------------------------------
// Ajustes › Integraciones: todo el espacio
// ---------------------------------------------------------------------

export interface SpaceIntegrationRow {
  readonly integrationId: string;
  readonly establishmentId: string;
  readonly establishmentName: string;
  readonly provider: IntegrationProvider;
  readonly status: IntegrationState;
  readonly accountLabel: string | null;
  readonly lastSyncAt: string | null;
  readonly nextAttemptAt: string | null;
  readonly lastError: string | null;
}

export async function loadSpaceIntegrations(
  supabase: Client,
  spaceId: string,
): Promise<readonly SpaceIntegrationRow[]> {
  const [{ data: rows, error }, { data: establishments }] = await Promise.all([
    supabase
      .from("integrations")
      .select("id, establishment_id, provider, status, account_label, last_sync_at, next_attempt_at, last_error")
      .eq("space_id", spaceId)
      .order("updated_at", { ascending: false }),
    supabase.from("establishments").select("id, name").eq("space_id", spaceId),
  ]);
  if (error) throw new Error(`integrations: ${error.message}`);
  const nombres = new Map((establishments ?? []).map((e) => [e.id, e.name]));

  return (rows ?? []).flatMap((r): SpaceIntegrationRow[] => {
    if (!isIntegrationProvider(r.provider) || !isIntegrationState(r.status)) return [];
    return [
      {
        integrationId: r.id,
        establishmentId: r.establishment_id,
        establishmentName: nombres.get(r.establishment_id) ?? r.establishment_id,
        provider: r.provider,
        status: r.status,
        accountLabel: r.account_label,
        lastSyncAt: r.last_sync_at,
        nextAttemptAt: r.next_attempt_at,
        lastError: r.last_error,
      },
    ];
  });
}

// ---------------------------------------------------------------------
// Formato de fechas, en la zona del espacio (CLAUDE.md MUST).
// ---------------------------------------------------------------------

export function formatMoment(value: string | null, timezone: string): string {
  if (value === null) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDay(value: string | null, timezone: string): string {
  if (value === null) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? "UTC" : timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
