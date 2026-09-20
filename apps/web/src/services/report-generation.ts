/**
 * `src/services/report-generation.ts` — el paso 1 de §95 ("Cuotly genera
 * datos objetivos automáticamente") y el paso 7 ("programa o envía"),
 * Fase 3, Hito 16.
 *
 * El reparto, que es lo que conviene entender antes de tocar esto:
 *
 *   · **Las cuentas** son de `src/core/reports.ts`: lógica pura, sin base
 *     y sin red. Los diez indicadores de §91 se miden con el reloj
 *     contractual, y el reloj vive allí.
 *   · **Las filas** las entrega la migración 85
 *     (`report_operation_dataset`, `report_finance_dataset`), reservadas a
 *     `service_role`.
 *   · **Lo digital** no llama a ninguna API (RN-REP-04): lee
 *     `metric_points`, que es lo que las sincronizaciones ya trajeron. Por
 *     eso un informe de un periodo cerrado sale igual meses después.
 *   · **Lo que se guarda** es una **versión** (RN-REP-12): cifras, claves
 *     de sección y fechas. Ni una frase generada — §93: "el informe
 *     automático por correo no necesita IA", y aquí no hay ninguna.
 *
 * Todo lo externo entra por `ReportGateway`, así que esto se prueba entero
 * sin base de datos y sin red.
 */

import { contractualCalendar, holidaysKnownAsOf } from "@/core/business-clock";
import type { ChangeCategory } from "@/core/classification-rules";
import {
  HEADLINE_METRICS,
  INTEGRATION_PROVIDERS,
  type IntegrationProvider,
  type MetricPoint,
  headlineValue,
  isIntegrationProvider,
  isIntegrationState,
  minimumCoveredDays,
  noDataReason,
} from "@/core/integrations";
import {
  type OperationDataset,
  type ReportBlockRow,
  type ReportConsumptionRow,
  type ReportFigure,
  type ReportJobRow,
  type ReportMenuRow,
  type ReportPeriod,
  type ReportRequestRow,
  type ReportSectionKey,
  type ReportSnapshot,
  type ChangeEffect,
  type ChangeTiming,
  type OpportunityFollowUpLine,
  type PlanUsageLine,
  type PublishedChange,
  type SeriesPoint,
  type WeekBucket,
  type WeeklySeries,
  CHANGE_EFFECT_WINDOW_DAYS,
  EMPTY_MONTH_ACTIVITY,
  changeEffects,
  changeTimings,
  isBlockReason,
  opportunityFollowUp,
  operationalIndicators,
  planUsage,
  sameMonthLastYear,
  weekBuckets,
  weeklySeries,
  withYearAgoFigures,
  parseChangeAllowance,
  parseMonthActivity,
  previousPeriod,
  reportLevelComparison,
  withPreviousFigures,
} from "@/core/reports";
import { todayInTimeZone } from "@/core/finance";
import type { TimerEvent } from "@/core/timer-events";

import type { ProviderState, ReportGateway, ReportRow } from "./report-gateway";

export interface ReportGenerationDeps {
  readonly gateway: ReportGateway;
  readonly now: () => Date;
}

/** Cuántos informes toca por tanda de la cola. */
export const REPORTS_PER_BATCH = 10;

// ---------------------------------------------------------------------
// 1 · De las filas de la base a los tipos del dominio
// ---------------------------------------------------------------------

function asArray(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function asDate(value: unknown): Date | null {
  return typeof value === "string" ? new Date(value) : null;
}

function timerEvents(value: unknown): readonly TimerEvent[] {
  return asArray(value)
    .map((row) => ({
      type: String(row.type) as TimerEvent["type"],
      occurredAt: new Date(String(row.occurred_at)),
    }))
    .filter((event) => !Number.isNaN(event.occurredAt.getTime()));
}

export function parseOperationDataset(raw: Record<string, unknown>): OperationDataset {
  const requests: ReportRequestRow[] = asArray(raw.requests).map((row) => ({
    id: String(row.id),
    establishmentId: String(row.establishment_id),
    state: String(row.state),
    createdAt: asDate(row.created_at) ?? new Date(0),
  }));

  const jobs: ReportJobRow[] = asArray(raw.jobs).map((row) => ({
    id: String(row.id),
    establishmentId: String(row.establishment_id),
    category: String(row.category) as ChangeCategory,
    state: String(row.state),
    assigneeId: row.assigned_to === null || row.assigned_to === undefined ? null : String(row.assigned_to),
    planId: row.plan_id === null || row.plan_id === undefined ? null : String(row.plan_id),
    createdAt: asDate(row.created_at) ?? new Date(0),
    startedAt: asDate(row.started_at),
    publishedAt: asDate(row.published_at),
    completedAt: asDate(row.completed_at),
    // RN-COM-12 · 24 h es el plazo de inicio acelerado; cualquier otra
    // cosa (48 h, o no saberlo) es el normal. La misma lectura que hace
    // el barrido de plazos en `queue-runner.ts`.
    hasAcceleratedSla: asNumber(row.start_sla_hours) === 24,
    t2Events: timerEvents(row.t2_events),
    t3Events: timerEvents(row.t3_events),
    // RN-REP-21 (migración 116) · lo que hace falta para los tiempos de
    // cada cambio. Un dataset de antes de la 116 no los trae y salen a
    // `null`: la fila se queda sin tiempos y lo dice, que es lo correcto.
    requestCode:
      row.request_code === null || row.request_code === undefined ? null : String(row.request_code),
    requestAcceptedAt: asDate(row.request_accepted_at),
    startSlaHours:
      row.start_sla_hours === null || row.start_sla_hours === undefined
        ? null
        : asNumber(row.start_sla_hours),
    // RN-SLA-18 (migración 118) · el plazo de realización congelado. Sin
    // él, los tiempos de cada cambio dirían si cumplió el plazo de otro.
    executionSlaHours:
      row.execution_sla_hours === null || row.execution_sla_hours === undefined
        ? null
        : asNumber(row.execution_sla_hours),
  }));

  const blocks: ReportBlockRow[] = asArray(raw.blocks).map((row) => ({
    jobId: String(row.job_id),
    startedAt: asDate(row.started_at) ?? new Date(0),
    endedAt: asDate(row.ended_at),
    // RN-REP-21 · el motivo, si es uno de los cuatro. Cualquier otra cosa
    // es `null` y la fila no dice por qué, que es mejor que decir mal.
    reason:
      typeof row.reason_type === "string" && isBlockReason(row.reason_type) ? row.reason_type : null,
  }));

  const consumption: ReportConsumptionRow[] = asArray(raw.consumption).map((row) => ({
    establishmentId: String(row.establishment_id),
    category: String(row.category) as ChangeCategory,
    amount: asNumber(row.amount),
  }));

  const menus: ReportMenuRow[] = asArray(raw.menus).map((row) => ({
    establishmentId: String(row.establishment_id),
    publishedAt: asDate(row.published_at),
    withinGuarantee: row.within_guarantee === true,
  }));

  return {
    requests,
    jobs,
    blocks,
    consumption,
    menus,
    correctionsRequested: asNumber(raw.corrections_requested),
    menuUpdatesUsed: asNumber(raw.menu_updates_used),
  };
}

// ---------------------------------------------------------------------
// 2 · Las cifras de cada familia
// ---------------------------------------------------------------------

function figure(
  section: ReportSectionKey,
  metric: string,
  value: number | null,
  extra: Partial<ReportFigure> = {},
): ReportFigure {
  return { section, metric, value, ...extra };
}

/** §91 · los diez indicadores, repartidos en las secciones que los enseñan. */
export function operationFigures(dataset: OperationDataset, timezone: string, holidays: readonly string[], now: Date): readonly ReportFigure[] {
  const calendar = contractualCalendar(timezone, holidays);
  const indicators = operationalIndicators(dataset, calendar, now);

  return [
    figure("operation", "requests_received", indicators.requestsReceived),
    figure("operation", "requests_accepted", indicators.requestsAccepted),
    figure("operation", "requests_rejected", indicators.requestsRejected),
    figure("operation", "requests_cancelled", indicators.requestsCancelled),
    figure("operation", "jobs_started", indicators.jobsStarted),
    figure("operation", "jobs_completed", indicators.jobsCompleted),
    figure("operation", "jobs_pending", indicators.jobsPending),
    figure("operation", "start_compliance", indicators.startCompliancePercent, { unit: "percent" }),
    figure("operation", "execution_compliance", indicators.executionCompliancePercent, { unit: "percent" }),
    figure("operation", "average_start", indicators.averageStartMinutes, { unit: "business_minutes" }),
    figure("operation", "average_completion", indicators.averageCompletionMinutes, { unit: "business_minutes" }),
    figure("operation", "jobs_blocked", indicators.jobsBlocked),
    figure("operation", "blocked_time", indicators.blockedMinutes, { unit: "minutes" }),
    figure("operation", "corrections_requested", indicators.correctionsRequested),
    ...(["small", "photo", "medium", "large"] as const).map((category) =>
      figure("operation", "consumption", indicators.consumptionByCategory[category], {
        dimension: category,
        unit: "changes",
      }),
    ),
    figure("operation", "menu_updates_used", indicators.menuUpdatesUsed, { unit: "updates" }),
    figure("operation", "menus_published", indicators.menusPublished),
    figure("operation", "menus_out_of_guarantee", indicators.menusOutOfGuarantee),
  ];
}

/** §89.2 · ingresos, cobros, impagos y renovaciones. */
export function financeFigures(raw: Record<string, unknown>): readonly ReportFigure[] {
  return [
    figure("finance", "income_base", asNumber(raw.income_base_cents), { unit: "cents" }),
    figure("finance", "income_total", asNumber(raw.income_total_cents), { unit: "cents" }),
    figure("finance", "charges_issued", asNumber(raw.charges_issued)),
    figure("finance", "collected", asNumber(raw.collected_cents), { unit: "cents" }),
    figure("finance", "outstanding", asNumber(raw.outstanding_cents), { unit: "cents" }),
    figure("finance", "charges_overdue", asNumber(raw.charges_overdue)),
    figure("finance", "establishments_with_debt", asNumber(raw.establishments_with_debt)),
    figure("finance", "renewals_due", asNumber(raw.renewals_due)),
  ];
}

/**
 * §92 + §94 · las cifras digitales del periodo del informe, cada una con
 * su fecha y, si falta, con **el motivo** (§178): no conectada, todavía
 * sin datos, error, dato desactualizado o periodo insuficiente. Nunca un
 * hueco mudo y nunca un dato viejo presentado como actual (RN-REP-07).
 */
export function digitalFigures(
  pointsByProvider: ReadonlyMap<string, readonly MetricPoint[]>,
  states: readonly ProviderState[],
  period: { readonly start: string; readonly end: string },
  now: Date,
  /** La del espacio, para saber si el periodo ya está cerrado (CLAUDE.md). */
  timezone: string,
): readonly ReportFigure[] {
  const byProvider = new Map<IntegrationProvider, ProviderState>();
  for (const state of states) {
    if (isIntegrationProvider(state.provider)) byProvider.set(state.provider, state);
  }

  const window = { from: period.start, to: period.end };
  const figures: ReportFigure[] = [];

  /*
    RN-REP-04 y RN-REP-07 (§94) · **el estado de HOY de una integración no
    decide sobre un periodo CERRADO.** "Un informe se puede generar de un
    periodo cerrado meses después y sale lo mismo", y "los datos ya
    importados se conservan aunque cambie el plan o se desconecte la
    fuente".

    Lo que hacía antes: preguntaba `noDataReason()` con el estado actual,
    que devuelve "desactualizado" en cuanto la última sincronización pasa
    del doble de la frecuencia, y "no conectada" si la fuente se
    desconectó. Así, un restaurante que baja de plan en septiembre y pierde
    GA4 se quedaba sin las cifras de su informe de AGOSTO, que están
    enteras en `metric_points` y no necesitan ninguna API. Lo encontró la
    revisión del Hito 16 (14/09/2026).

    Cuándo sí importa el estado de hoy: cuando el periodo **llega hasta
    hoy**. Ahí "desactualizado" significa lo que dice —el dato del final
    del periodo puede no haber llegado— y es el caso que cubre RN-INT-07 en
    la pantalla de "Informes y datos". Para lo cerrado, lo que decide es la
    cobertura del periodo, que ya se calcula aparte.
  */
  const periodoCerrado = period.end < todayInTimeZone(now, timezone);

  for (const provider of INTEGRATION_PROVIDERS) {
    const state = byProvider.get(provider);
    const enVivo =
      state === undefined || !isIntegrationState(state.status)
        ? "not_connected"
        : noDataReason(
            provider,
            state.status,
            state.lastSuccessAt ? new Date(state.lastSuccessAt) : null,
            now,
          );
    // Nunca se conectó: no hay dato del periodo ni lo va a haber, y eso
    // vale igual para un periodo cerrado.
    const nuncaHuboDato = state === undefined || state.lastSuccessAt === null;
    const reason = periodoCerrado && !nuncaHuboDato ? null : enVivo;

    const providerPoints = pointsByProvider.get(provider) ?? [];

    for (const headline of HEADLINE_METRICS[provider]) {
      const value = headlineValue(providerPoints, headline, window);
      const insufficient = value.coveredDays > 0 && value.coveredDays < minimumCoveredDays(provider);

      figures.push(
        // Las cinco fuentes caen en la misma sección del informe
        // ("Rendimiento digital", maqueta 10.04); de cuál viene cada cifra
        // lo dice su dimensión, que es lo que la pantalla enseña.
        figure("digital", headline.metric, reason === null && !insufficient ? value.value : null, {
          dimension: provider,
          // RN-REP-07 · "cada cifra dice su fecha de última
          // sincronización". Era `lastPeriodEnd`, el último día que cubre
          // el dato, que es otra cosa: dos cifras traídas con tres semanas
          // de diferencia se pintaban idénticas.
          at: state?.lastSuccessAt ?? value.lastPeriodEnd ?? undefined,
          noDataReason:
            reason ?? (insufficient ? "insufficient_period" : value.value === null ? "no_data_yet" : undefined),
        }),
      );
    }
  }

  return figures;
}

// ---------------------------------------------------------------------
// 3 · Generar la versión
// ---------------------------------------------------------------------

/**
 * Las cifras de las tres familias para UN periodo. Se saca aparte porque
 * desde RN-REP-17 se pide dos veces —este periodo y el anterior— y tener
 * el cuerpo copiado sería la manera de que las dos mitades se separaran.
 */
async function figuresForPeriod(
  deps: ReportGenerationDeps,
  report: ReportRow,
  period: ReportPeriod,
  now: Date,
): Promise<readonly ReportFigure[]> {
  const figures: ReportFigure[] = [];

  {
    const [raw, holidayRecords] = await Promise.all([
      deps.gateway.operationDataset(report.spaceId, report.establishmentId, period.start, period.end),
      deps.gateway.holidays(report.spaceId),
    ]);
    // RN-CLK-10 · el calendario con los festivos que se conocían al
    // empezar el periodo, no con los de hoy: un festivo dado de alta la
    // semana pasada no reescribe el cumplimiento de hace dos meses.
    const holidays = holidaysKnownAsOf(holidayRecords, new Date(`${period.start}T00:00:00Z`));
    figures.push(...operationFigures(parseOperationDataset(raw), report.timezone, holidays, now));
  }

  {
    const raw = await deps.gateway.financeDataset(
      report.spaceId,
      report.establishmentId,
      period.start,
      period.end,
    );
    figures.push(...financeFigures(raw));
  }

  // Lo digital es por restaurante: un consolidado mezcla cinco fuentes de
  // varios y no hay una cifra que decir, así que no se inventa ninguna.
  if (report.establishmentId !== null) {
    const [points, states] = await Promise.all([
      deps.gateway.metricPoints(report.establishmentId, period.start, period.end),
      deps.gateway.providerStates(report.establishmentId),
    ]);
    figures.push(...digitalFigures(points, states, period, now, report.timezone));
  }

  return figures;
}

/** Corre una fecha ISO los días que se le digan, sin tocar zonas horarias. */
function isoShift(iso: string, days: number): string {
  const fecha = new Date(`${iso}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + days);
  return fecha.toISOString().slice(0, 10);
}

/**
 * RN-REP-25 · las métricas que se pueden sumar, que son las únicas con las
 * que tiene sentido comparar dos ventanas. Una posición media de Google
 * antes y después no se suma, y promediarla escondería que lo que cambió
 * fue el número de consultas y no la posición.
 */
function metricasSumables(): readonly { readonly provider: string; readonly metric: string }[] {
  return INTEGRATION_PROVIDERS.flatMap((provider) =>
    HEADLINE_METRICS[provider]
      .filter((headline) => headline.aggregate === "sum")
      .map((headline) => ({ provider, metric: headline.metric })),
  );
}

/** Los puntos del gateway, en la forma que espera `src/core/`. */
function seriesPorProveedor(
  points: ReadonlyMap<string, readonly MetricPoint[]>,
): ReadonlyMap<string, readonly SeriesPoint[]> {
  const mapa = new Map<string, readonly SeriesPoint[]>();
  for (const [provider, lista] of points) {
    mapa.set(
      provider,
      lista.map((punto) => ({
        metric: punto.metric,
        dimension: punto.dimension,
        periodStart: punto.period_start,
        value: punto.value,
      })),
    );
  }
  return mapa;
}

export async function buildSnapshot(deps: ReportGenerationDeps, report: ReportRow): Promise<ReportSnapshot> {
  const now = deps.now();
  const period = { start: report.periodStart, end: report.periodEnd };
  const incluidas = new Set(
    report.sections.filter((section) => section.included).map((section) => section.key),
  );
  const figures: ReportFigure[] = [];

  /*
    **Decisión 29 (14/09/2026) · la versión guarda las cifras de las tres
    familias, las marcara el equipo o no.** Antes se generaban solo las de
    las secciones incluidas, y eso convertía una decisión editorial en una
    pérdida de datos: si el equipo desmarcaba "Rendimiento digital", esa
    versión se quedaba sin una sola cifra digital para siempre, y verlas
    exigía regenerar —que es otra versión, con otras cifras, porque las
    fuentes se siguen sincronizando—. Ahora la versión trae el periodo
    entero y quien la mira elige qué mirar (`ReportFigures`).

    Lo que **no** se guarda entero, y es lo que separa un dato de una
    opinión: las **notas** del equipo, que se filtran abajo por sección
    incluida (RN-REP-13), y las **oportunidades**, que §99 manda decidir
    una a una. Las cifras son datos del propio restaurante y guardarlas
    enteras no le enseña nada del equipo; el texto interno, sí.

    Las cifras se generan **por familia de sección** y no por la familia
    del informe: la maqueta 10.04 dibuja un informe con Operación y
    Rendimiento digital a la vez, así que la familia dice de qué va el
    informe y las secciones dicen qué lleva dentro.
  */
  figures.push(...(await figuresForPeriod(deps, report, period, now)));

  /*
    RN-REP-17 (decisión 57) · la comparación con el periodo anterior.

    Se pide **el mismo periodo corrido hacia atrás** y se vuelven a calcular
    las cifras enteras. No hay atajo: una cifra de septiembre no se deduce
    de nada guardado, sale de los mismos datos del periodo, así que la
    única manera honesta es preguntarlos otra vez.

    **Cuesta el doble de consultas**, y se acepta a sabiendas: un informe se
    genera una vez y se lee muchas, y un número sin con qué compararlo no
    dice nada —"5.921 visitas" no es información hasta que se sabe si son
    muchas o pocas—.

    **El nivel decide hasta dónde llega** (RN-REP-15): un `basic` no la
    lleva y por eso **no se pide** el periodo anterior —no es que se
    calcule y se esconda—, un `standard` la lleva en "Lo esencial", y de
    `standard_plus` en adelante en todas.

    Si el periodo anterior falla, el informe **sale igual, sin
    comparación**: quedarse sin informe porque no se pudo mirar el mes
    pasado sería la peor de las dos opciones. Es el mismo criterio que
    `sanitize()` en el PDF.
  */
  const alcance = reportLevelComparison(report.reportLevel);
  let conAnterior: readonly ReportFigure[] = figures;
  if (alcance !== "none") {
    try {
      const anterior = previousPeriod(period);
      const figurasAnteriores = await figuresForPeriod(deps, report, anterior, now);
      conAnterior = withPreviousFigures(figures, figurasAnteriores, alcance);
    } catch {
      conAnterior = figures;
    }
  }

  /*
    §96 y §99 · las oportunidades que entran son las **aprobadas** de ese
    periodo, y se guardan con su regla y su sujeto, nunca con una frase: el
    título lo escribe la pantalla desde `es.ts`, igual que en el Hito 15.
    Las pendientes no entran — y además impiden el envío (§95, RN-REP-10).
  */
  const opportunities =
    incluidas.has("opportunities") && report.establishmentId !== null
      ? await deps.gateway.approvedOpportunities(report.establishmentId, period.start, period.end)
      : [];

  /*
    RN-REP-18 (decisión 57) · "Lo que ha pasado este mes".

    Se pide **solo si la sección entra**, y ahí se separa de las cifras a
    propósito: la decisión 29 manda guardar las cifras de las tres familias
    aunque el equipo las desmarque, porque son datos del restaurante y
    verlas después exigiría regenerar. El relato no es eso: es una LISTA
    que puede tener cientos de filas y que no se resume en nada. Guardarla
    en una versión donde nadie la va a leer engorda cada versión del libro
    inmutable para siempre.

    `includeFinance` sale de la sección de Finanzas de **este** informe, no
    de quien llama (RN-REP-16): sin ella, el relato no cuenta ni un cobro.
    Un informe que sí la lleva ya solo lo ve quien tiene "Pagos y
    facturas", así que el dinero no alcanza a nadie que no pudiera verlo.
  */
  const activity = incluidas.has("month_activity")
    ? parseMonthActivity(
        await deps.gateway.monthActivity(
          report.spaceId,
          report.establishmentId,
          period.start,
          period.end,
          incluidas.has("finance"),
        ),
      )
    : EMPTY_MONTH_ACTIVITY;

  /*
    RN-REP-20 (decisión 58) · la bolsa del mes, a la cabeza del relato.

    Va con el relato y no con la sección de Operación a propósito: desde la
    decisión 58 un informe `basic` **no lleva Operación** —ahí viven los
    plazos y los tiempos, que es lo que Básico no paga— pero sí lleva su
    bolsa, porque es lo que gastó y no una lectura de cómo lo gastó.
  */
  const allowance = incluidas.has("month_activity")
    ? parseChangeAllowance(
        await deps.gateway.changeAllowance(
          report.spaceId,
          report.establishmentId,
          period.start,
          period.end,
        ),
      )
    : [];

  /*
    RN-REP-21 a 26 (decisión 60) · lo que añade Premium+.

    **Todo cuelga de un solo `if`**, y es a propósito: el nivel es una
    barrera y no una sugerencia (RN-REP-15), así que lo que no alcanza
    `complete` **no se pide** —igual que un `basic` no pide el periodo
    anterior—. Ni se calcula y se esconde, que sería pagar el coste sin
    dar el servicio y dejar el dato a un `select` de distancia.

    **Si algo de esto falla, el informe sale igual sin ello.** Es el mismo
    criterio que la comparación de RN-REP-17: quedarse sin informe porque
    no se pudo leer el año pasado sería la peor de las dos opciones.
  */
  const completo = report.reportLevel === "complete";
  let conAnio: readonly ReportFigure[] = conAnterior;
  let timings: readonly ChangeTiming[] = [];
  let evolution: readonly WeeklySeries[] = [];
  let evolutionBuckets: readonly WeekBucket[] = [];
  let effects: readonly ChangeEffect[] = [];
  let usage: readonly PlanUsageLine[] = [];
  let followUp: readonly OpportunityFollowUpLine[] = [];

  if (completo) {
    // RN-REP-23 · el mismo mes del año pasado. En hostelería es la
    // comparación que significa algo: septiembre contra agosto es en
    // buena parte temporada.
    try {
      const haceUnAnio = await figuresForPeriod(deps, report, sameMonthLastYear(period), now);
      conAnio = withYearAgoFigures(conAnterior, haceUnAnio);
    } catch {
      conAnio = conAnterior;
    }

    // RN-REP-21 · los tiempos de cada cambio. Sale del mismo dataset que
    // los indicadores, con el mismo calendario de festivos: si se pidiera
    // otro, dos cifras del mismo informe medirían meses distintos.
    try {
      const [raw, holidayRecords] = await Promise.all([
        deps.gateway.operationDataset(report.spaceId, report.establishmentId, period.start, period.end),
        deps.gateway.holidays(report.spaceId),
      ]);
      const dataset = parseOperationDataset(raw);
      const holidays = holidaysKnownAsOf(holidayRecords, new Date(`${period.start}T00:00:00Z`));
      const calendar = contractualCalendar(report.timezone, holidays);

      timings = changeTimings(
        dataset.jobs.map((job) => ({
          jobId: job.id,
          requestCode: job.requestCode ?? null,
          requestAcceptedAt: job.requestAcceptedAt ?? null,
          category: job.category,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          startSlaHours: job.startSlaHours ?? null,
        })),
        dataset.blocks.map((block) => ({
          jobId: block.jobId,
          startedAt: block.startedAt,
          endedAt: block.endedAt,
          reason: block.reason ?? null,
        })),
        calendar,
        now,
      );

      // RN-REP-25 · los cambios PUBLICADOS del periodo, que son los que
      // pueden haber movido una cifra. Uno sin publicar todavía no ha
      // llegado a la web del restaurante y no hay nada que medir.
      const publicados: PublishedChange[] = dataset.jobs
        .filter((job) => job.publishedAt !== null && (job.requestCode ?? null) !== null)
        .map((job) => ({
          code: job.requestCode as string,
          publishedOn: job.publishedAt!.toISOString().slice(0, 10),
        }));

      if (report.establishmentId !== null && publicados.length > 0) {
        // La ventana se ensancha 14 días por cada lado del periodo: es lo
        // único que cambia respecto a lo que ya se pide para las cifras.
        const puntos = await deps.gateway.metricPoints(
          report.establishmentId,
          isoShift(period.start, -CHANGE_EFFECT_WINDOW_DAYS),
          isoShift(period.end, CHANGE_EFFECT_WINDOW_DAYS),
        );
        effects = changeEffects(
          publicados,
          metricasSumables(),
          seriesPorProveedor(puntos),
          todayInTimeZone(now, report.timezone),
        );
      }
    } catch {
      timings = [];
      effects = [];
    }

    // RN-REP-22 · la evolución dentro del mes.
    if (report.establishmentId !== null) {
      try {
        const puntos = await deps.gateway.metricPoints(report.establishmentId, period.start, period.end);
        const series = seriesPorProveedor(puntos);
        evolutionBuckets = weekBuckets(period);
        evolution = INTEGRATION_PROVIDERS.flatMap((provider) =>
          HEADLINE_METRICS[provider].map((headline) =>
            weeklySeries(
              provider,
              headline.metric,
              headline.aggregate,
              series.get(provider) ?? [],
              evolutionBuckets,
            ),
          ),
        // Una serie entera sin un solo dato no se dibuja: sería una
        // rejilla vacía con nombre de métrica, que es el relleno que
        // CLAUDE.md prohíbe.
        ).filter((serie) => serie.values.some((valor) => valor !== null));
      } catch {
        evolution = [];
        evolutionBuckets = [];
      }
    }

    if (report.establishmentId !== null) {
      // RN-REP-26 · el aprovechamiento del plan en la permanencia.
      try {
        const datos = await deps.gateway.planUsageData(report.establishmentId);
        usage = planUsage(datos.cycles, datos.entries, todayInTimeZone(now, report.timezone));
      } catch {
        usage = [];
      }

      // RN-REP-24 · qué pasó con las oportunidades del informe anterior.
      try {
        const anteriores = await deps.gateway.previousReportOpportunities(
          report.establishmentId,
          period.start,
        );
        followUp = anteriores.map((fila) => ({
          id: fila.id,
          rule: fila.rule,
          subject: fila.subject,
          title: fila.title,
          state: opportunityFollowUp(fila.status),
        }));
      } catch {
        followUp = [];
      }
    }
  }

  return {
    category: report.category,
    period,
    generatedAt: now.toISOString(),
    sections: report.sections,
    figures: conAnio,
    activity,
    allowance,
    timings,
    evolution,
    evolutionBuckets,
    effects,
    planUsage: usage,
    followUp,
    opportunities,
    // RN-REP-13 · solo las notas de las secciones que ENTRAN. La versión
    // se le envía al restaurante, y una nota de una sección que el equipo
    // desmarcó es preparación interna: el PDF no la pinta, pero viajaba
    // dentro del `snapshot` y desde ahí se leía. Lo encontró la revisión
    // del Hito 16 (14/09/2026).
    notes: Object.fromEntries(
      Object.entries(report.notes).filter(([key]) =>
        report.sections.some((section) => section.key === key && section.included),
      ),
    ),
  };
}

/** Genera y guarda una versión nueva (§95.1, RN-REP-12). */
export async function generateReportVersion(deps: ReportGenerationDeps, reportId: string): Promise<string> {
  const report = await deps.gateway.report(reportId);
  if (report === null) throw new Error("Informe no encontrado");
  const snapshot = await buildSnapshot(deps, report);
  return deps.gateway.storeVersion(reportId, snapshot);
}

// ---------------------------------------------------------------------
// 4 · La tanda de la cola: avisar y enviar (§93, §95)
// ---------------------------------------------------------------------

export interface ReportQueueResult {
  readonly reminded: number;
  readonly sent: number;
  readonly blocked: number;
  readonly failed: number;
}

/**
 * Lo que hace la cola con los informes, en el orden en que importa:
 *
 *   1. **Avisar** de los que tienen la fecha a menos de 24 h (§95), para
 *      que quien aprueba pueda pararlos. Primero esto: avisar después de
 *      enviar no serviría de nada.
 *   2. **Enviar** los que ya vencieron. El freno de §95 —oportunidades
 *      pendientes— lo aplica `send_report()` en la base, que devuelve -1
 *      y deja el informe en revisión; aquí solo se cuenta.
 *
 * Un informe que falle no tumba a los demás: se cuenta y se sigue, como en
 * el resto de la cola.
 */
export async function runReportQueue(deps: ReportGenerationDeps): Promise<ReportQueueResult> {
  let reminded = 0;
  let sent = 0;
  let blocked = 0;
  let failed = 0;

  const due = await deps.gateway.reportsDueForReminder(REPORTS_PER_BATCH);
  for (const reportId of due) {
    try {
      reminded += await deps.gateway.notifyScheduleDueSoon(reportId);
    } catch {
      failed += 1;
    }
  }

  const toSend = await deps.gateway.reportsDueForSend(REPORTS_PER_BATCH);
  for (const reportId of toSend) {
    try {
      const result = await deps.gateway.send(reportId);
      if (result < 0) {
        blocked += 1;
      } else {
        sent += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return { reminded, sent, blocked, failed };
}
