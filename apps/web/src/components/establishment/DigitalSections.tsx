import Link from "next/link";

import { Tabs } from "@/components/ui/Tabs";
import type { ReactNode } from "react";

import { Card, EmptyState, ErrorState, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  DATA_SECTION_PROVIDERS,
  type DataSection,
  type IntegrationProvider,
  type MetricPoint,
  type SummaryReason,
  type SyncWindow,
  SUMMARY_WINDOW_DAYS,
  dailySeries,
  headlineValue,
  integrationTone,
  latestByDimension,
  minimumCoveredDays,
  percentChange,
  topDimensions,
} from "@/core/integrations";
import { es } from "@/i18n/es";

import { DonutChart, LineChart } from "./charts";
import { ProviderMark, providerName } from "./ProviderMark";
import { formatDay, formatMoment, type DigitalDataView, type ProviderData } from "./integrations-load";
import { DATA_SECTION_TABS, type DataSectionTab, dataSectionLabel } from "./tabs";

const t = es.integrations;
const sheet = es.establishmentSheet;

/**
 * "Informes y datos" por secciones (maquetas 09 a 12 y las seis vistas
 * "sin datos" del PDF de Restaurantes; vista 22 del panel del
 * restaurante). Las mismas piezas para el equipo y para el cliente: la
 * ficha las compone en su pestaña y el panel del restaurante en su
 * pantalla.
 *
 * Lo que manda aquí es §178 y RN-INT-07: cada sección o enseña cifras de
 * la ventana con su antigüedad, o dice uno de los cinco motivos con su
 * nombre. Ninguna cifra es de relleno; las maquetas van marcadas "Datos de
 * ejemplo" y eso es lo único de ellas que no se copia (CLAUDE.md).
 *
 * Los cálculos —series, desgloses, variación— son de
 * `src/core/integrations.ts`; esto los pinta.
 */

// ---------------------------------------------------------------------
// La subnavegación
// ---------------------------------------------------------------------

export function DataSectionNav({
  active,
  hrefFor,
  labels,
}: {
  active: DataSectionTab;
  hrefFor: (section: DataSectionTab) => string;
  /** R29 · el panel del restaurante llama "Informes" a la primera. */
  labels?: Partial<Record<DataSectionTab["key"], string>>;
}) {
  return (
    <Tabs
      label={sheet.dataSectionsLabel}
      active={active.key}
      tabs={DATA_SECTION_TABS.map((section) => ({
        key: section.key,
        label: labels?.[section.key] ?? dataSectionLabel(section),
        href: hrefFor(section),
      }))}
    />
  );
}

// ---------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------

function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatPercentRatio(value: number): string {
  return `${formatNumber(value * 100, 1)} %`;
}

function formatSeconds(total: number): string {
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  if (horas > 0) return `${horas} h ${minutos} min`;
  if (minutos > 0) return `${minutos} min ${Math.round(total % 60)} s`;
  return `${Math.round(total)} s`;
}

function formatMs(value: number): string {
  return value >= 1000 ? `${formatNumber(value / 1000, 1)} s` : `${formatNumber(value)} ms`;
}

/**
 * La variación con su signo, su flecha y su color (maquetas 10 y 22.02).
 * `invert` para lo que mejora al bajar (la posición media). Sin cifra
 * anterior se dice, no se deja un hueco.
 */
function Change({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) {
    return <span className="text-xs text-text-secondary">{t.changeNoPrevious}</span>;
  }
  const redondeado = Math.round(value);
  const mejora = redondeado === 0 ? null : invert ? redondeado < 0 : redondeado > 0;
  const clase = mejora === null ? "text-text-secondary" : mejora ? "text-success" : "text-danger";
  const palabra = redondeado === 0 ? t.changeFlat : redondeado > 0 ? t.changeUp : t.changeDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${clase}`}>
      <span className="sr-only">{palabra}</span>
      <span aria-hidden="true">{redondeado > 0 ? "↑" : redondeado < 0 ? "↓" : "="}</span>
      {`${redondeado > 0 ? "+" : ""}${formatNumber(redondeado)} %`}
      <span className="font-normal text-text-secondary">{t.changeVsPrevious}</span>
    </span>
  );
}

function Stat({
  label,
  value,
  change,
  invert,
  testId,
}: {
  label: string;
  value: string;
  change?: number | null;
  invert?: boolean;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="rounded-lg bg-soft-surface p-3">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-lg font-semibold text-primary-dark">{value}</p>
      {change !== undefined ? <Change value={change} invert={invert} /> : null}
    </div>
  );
}

/**
 * La variación frente a los 28 días anteriores, o nada cuando la vista es
 * la de "Últimos datos disponibles" de una fuente parada (A16): con la
 * ventana a medias, comparar con la anterior entera diría una caída que no
 * ha pasado.
 */
function vs(view: DigitalDataView, current: number | null, previous: number | null): number | null | undefined {
  return view.lastDataOnly === true ? undefined : percentChange(current, previous);
}

function metricName(metric: string): string {
  return (t.metrics as Record<string, string | undefined>)[metric] ?? metric;
}

/** Una suma de una métrica en una ventana, o `null` sin ningún punto. */
function sumOf(points: readonly MetricPoint[], metric: string, window: SyncWindow): number | null {
  return headlineValue(points, { metric, aggregate: "sum" }, window).value;
}

function meanOf(points: readonly MetricPoint[], metric: string, window: SyncWindow): number | null {
  return headlineValue(points, { metric, aggregate: "mean" }, window).value;
}

/** La suma de todos los desgloses de una métrica (los eventos clave de GA4 no tienen total). */
function sumOfDimensions(points: readonly MetricPoint[], metric: string, window: SyncWindow): number | null {
  const desgloses = topDimensions(points, metric, window, Number.MAX_SAFE_INTEGER);
  return desgloses.length === 0 ? null : desgloses.reduce((acc, d) => acc + d.value, 0);
}

function lastDayWithData(points: readonly MetricPoint[], window: SyncWindow): string | null {
  return points.reduce<string | null>(
    (max, p) => (p.period_end >= window.from && p.period_end <= window.to && (max === null || p.period_end > max) ? p.period_end : max),
    null,
  );
}

function RankingTable({
  title,
  dimensionColumn,
  valueColumn,
  rows,
  format = (v: number) => formatNumber(v),
  labelFor = (d: string) => d,
  testId,
}: {
  title: string;
  dimensionColumn: string;
  valueColumn: string;
  rows: readonly { dimension: string; value: number }[];
  format?: (value: number) => string;
  labelFor?: (dimension: string) => string;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="min-w-0">
      <p className="mb-2 font-semibold text-text">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-text-secondary">{t.chartNoDays}</p>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{dimensionColumn}</TableHeaderCell>
              <TableHeaderCell>{valueColumn}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={row.dimension}>
                <TableCell>
                  <span className="mr-2 text-text-secondary">{i + 1}.</span>
                  <span className="break-all">{labelFor(row.dimension)}</span>
                </TableCell>
                <TableCell>{format(row.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// El estado de las fuentes (vistas sin datos 1/6 y 22.04)
// ---------------------------------------------------------------------

/**
 * Lo que la tabla dice de cada fuente: el estado con las palabras del
 * diseño (una conectada que aún no trajo nada es "Esperando primera
 * sincronización", y en PageSpeed "Esperando primer análisis") y la
 * información, que es el motivo de §178 o hasta cuándo llega el dato.
 */
function sourceStateLabel(data: ProviderData): string {
  if (data.status === "connected" && data.lastSuccessAt === null) {
    return data.provider === "pagespeed" ? t.waitingFirstAnalysis : t.waitingFirstSync;
  }
  return t.states[data.status];
}

function sourceInfo(data: ProviderData, view: DigitalDataView): string {
  if (data.status === "not_connected") return t.sourceInfo.not_connected;
  if (data.status === "pending_authorization") return t.sourceInfo.pending_authorization;
  if (data.status === "disconnected") return t.sourceInfo.disconnected;
  if (data.status === "needs_attention") return t.sourceInfo.needs_attention;
  switch (data.reason) {
    case "no_data_yet":
      return data.provider === "pagespeed" ? t.sourceInfo.no_analysis_yet : t.sourceInfo.no_data_yet;
    case "error":
      return t.sourceInfo.error;
    case "stale":
      return t.sourceInfo.stale;
    case "insufficient_period":
      return t.sourceInfo.insufficient_period;
    case "not_connected":
      return t.sourceInfo.not_connected;
    case null: {
      const hasta = lastDayWithData(data.points, view.window);
      return hasta === null ? t.sourceInfo.no_data_yet : t.sourceInfo.ok(formatDay(hasta, view.timezone));
    }
  }
}

export function SourcesStatusTable({
  view,
  providers,
  title,
  footnote,
}: {
  view: DigitalDataView;
  providers: readonly IntegrationProvider[];
  title: string;
  footnote?: string;
}) {
  return (
    <Card title={title}>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>{t.sourceColumn}</TableHeaderCell>
            <TableHeaderCell>{t.stateColumn}</TableHeaderCell>
            <TableHeaderCell>{t.updatedColumn}</TableHeaderCell>
            <TableHeaderCell>{t.infoColumn}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {providers.map((provider) => {
            const data = view.providers.find((p) => p.provider === provider);
            if (!data) return null;
            return (
              <TableRow key={provider}>
                <TableCell>
                  <span data-testid={`source-${provider}`} className="flex items-center gap-2">
                    <ProviderMark provider={provider} size="sm" />
                    <span className="font-medium">{providerName(provider)}</span>
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge
                    tone={data.status === "connected" && data.lastSuccessAt === null ? "info" : integrationTone(data.status)}
                    icon={data.status === "error" || data.status === "needs_attention" ? "alert" : data.status === "connected" && data.reason === null ? "check" : "clock"}
                  >
                    {sourceStateLabel(data)}
                  </StatusBadge>
                </TableCell>
                <TableCell>{formatMoment(data.lastSuccessAt, view.timezone)}</TableCell>
                <TableCell>
                  <span className="text-text-secondary">{sourceInfo(data, view)}</span>
                </TableCell>
              </TableRow>
            );
          })}
          {/*
            RN-INT-09 (decisión 48) · "Cuotly Insights", donde el diseño lo
            pone —entre las fuentes, páginas 41 y 44— pero diciendo lo que
            es: la lectura propia de Cuotly, no una conexión.

            Su estado **se deriva** (RN-DAT-05). El diseño lo pinta siempre
            "Activa"; pintarlo así afirmaría que hay un resumen cuando
            puede no haber ni un dato detrás, y eso es el dato de relleno
            que CLAUDE.md prohíbe. Su fecha tampoco es suya: es la del dato
            más reciente que resume, porque no sincroniza nada.
          */}
          <TableRow>
            <TableCell>
              <span data-testid="source-cuotly-insights" className="flex items-center gap-2">
                <span className="font-medium">{t.insightsName}</span>
              </span>
            </TableCell>
            <TableCell>
              <StatusBadge
                tone={insightsSince(view, providers) === null ? "info" : "success"}
                icon={insightsSince(view, providers) === null ? "clock" : "check"}
              >
                {insightsSince(view, providers) === null ? t.insightsNothingYet : t.insightsActive}
              </StatusBadge>
            </TableCell>
            <TableCell>{formatMoment(insightsSince(view, providers), view.timezone)}</TableCell>
            <TableCell>
              <span className="text-text-secondary">
                {insightsSince(view, providers) === null ? t.insightsInfoEmpty : t.insightsInfo}
              </span>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      {footnote ? <p className="mt-3 text-center text-xs text-text-secondary">{footnote}</p> : null}
    </Card>
  );
}

/**
 * RN-INT-09 · el momento del dato más reciente que el resumen resume, o
 * `null` si no hay ninguno. Es lo que decide el estado de "Cuotly
 * Insights" y también lo que se enseña como su fecha: no sincroniza nada,
 * así que una fecha propia sería inventada.
 */
export function insightsSince(
  view: DigitalDataView,
  providers: readonly IntegrationProvider[],
): string | null {
  const fechas = providers
    .map((provider) => view.providers.find((p) => p.provider === provider)?.lastSuccessAt ?? null)
    .filter((fecha): fecha is string => fecha !== null);

  if (fechas.length === 0) return null;
  return fechas.reduce((mayor, fecha) => (fecha > mayor ? fecha : mayor));
}

// ---------------------------------------------------------------------
// Las secciones
// ---------------------------------------------------------------------

const SECTION_ICON: Readonly<Record<DataSection, IconName>> = {
  summary: "reports",
  analytics: "reports",
  search: "search",
  behavior: "person",
  performance: "clock",
  opportunities: "agent",
};

function ManageButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-[10px] bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark"
    >
      {t.manageIntegrations}
    </Link>
  );
}

function SectionEmpty({ section, manageHref }: { section: DataSection; manageHref: string | null }) {
  const words = t.sections[section];
  return (
    <Card>
      <EmptyState
        icon={SECTION_ICON[section]}
        title={words.emptyTitle}
        description={words.emptyHint}
        action={manageHref === null ? undefined : <ManageButton href={manageHref} />}
      />
    </Card>
  );
}

/**
 * Una sección de "Informes y datos". `manageHref` es a dónde lleva
 * "Gestionar integraciones": Gestión › Integraciones para el equipo,
 * "Autorizar fuentes" para el restaurante; `null` para quien no gestiona
 * nada (un trabajador), que ve el motivo sin un botón que no es suyo.
 */
export function DigitalSection({
  section,
  view,
  manageHref,
  opportunities,
}: {
  section: DataSection;
  view: DigitalDataView | null;
  manageHref: string | null;
  /**
   * Hito 15 · lo que se pinta en la sexta sección. Se pasa hecho desde la
   * pantalla (`OpportunitiesSection`) en vez de leerlo aquí: esta sección
   * no sale de `metric_points` como las otras cuatro, sino de
   * `opportunities`, que tiene su propia política y su propio permiso.
   */
  opportunities?: ReactNode;
}) {
  const words = t.sections[section];

  if (view === null) {
    return (
      <Card title={words.title}>
        <ErrorState title={es.states.errorTitle} description={es.emptyReasons.error} />
      </Card>
    );
  }

  if (section === "opportunities") {
    return <>{opportunities ?? <SectionEmpty section={section} manageHref={null} />}</>;
  }

  const providers = DATA_SECTION_PROVIDERS[section];
  const datos = providers.flatMap((provider) => view.providers.filter((p) => p.provider === provider));
  const conCifra = datos.filter((d) => d.reason === null);

  if (section === "summary") {
    return (
      <>
        {conCifra.length === 0 ? <SectionEmpty section={section} manageHref={manageHref} /> : null}
        <SourcesStatusTable view={view} providers={providers} title={t.sourcesStatusTitle} />
      </>
    );
  }

  // A16 · una fuente que falla o se ha quedado vieja pero trajo algo antes
  // no deja la sección en blanco: se dice qué pasa y se enseñan sus
  // últimos datos, con su fecha.
  const conUltimos = datos.filter((d) => hasLastData(d, view.window));

  if (conCifra.length === 0 && conUltimos.length === 0) {
    return (
      <>
        <SectionEmpty section={section} manageHref={manageHref} />
        <SourcesStatusTable view={view} providers={providers} title={t.sourceOfDataTitle} footnote={t.sourcesFootnote} />
      </>
    );
  }

  return (
    <>
      {datos.map((data) =>
        data.reason === null ? (
          <ProviderView key={data.provider} data={data} view={view} />
        ) : (
          <ProviderReason key={data.provider} data={data} view={view} manageHref={manageHref} />
        ),
      )}
    </>
  );
}

/** Falla o está vieja, pero hay puntos suyos en la ventana que enseñar (A16). */
function hasLastData(data: ProviderData, window: SyncWindow): boolean {
  return (
    (data.reason === "error" || data.reason === "stale") &&
    data.lastSuccessAt !== null &&
    data.points.some((p) => p.period_start >= window.from && p.period_end <= window.to)
  );
}

/** La fuente de una sección que no tiene cifra actual: su motivo, con su nombre. */
function ProviderReason({ data, view, manageHref }: { data: ProviderData; view: DigitalDataView; manageHref: string | null }) {
  const reason = data.reason as SummaryReason;
  if (reason === "error" || reason === "stale") {
    return <ProviderSyncProblem data={data} view={view} manageHref={manageHref} reason={reason} />;
  }
  const titulo = reason === "not_connected" ? t.notConnectedTitle : reason === "no_data_yet" ? t.noDataTitle : t.insufficientTitle;
  return (
    <Card title={providerName(data.provider)}>
      <div data-testid={`digital-${data.provider}`} data-reason={reason}>
        <EmptyReason reason={reason} title={titulo} />
        {reason === "insufficient_period" && minimumCoveredDays(data.provider) > 1 ? (
          <p className="mt-2 text-xs text-text-secondary">{t.coveredDays(data.coveredDays, SUMMARY_WINDOW_DAYS)}</p>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * El encabezado de cada fuente con las palabras de la maqueta ("Microsoft
 * Clarity — Comportamiento", "PageSpeed Insights — Rendimiento"). Las dos
 * que la maqueta no titula así llevan su nombre a secas.
 */
const PROVIDER_TITLE: Readonly<Record<IntegrationProvider, string>> = {
  ga4: es.integrations.providers.ga4.name,
  search_console: es.integrations.searchPerformanceTitle,
  business_profile: es.integrations.businessProfileTitle,
  clarity: es.integrations.clarityTitle,
  pagespeed: es.integrations.pagespeedTitle,
};

function ProviderView({ data, view }: { data: ProviderData; view: DigitalDataView }) {
  const hasta = lastDayWithData(data.points, view.window);
  const nota = (
    <span className="text-xs text-text-secondary">
      {t.lastDays(SUMMARY_WINDOW_DAYS)}
      {hasta ? ` · ${t.dataUntil(formatDay(hasta, view.timezone))}` : null}
      {data.lastSuccessAt ? ` · ${t.syncedAt(formatMoment(data.lastSuccessAt, view.timezone))}` : null}
    </span>
  );
  const titulo = PROVIDER_TITLE[data.provider];

  return (
    <Card title={titulo} action={nota}>
      <div data-testid={`digital-${data.provider}`} data-reason="ok" className="space-y-4">
        <ProviderBody data={data} view={view} />
      </div>
    </Card>
  );
}

function ProviderBody({ data, view }: { data: ProviderData; view: DigitalDataView }): ReactNode {
  switch (data.provider) {
    case "ga4":
      return <Ga4View data={data} view={view} />;
    case "search_console":
      return <SearchConsoleView data={data} view={view} />;
    case "business_profile":
      return <BusinessProfileView data={data} view={view} />;
    case "clarity":
      return <ClarityView data={data} view={view} />;
    case "pagespeed":
      return <PageSpeedView data={data} view={view} />;
  }
}

/**
 * A16 · "Error de sincronización". La franja roja dice qué fuente no se
 * ha podido actualizar y lleva la insignia "Datos desactualizados"; debajo,
 * la última pasada correcta y el último intento (con "Error" si fue un
 * fallo), "Revisar conexión" para quien gestiona y, si la fuente trajo
 * algo antes, sus "Últimos datos disponibles" con la fecha hasta la que
 * llegan.
 *
 * El dibujo pone además "Reintentar sincronización". No se copia: CLAUDE.md
 * prohíbe el botón "Sincronizar ahora" en las integraciones analíticas; la
 * sincronización es la programada y el remedio está en la conexión.
 */
function ProviderSyncProblem({
  data,
  view,
  manageHref,
  reason,
}: {
  data: ProviderData;
  view: DigitalDataView;
  manageHref: string | null;
  reason: "error" | "stale";
}) {
  const nombre = providerName(data.provider);
  const ultimos = hasLastData(data, view.window);
  const hasta = ultimos ? lastDayWithData(data.points, view.window) : null;
  return (
    <Card className="p-0! overflow-hidden">
      <div data-testid={`digital-${data.provider}`} data-reason={reason}>
        <div className="space-y-4 p-5">
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[10px] bg-danger/10 px-4 py-3">
            <Icon name="alert" className="h-5 w-5 shrink-0 text-danger" />
            <p className="flex-1 text-sm font-semibold text-danger">
              {reason === "error" ? t.syncProblem.errorTitle(nombre) : t.syncProblem.staleTitle(nombre)}
            </p>
            <StatusBadge tone="danger">{t.syncProblem.badge}</StatusBadge>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2 sm:divide-x sm:divide-border">
            <div>
              <dt className="text-sm text-text-secondary">{t.syncProblem.lastSuccess}</dt>
              <dd className="mt-1 font-semibold text-text-primary">
                {data.lastSuccessAt ? formatMoment(data.lastSuccessAt, view.timezone) : t.syncProblem.never}
              </dd>
            </div>
            <div className="sm:pl-6">
              <dt className="text-sm text-text-secondary">{t.syncProblem.lastAttempt}</dt>
              <dd className="mt-1 font-semibold text-text-primary">
                {data.lastSyncAt ? formatMoment(data.lastSyncAt, view.timezone) : t.syncProblem.never}
                {reason === "error" ? <span className="text-danger">{` · ${t.syncProblem.errorWord}`}</span> : null}
              </dd>
            </div>
          </dl>
          {reason === "error" && data.lastError ? <p className="text-xs text-danger">{data.lastError}</p> : null}
          {manageHref !== null ? (
            <Link
              href={manageHref}
              className="inline-flex items-center justify-center rounded-[10px] border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text-primary hover:bg-soft-surface"
            >
              {t.syncProblem.reviewConnection}
            </Link>
          ) : null}
        </div>
        <div className="space-y-4 border-t border-border p-5">
          <h3 className="text-base font-semibold text-text-primary">
            {t.syncProblem.lastData}
            {hasta ? <span className="ml-2 text-xs font-normal text-text-secondary">{t.dataUntil(formatDay(hasta, view.timezone))}</span> : null}
          </h3>
          {ultimos ? (
            <ProviderBody data={data} view={{ ...view, lastDataOnly: true }} />
          ) : (
            <EmptyReason reason={reason} title={reason === "error" ? t.errorTitle : t.staleTitle} />
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------
// GA4 · Analítica (maqueta 10)
// ---------------------------------------------------------------------

function Ga4View({ data, view }: { data: ProviderData; view: DigitalDataView }) {
  const { points } = data;
  const w = view.window;
  const pw = view.previousWindow;
  const usuarios = sumOf(points, "users", w);
  const sesiones = sumOf(points, "sessions", w);
  const eventos = sumOfDimensions(points, "conversions_by_event", w);
  const dispositivos = topDimensions(points, "sessions_by_device", w, 3);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat testId="stat-users" label={metricName("users")} value={usuarios === null ? "—" : formatNumber(usuarios)} change={vs(view, usuarios, sumOf(points, "users", pw))} />
        <Stat testId="stat-sessions" label={metricName("sessions")} value={sesiones === null ? "—" : formatNumber(sesiones)} change={vs(view, sesiones, sumOf(points, "sessions", pw))} />
        <Stat label={t.conversionsTitle} value={eventos === null ? "—" : formatNumber(eventos)} change={vs(view, eventos, sumOfDimensions(points, "conversions_by_event", pw))} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <LineChart
          testId="chart-users-sessions"
          title={t.usersSessionsTitle}
          window={w}
          series={[
            { key: "users", label: metricName("users"), points: dailySeries(points, "users", w), tone: "green" },
            { key: "sessions", label: metricName("sessions"), points: dailySeries(points, "sessions", w), tone: "info" },
          ]}
        />
        <DonutChart
          testId="chart-devices"
          title={t.devicesTitle}
          centerLabel={metricName("sessions")}
          slices={dispositivos.map((d) => ({ key: d.dimension, label: t.devices[d.dimension] ?? d.dimension, value: d.value }))}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <RankingTable testId="top-pages" title={t.topPagesTitle} dimensionColumn={t.pageColumn} valueColumn={t.viewsColumn} rows={topDimensions(points, "page_views_by_page", w, 5)} />
        <RankingTable title={t.trafficSourcesTitle} dimensionColumn={t.trafficSourceColumn} valueColumn={t.sessionsColumn} rows={topDimensions(points, "sessions_by_source", w, 5)} />
        <RankingTable title={t.locationsTitle} dimensionColumn={t.locationColumn} valueColumn={t.sessionsColumn} rows={topDimensions(points, "sessions_by_location", w, 5)} />
        <RankingTable title={t.conversionsTitle} dimensionColumn={t.conversionColumn} valueColumn={t.conversionsColumn} rows={topDimensions(points, "conversions_by_event", w, 5)} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// Search Console · Búsqueda (maqueta 10)
// ---------------------------------------------------------------------

function SearchConsoleView({ data, view }: { data: ProviderData; view: DigitalDataView }) {
  const { points } = data;
  const w = view.window;
  const pw = view.previousWindow;
  const clics = sumOf(points, "clicks", w);
  const impresiones = sumOf(points, "impressions", w);
  const ctr = meanOf(points, "ctr", w);
  const posicion = meanOf(points, "position", w);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat testId="stat-clicks" label={metricName("clicks")} value={clics === null ? "—" : formatNumber(clics)} change={vs(view, clics, sumOf(points, "clicks", pw))} />
        <Stat label={metricName("impressions")} value={impresiones === null ? "—" : formatNumber(impresiones)} change={vs(view, impresiones, sumOf(points, "impressions", pw))} />
        <Stat label={metricName("ctr")} value={ctr === null ? "—" : formatPercentRatio(ctr)} change={vs(view, ctr, meanOf(points, "ctr", pw))} />
        <Stat testId="stat-position" label={metricName("position")} value={posicion === null ? "—" : formatNumber(posicion, 1)} change={vs(view, posicion, meanOf(points, "position", pw))} invert />
      </div>
      <LineChart
        title={metricName("clicks")}
        window={w}
        series={[{ key: "clicks", label: metricName("clicks"), points: dailySeries(points, "clicks", w), tone: "green" }]}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <RankingTable testId="top-queries" title={t.topQueriesTitle} dimensionColumn={t.queryColumn} valueColumn={t.clicksColumn} rows={topDimensions(points, "clicks_by_query", w, 5)} />
        <RankingTable title={t.searchPagesTitle} dimensionColumn={t.pageColumn} valueColumn={t.clicksColumn} rows={topDimensions(points, "clicks_by_page", w, 5)} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// Business Profile · Visibilidad (maqueta 11)
// ---------------------------------------------------------------------

function BusinessProfileView({ data, view }: { data: ProviderData; view: DigitalDataView }) {
  const { points } = data;
  const w = view.window;
  const pw = view.previousWindow;
  const metricas = ["profile_impressions", "website_clicks", "call_clicks", "direction_requests", "conversations", "bookings"];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        {metricas.map((metric) => {
          const actual = sumOf(points, metric, w);
          return (
            <Stat
              key={metric}
              testId={`stat-${metric}`}
              label={metricName(metric)}
              value={actual === null ? "—" : formatNumber(actual)}
              change={vs(view, actual, sumOf(points, metric, pw))}
            />
          );
        })}
      </div>
      <RankingTable
        title={t.surfacesTitle}
        dimensionColumn={t.surfaceColumn}
        valueColumn={t.impressionsColumn}
        rows={topDimensions(points, "impressions_by_surface", w, 4)}
        labelFor={(d) => (t.surfaces as Record<string, string | undefined>)[d] ?? d}
      />
    </>
  );
}

// ---------------------------------------------------------------------
// Clarity · Comportamiento (maqueta 11)
// ---------------------------------------------------------------------

function ClarityView({ data, view }: { data: ProviderData; view: DigitalDataView }) {
  const { points } = data;
  const w = view.window;
  const pw = view.previousWindow;
  const sesiones = sumOf(points, "sessions", w);
  const usuarios = sumOf(points, "distinct_users", w);
  const paginas = meanOf(points, "pages_per_session", w);
  const scroll = meanOf(points, "scroll_depth", w);
  const tiempo = sumOf(points, "engagement_time_seconds", w);
  const friccion = ["dead_clicks", "rage_clicks", "quick_backs", "excessive_scroll", "script_errors", "error_clicks"];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat testId="stat-sessions" label={metricName("sessions")} value={sesiones === null ? "—" : formatNumber(sesiones)} change={vs(view, sesiones, sumOf(points, "sessions", pw))} />
        <Stat label={metricName("distinct_users")} value={usuarios === null ? "—" : formatNumber(usuarios)} change={vs(view, usuarios, sumOf(points, "distinct_users", pw))} />
        <Stat label={metricName("pages_per_session")} value={paginas === null ? "—" : formatNumber(paginas, 1)} change={vs(view, paginas, meanOf(points, "pages_per_session", pw))} />
        <Stat label={metricName("scroll_depth")} value={scroll === null ? "—" : `${formatNumber(scroll, 0)} %`} change={vs(view, scroll, meanOf(points, "scroll_depth", pw))} />
        <Stat label={metricName("engagement_time_seconds")} value={tiempo === null ? "—" : formatSeconds(tiempo)} change={vs(view, tiempo, sumOf(points, "engagement_time_seconds", pw))} />
      </div>
      <p className="font-semibold text-text">{t.frictionTitle}</p>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {friccion.map((metric) => {
          const actual = sumOf(points, metric, w);
          return (
            <Stat
              key={metric}
              testId={`stat-${metric}`}
              label={metricName(metric)}
              value={actual === null ? "—" : formatNumber(actual)}
              change={vs(view, actual, sumOf(points, metric, pw))}
              invert
            />
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// PageSpeed · Rendimiento (maquetas 11 y 22.03)
// ---------------------------------------------------------------------

const PAGESPEED_ROWS: readonly { metric: string; format: (v: number) => string }[] = [
  { metric: "performance_score_by_strategy", format: (v) => formatNumber(v) },
  { metric: "lcp_ms_by_strategy", format: formatMs },
  { metric: "inp_ms_by_strategy", format: formatMs },
  { metric: "cls_by_strategy", format: (v) => formatNumber(v, 2) },
  { metric: "tbt_ms_by_strategy", format: formatMs },
  { metric: "fcp_ms_by_strategy", format: formatMs },
  { metric: "speed_index_ms_by_strategy", format: formatMs },
];

/**
 * El color de la puntuación son las bandas de Lighthouse (0-49 rojo, 50-89
 * ámbar, 90-100 verde): son de la herramienta, no una lectura de Cuotly.
 * Y van con texto, no solo con el punto (§21.4).
 */
function scoreTone(value: number): "success" | "warning" | "danger" {
  return value >= 90 ? "success" : value >= 50 ? "warning" : "danger";
}

function PageSpeedView({ data, view }: { data: ProviderData; view: DigitalDataView }) {
  const w = view.window;
  const estrategias = ["mobile", "desktop"] as const;
  const puntuacion = latestByDimension(data.points, "performance_score_by_strategy", w);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {estrategias.map((estrategia) => {
          const medida = puntuacion.find((m) => m.dimension === estrategia);
          return (
            <div key={estrategia} data-testid={`score-${estrategia}`} className="flex items-center gap-4 rounded-lg bg-soft-surface p-3">
              <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-primary">
                <Icon name={estrategia === "mobile" ? "person" : "document"} className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs text-text-secondary">{t.strategies[estrategia]} · {t.pagespeedScoreTitle}</p>
                {medida === undefined ? (
                  <p className="text-sm text-text-secondary">{t.pagespeedNoStrategy}</p>
                ) : (
                  <p className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-primary-dark">{formatNumber(medida.value)}</span>
                    <StatusBadge tone={scoreTone(medida.value)}>{t.measuredOn(formatDay(medida.day, view.timezone))}</StatusBadge>
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>{t.metricColumn}</TableHeaderCell>
            <TableHeaderCell>{t.strategies.mobile}</TableHeaderCell>
            <TableHeaderCell>{t.strategies.desktop}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {PAGESPEED_ROWS.map(({ metric, format }) => {
            const medidas = latestByDimension(data.points, metric, w);
            return (
              <TableRow key={metric}>
                <TableCell>{metricName(metric)}</TableCell>
                {estrategias.map((estrategia) => {
                  const medida = medidas.find((m) => m.dimension === estrategia);
                  return <TableCell key={estrategia}>{medida === undefined ? "—" : format(medida.value)}</TableCell>;
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}
