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
  type ReportRequestRow,
  type ReportSectionKey,
  type ReportSnapshot,
  operationalIndicators,
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
  }));

  const blocks: ReportBlockRow[] = asArray(raw.blocks).map((row) => ({
    jobId: String(row.job_id),
    startedAt: asDate(row.started_at) ?? new Date(0),
    endedAt: asDate(row.ended_at),
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

export async function buildSnapshot(deps: ReportGenerationDeps, report: ReportRow): Promise<ReportSnapshot> {
  const now = deps.now();
  const period = { start: report.periodStart, end: report.periodEnd };
  const incluidas = new Set(
    report.sections.filter((section) => section.included).map((section) => section.key),
  );
  const figures: ReportFigure[] = [];

  /*
    Las cifras se generan **por sección incluida**, no por familia: la
    maqueta 10.04 dibuja un informe con Operación y Rendimiento digital a
    la vez, así que la familia dice de qué va el informe y las secciones
    dicen qué lleva dentro. Generar por familia habría dejado esa sección
    vacía sin que nadie entendiera por qué.
  */
  if (incluidas.has("operation")) {
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

  if (incluidas.has("finance")) {
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
  if (incluidas.has("digital") && report.establishmentId !== null) {
    const [points, states] = await Promise.all([
      deps.gateway.metricPoints(report.establishmentId, period.start, period.end),
      deps.gateway.providerStates(report.establishmentId),
    ]);
    figures.push(...digitalFigures(points, states, period, now, report.timezone));
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

  return {
    category: report.category,
    period,
    generatedAt: now.toISOString(),
    sections: report.sections,
    figures,
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
