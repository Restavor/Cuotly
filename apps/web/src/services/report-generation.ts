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
    figure("operation_requests", "requests_received", indicators.requestsReceived),
    figure("operation_requests", "requests_accepted", indicators.requestsAccepted),
    figure("operation_requests", "requests_rejected", indicators.requestsRejected),
    figure("operation_requests", "requests_cancelled", indicators.requestsCancelled),
    figure("operation_jobs", "jobs_started", indicators.jobsStarted),
    figure("operation_jobs", "jobs_completed", indicators.jobsCompleted),
    figure("operation_jobs", "jobs_pending", indicators.jobsPending),
    figure("operation_deadlines", "start_compliance", indicators.startCompliancePercent, { unit: "percent" }),
    figure("operation_deadlines", "execution_compliance", indicators.executionCompliancePercent, { unit: "percent" }),
    figure("operation_deadlines", "average_start", indicators.averageStartMinutes, { unit: "business_minutes" }),
    figure("operation_deadlines", "average_completion", indicators.averageCompletionMinutes, { unit: "business_minutes" }),
    figure("operation_blocks", "jobs_blocked", indicators.jobsBlocked),
    figure("operation_blocks", "blocked_time", indicators.blockedMinutes, { unit: "minutes" }),
    figure("operation_blocks", "corrections_requested", indicators.correctionsRequested),
    ...(["small", "photo", "medium", "large"] as const).map((category) =>
      figure("operation_consumption", "consumption", indicators.consumptionByCategory[category], {
        dimension: category,
        unit: "changes",
      }),
    ),
    figure("operation_menus", "menu_updates_used", indicators.menuUpdatesUsed, { unit: "updates" }),
    figure("operation_menus", "menus_published", indicators.menusPublished),
    figure("operation_menus", "menus_out_of_guarantee", indicators.menusOutOfGuarantee),
  ];
}

/** §89.2 · ingresos, cobros, impagos y renovaciones. */
export function financeFigures(raw: Record<string, unknown>): readonly ReportFigure[] {
  return [
    figure("finance_income", "income_base", asNumber(raw.income_base_cents), { unit: "cents" }),
    figure("finance_income", "income_total", asNumber(raw.income_total_cents), { unit: "cents" }),
    figure("finance_charges", "charges_issued", asNumber(raw.charges_issued)),
    figure("finance_charges", "collected", asNumber(raw.collected_cents), { unit: "cents" }),
    figure("finance_charges", "outstanding", asNumber(raw.outstanding_cents), { unit: "cents" }),
    figure("finance_nonpayment", "charges_overdue", asNumber(raw.charges_overdue)),
    figure("finance_nonpayment", "establishments_with_debt", asNumber(raw.establishments_with_debt)),
    figure("finance_renewals", "renewals_due", asNumber(raw.renewals_due)),
  ];
}

const SECTION_BY_PROVIDER: Readonly<Record<IntegrationProvider, ReportSectionKey>> = {
  ga4: "digital_traffic",
  // Business Profile va con Search Console: lo que mide es visibilidad en
  // Google, igual que el buscador (decisión 25h).
  search_console: "digital_search",
  business_profile: "digital_search",
  clarity: "digital_behaviour",
  pagespeed: "digital_performance",
};

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
): readonly ReportFigure[] {
  const byProvider = new Map<IntegrationProvider, ProviderState>();
  for (const state of states) {
    if (isIntegrationProvider(state.provider)) byProvider.set(state.provider, state);
  }

  const window = { from: period.start, to: period.end };
  const figures: ReportFigure[] = [];

  for (const provider of INTEGRATION_PROVIDERS) {
    const section = SECTION_BY_PROVIDER[provider];
    const state = byProvider.get(provider);
    const reason =
      state === undefined || !isIntegrationState(state.status)
        ? "not_connected"
        : noDataReason(
            provider,
            state.status,
            state.lastSuccessAt ? new Date(state.lastSuccessAt) : null,
            now,
          );

    const providerPoints = pointsByProvider.get(provider) ?? [];

    for (const headline of HEADLINE_METRICS[provider]) {
      const value = headlineValue(providerPoints, headline, window);
      const insufficient = value.coveredDays > 0 && value.coveredDays < minimumCoveredDays(provider);

      figures.push(
        figure(section, headline.metric, reason === null && !insufficient ? value.value : null, {
          dimension: provider,
          at: value.lastPeriodEnd ?? undefined,
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
  let figures: readonly ReportFigure[] = [];

  if (report.category === "operation") {
    const [raw, holidayRecords] = await Promise.all([
      deps.gateway.operationDataset(report.spaceId, report.establishmentId, period.start, period.end),
      deps.gateway.holidays(report.spaceId),
    ]);
    const dataset = parseOperationDataset(raw);
    // RN-CLK-10 · el calendario con los festivos que se conocían al
    // empezar el periodo, no con los de hoy: un festivo dado de alta la
    // semana pasada no reescribe el cumplimiento de hace dos meses.
    const holidays = holidaysKnownAsOf(holidayRecords, new Date(`${period.start}T00:00:00Z`));
    figures = operationFigures(dataset, report.timezone, holidays, now);
  } else if (report.category === "finance") {
    const raw = await deps.gateway.financeDataset(
      report.spaceId,
      report.establishmentId,
      period.start,
      period.end,
    );
    figures = financeFigures(raw);
  } else if (report.establishmentId !== null) {
    const [points, states] = await Promise.all([
      deps.gateway.metricPoints(report.establishmentId, period.start, period.end),
      deps.gateway.providerStates(report.establishmentId),
    ]);
    figures = digitalFigures(points, states, period, now);
  }

  return {
    category: report.category,
    period,
    generatedAt: now.toISOString(),
    sections: report.sections,
    figures,
    notes: report.notes,
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
