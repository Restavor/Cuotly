/**
 * `src/core/reports.ts` — informes (PRD §29, RN-REP; §89 a §95 de la
 * maestra; Fase 3, Hito 16). Lógica de dominio pura, sin Supabase, sin
 * Next y sin React (CLAUDE.md).
 *
 * Qué decide este archivo y qué no:
 *
 *   · **Los diez indicadores de §91** (RN-REP-03). Están aquí y no en SQL
 *     porque el cumplimiento de plazos y los tiempos medios se miden con
 *     el **reloj contractual** (`business-clock.ts`), y CLAUDE.md prohíbe
 *     duplicar la lógica de dominio en la base. Es la misma razón por la
 *     que los umbrales de T2 y T3 los calcula el proceso de la cola.
 *   · **Los seis estados de §95** y quién mueve cada uno (RN-REP-08). La
 *     tabla está duplicada a propósito con `report_transition_allowed()`
 *     de la migración 85: son dos sistemas que no pueden importarse el
 *     uno al otro, y `listas-compartidas.test.ts` vigila que no se
 *     separen.
 *   · **Qué secciones requieren criterio** (§95.3, RN-REP-09), que es lo
 *     que decide si un informe puede enviarse automáticamente (§95,
 *     RN-REP-10).
 *   · **El CSV** (§93, RN-REP-06), que es una representación de la
 *     versión y no un segundo original.
 *
 * Lo que NO está aquí:
 *
 *   · **El texto.** Un informe guarda cifras, claves de sección y fechas;
 *     los títulos, los nombres de las secciones y los motivos en español
 *     los escribe la pantalla desde `src/i18n/es.ts` (CLAUDE.md). El
 *     nombre del informe lo escribe una persona, y por eso sí se guarda.
 *   · **El control de acceso.** Quién aprueba, quién envía y qué ve el
 *     restaurante lo vuelve a decidir el servidor (migración 85). Lo de
 *     aquí es la misma cuenta, para que la pantalla no ofrezca un botón
 *     que el servidor va a rechazar.
 *   · **La IA.** §93: "el informe automático por correo no necesita IA".
 *     Ninguna función de este archivo la usa ni la puede usar.
 */

import { type WorkCalendar, businessMinutesBetween } from "./business-clock";
import type { ChangeCategory } from "./classification-rules";
// El día en la zona del espacio ya está resuelto una vez en el dominio
// (`finance.ts`); tener una segunda copia aquí es exactamente la clase de
// duplicado que el barrido de `i18n/dates.test.ts` existe para impedir.
import { todayInTimeZone } from "./finance";
import { t2Status, t3Status } from "./sla-timers";
import type { TimerEvent } from "./timer-events";

// ---------------------------------------------------------------------
// 1 · Las tres familias (§89) y las secciones de cada una (§95)
// ---------------------------------------------------------------------

/** §89 · "Operación · Finanzas · Rendimiento digital". Ni una más. */
export const REPORT_CATEGORIES = ["operation", "finance", "digital"] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export function isReportCategory(value: string): value is ReportCategory {
  return (REPORT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Las secciones que puede llevar un informe. **Son las de la maqueta
 * 10.04**, no una lista inventada: "Resumen ejecutivo · Operación ·
 * Rendimiento digital · Oportunidades · Anexos y evidencias", más
 * **Finanzas**, que la maqueta no dibuja porque dibuja un informe de
 * operación pero que §89 da como una de las tres familias.
 *
 * La primera versión de este archivo tenía diecinueve secciones —una por
 * cada bloque de cifras— y eso era una invención: la maqueta ofrece cinco
 * casillas y el índice del PDF lista cinco entradas. Lo fino no se pierde,
 * se mueve: cada sección agrupa sus cifras dentro.
 *
 * `requiresJudgement` es §95.3 ("muestra las secciones que requieren
 * criterio"): lo que una persona tiene que **escribir o elegir**. Son dos
 * —el resumen ejecutivo, que lo escribe alguien, y las oportunidades, que
 * §99 vuelve a decidir una a una—; el resto son cifras y no piden opinión
 * de nadie. Requerir criterio **no** es lo mismo que entrar apagada: la
 * maqueta dibuja el resumen ejecutivo marcado y las oportunidades sin
 * marcar, y eso es lo que se hace.
 */
export interface ReportSectionDefinition {
  readonly key: ReportSectionKey;
  readonly requiresJudgement: boolean;
}

export const REPORT_SECTION_KEYS = [
  "executive_summary",
  "operation",
  "finance",
  "digital",
  "opportunities",
  "annexes",
] as const;
export type ReportSectionKey = (typeof REPORT_SECTION_KEYS)[number];

export function isReportSectionKey(value: string): value is ReportSectionKey {
  return (REPORT_SECTION_KEYS as readonly string[]).includes(value);
}

/** Las dos que requieren criterio (§95.3). */
export const JUDGEMENT_SECTIONS: readonly ReportSectionKey[] = ["executive_summary", "opportunities"];

export function sectionRequiresJudgement(key: ReportSectionKey): boolean {
  return JUDGEMENT_SECTIONS.includes(key);
}

/** Qué sección trae las cifras de cada familia (§89). */
export const SECTION_OF_CATEGORY: Readonly<Record<ReportCategory, ReportSectionKey>> = {
  operation: "operation",
  finance: "finance",
  digital: "digital",
};

/**
 * Qué entra marcado al preparar el borrador: el **resumen ejecutivo**, la
 * sección de **su familia** y los **anexos**; las demás se añaden a mano,
 * y las **oportunidades** nunca entran solas (§99: "Incluir en informe" se
 * vuelve a decidir).
 *
 * La maqueta 10.04 dibuja además "Rendimiento digital" marcado en un
 * informe que lleva operación. Se ha leído como que esa persona lo añadió
 * y no como el valor por omisión: encender por omisión una sección que
 * puede no tener ninguna fuente conectada llenaría el informe de motivos
 * de "no conectado" (§178) en vez de cifras. Es una lectura aplicada
 * (decisión 28a de `docs/DECISIONES.md`) y se cambia en una línea.
 */
export function defaultIncluded(category: ReportCategory, key: ReportSectionKey): boolean {
  return key === "executive_summary" || key === "annexes" || key === SECTION_OF_CATEGORY[category];
}

export function reportSectionCatalogue(): readonly ReportSectionDefinition[] {
  return REPORT_SECTION_KEYS.map((key) => ({ key, requiresJudgement: sectionRequiresJudgement(key) }));
}

/** Una sección tal y como se guarda: incluida o no, y en qué orden. */
export interface ReportSectionState {
  readonly key: ReportSectionKey;
  readonly position: number;
  readonly included: boolean;
}

export function defaultSections(category: ReportCategory): readonly ReportSectionState[] {
  return REPORT_SECTION_KEYS.map((key, index) => ({
    key,
    position: index + 1,
    included: defaultIncluded(category, key),
  }));
}

/**
 * §95 · "Informes solo objetivos pueden enviarse automáticamente". Un
 * informe es objetivo cuando ninguna sección **incluida** requiere
 * criterio; entonces puede programarse sin pasar por aprobación.
 */
export function isObjectiveOnly(sections: readonly ReportSectionState[]): boolean {
  return sections.every((section) => !section.included || !sectionRequiresJudgement(section.key));
}

// ---------------------------------------------------------------------
// 2 · Los seis estados de §95 (RN-REP-08)
// ---------------------------------------------------------------------

export const REPORT_STATES = [
  "preparing",
  "pending_review",
  "approved",
  "scheduled",
  "sent",
  "archived",
] as const;
export type ReportState = (typeof REPORT_STATES)[number];

export function isReportState(value: string): value is ReportState {
  return (REPORT_STATES as readonly string[]).includes(value);
}

/**
 * Quién mueve el informe: `editor` es quien gestiona la cartera —el
 * propietario y los administradores, que es a quien §89 le da los
 * informes— y `approver` es el propietario o el administrador **con
 * "Aprobar informes"** (§95.4, RN-REP-08). El trabajador no aparece: §89
 * no le da los informes de un restaurante y lo que §90 le da es el suyo
 * personal, que no pasa por estos estados.
 */
export type ReportActor = "editor" | "approver";

/**
 * La misma tabla que `report_transition_allowed()` de la migración 85.
 *
 * Tres cosas que se leen mejor aquí que en la lista:
 *   · de `preparing` se sale a revisión (lo normal) o directamente a
 *     `scheduled`, **pero solo si el informe es objetivo** (§95); esa
 *     condición no está en esta tabla porque depende de las secciones, y
 *     la comprueba `canScheduleWithoutApproval()`;
 *   · `sent` no vuelve atrás: lo enviado está fuera, y un informe con una
 *     corrección es una **versión nueva**, no una marcha atrás (P4);
 *   · a `archived` se llega desde cualquier estado salvo `archived`, que
 *     es §95 ("Archivado") y RN-DAT-08 (no se borra, se archiva).
 */
const TRANSITIONS: Readonly<Record<ReportState, Readonly<Record<ReportState, readonly ReportActor[]>>>> = {
  preparing: {
    preparing: [],
    pending_review: ["editor", "approver"],
    approved: ["approver"],
    scheduled: ["approver"],
    sent: [],
    archived: ["approver"],
  },
  pending_review: {
    preparing: ["editor", "approver"],
    pending_review: [],
    approved: ["approver"],
    scheduled: [],
    sent: [],
    archived: ["approver"],
  },
  approved: {
    // Editar un informe aprobado lo devuelve a revisión (RN-REP-09): un
    // informe aprobado es un texto concreto, no una carpeta que sigue
    // cambiando.
    preparing: [],
    pending_review: ["editor", "approver"],
    approved: [],
    scheduled: ["approver"],
    sent: ["approver"],
    archived: ["approver"],
  },
  scheduled: {
    preparing: [],
    // §95 · si al llegar la fecha hay oportunidades pendientes, el envío
    // se detiene y el informe vuelve a revisión (RN-REP-10).
    pending_review: ["approver"],
    approved: ["approver"],
    scheduled: [],
    sent: ["approver"],
    archived: ["approver"],
  },
  sent: {
    preparing: [],
    pending_review: [],
    approved: [],
    scheduled: [],
    sent: [],
    archived: ["approver"],
  },
  archived: {
    preparing: [],
    pending_review: [],
    approved: [],
    scheduled: [],
    sent: [],
    archived: [],
  },
};

export function reportTransitionAllowed(from: ReportState, to: ReportState, actor: ReportActor): boolean {
  return TRANSITIONS[from][to].includes(actor);
}

/** Los estados que el restaurante puede ver (RN-REP-13). */
export function reportIsVisibleToClient(state: ReportState): boolean {
  return state === "sent" || state === "archived";
}

/**
 * §95 · un informe solo objetivo se programa sin aprobación; uno que
 * lleva una sección de criterio, no. Devolver el motivo y no un booleano
 * es lo que permite que la pantalla diga por qué (CA-20).
 */
export type ScheduleWithoutApproval = { readonly allowed: true } | { readonly allowed: false; readonly reason: "needs_judgement" };

export function canScheduleWithoutApproval(sections: readonly ReportSectionState[]): ScheduleWithoutApproval {
  return isObjectiveOnly(sections) ? { allowed: true } : { allowed: false, reason: "needs_judgement" };
}

// ---------------------------------------------------------------------
// 3 · Oportunidades pendientes y el aviso de la fecha (§95, RN-REP-10/11)
// ---------------------------------------------------------------------

/**
 * §95 · "Si hay oportunidades pendientes, no se envía hasta aprobación".
 * Pendiente es lo que todavía está en conversación del equipo: detectada,
 * recomendada o en revisión. Descartada no es pendiente (ya se decidió) y
 * aprobada tampoco (por eso entra en el informe).
 */
export const PENDING_OPPORTUNITY_STATUSES: readonly string[] = ["detected", "recommended", "under_review"];

export function opportunityIsPending(status: string): boolean {
  return PENDING_OPPORTUNITY_STATUSES.includes(status);
}

/**
 * ¿Se puede enviar este informe? Solo mira lo que §95 dice que lo
 * detiene: la sección de oportunidades incluida con alguna pendiente del
 * periodo. Un informe que no habla de oportunidades sale igual.
 */
export type SendGate =
  | { readonly canSend: true }
  | { readonly canSend: false; readonly reason: "pending_opportunities"; readonly pendingCount: number };

export function sendGate(input: {
  readonly sections: readonly ReportSectionState[];
  readonly pendingOpportunityCount: number;
}): SendGate {
  const includesOpportunities = input.sections.some(
    (section) => section.key === "opportunities" && section.included,
  );
  if (!includesOpportunities || input.pendingOpportunityCount === 0) {
    return { canSend: true };
  }
  return { canSend: false, reason: "pending_opportunities", pendingCount: input.pendingOpportunityCount };
}

/**
 * §95 · "Cuotly avisa cuando se acerca la fecha programada". Cuánto es
 * "se acerca" no lo dice la maestra: **24 horas antes** es lectura
 * confirmada por Bosco (decisión 28b). Se eligen 24 h y no 1 h porque el aviso sirve
 * para poder pararlo o corregirlo, y eso necesita una jornada por delante.
 */
export const SCHEDULE_REMINDER_HOURS = 24;

export function scheduleReminderAt(scheduledFor: Date): Date {
  return new Date(scheduledFor.getTime() - SCHEDULE_REMINDER_HOURS * 60 * 60 * 1000);
}

export function scheduleReminderDue(scheduledFor: Date, now: Date): boolean {
  return now.getTime() >= scheduleReminderAt(scheduledFor).getTime() && now.getTime() < scheduledFor.getTime();
}

export function sendIsDue(scheduledFor: Date, now: Date): boolean {
  return now.getTime() >= scheduledFor.getTime();
}

// ---------------------------------------------------------------------
// 4 · El periodo y los filtros (§93, RN-REP-05)
// ---------------------------------------------------------------------

export interface ReportPeriod {
  /** `YYYY-MM-DD`, incluido. */
  readonly start: string;
  /** `YYYY-MM-DD`, incluido. */
  readonly end: string;
}

/**
 * El periodo por omisión: el **último mes natural cerrado** en la zona
 * del espacio (RN-REP-05). No es la ventana de 28 días de "Informes y
 * datos" (decisión 25b) y se dice a propósito: un informe se manda por
 * meses —lo que dibuja la vista 10.01— y la analítica se mira en
 * ventanas móviles.
 */
export function defaultReportPeriod(now: Date, timeZone: string): ReportPeriod {
  const today = todayInTimeZone(now, timeZone);
  const [year, month] = today.split("-").map((part) => Number(part));
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  return {
    start: `${pad(previousYear, 4)}-${pad(previousMonth, 2)}-01`,
    end: `${pad(previousYear, 4)}-${pad(previousMonth, 2)}-${pad(daysInMonth(previousYear, previousMonth), 2)}`,
  };
}

export function periodContains(period: ReportPeriod, dayIso: string): boolean {
  return dayIso >= period.start && dayIso <= period.end;
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Los **ocho** filtros de §93, ni uno más. Vacío significa "todos": es lo
 * que la vista 10.01 llama "Todos los restaurantes" / "Todas".
 */
export interface ReportFilters {
  readonly period: ReportPeriod;
  readonly establishmentIds: readonly string[];
  readonly groupIds: readonly string[];
  readonly planIds: readonly string[];
  readonly workerIds: readonly string[];
  readonly changeCategories: readonly ChangeCategory[];
  readonly states: readonly string[];
  readonly serviceIds: readonly string[];
}

export function emptyFilters(period: ReportPeriod): ReportFilters {
  return {
    period,
    establishmentIds: [],
    groupIds: [],
    planIds: [],
    workerIds: [],
    changeCategories: [],
    states: [],
    serviceIds: [],
  };
}

/** Lo que se guarda en `reports.filters`, sin nada que no sea de §93. */
export function serializeFilters(filters: ReportFilters): Record<string, unknown> {
  return {
    period_start: filters.period.start,
    period_end: filters.period.end,
    establishment_ids: [...filters.establishmentIds],
    group_ids: [...filters.groupIds],
    plan_ids: [...filters.planIds],
    worker_ids: [...filters.workerIds],
    change_categories: [...filters.changeCategories],
    states: [...filters.states],
    service_ids: [...filters.serviceIds],
  };
}

export function parseFilters(raw: unknown, fallback: ReportPeriod): ReportFilters {
  const value = (raw ?? {}) as Record<string, unknown>;
  const start = typeof value.period_start === "string" ? value.period_start : fallback.start;
  const end = typeof value.period_end === "string" ? value.period_end : fallback.end;
  return {
    period: { start, end },
    establishmentIds: stringList(value.establishment_ids),
    groupIds: stringList(value.group_ids),
    planIds: stringList(value.plan_ids),
    workerIds: stringList(value.worker_ids),
    changeCategories: stringList(value.change_categories).filter(isChangeCategory),
    states: stringList(value.states),
    serviceIds: stringList(value.service_ids),
  };
}

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isChangeCategory(value: string): value is ChangeCategory {
  return value === "small" || value === "photo" || value === "medium" || value === "large";
}

// ---------------------------------------------------------------------
// 5 · Los diez indicadores de §91 (RN-REP-03)
// ---------------------------------------------------------------------

/**
 * Lo que la base entrega de cada trabajo del periodo. Son filas, no
 * cuentas: las cuentas se hacen aquí, con el reloj, porque una media de
 * horas laborables no se puede calcular en SQL sin duplicar
 * `business-clock.ts`.
 */
export interface ReportJobRow {
  readonly id: string;
  readonly establishmentId: string;
  readonly category: ChangeCategory;
  readonly state: string;
  readonly assigneeId: string | null;
  readonly planId: string | null;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly publishedAt: Date | null;
  readonly completedAt: Date | null;
  /** RN-SLA-04: el plan acelerado acorta T1 y T2. */
  readonly hasAcceleratedSla: boolean;
  readonly t2Events: readonly TimerEvent[];
  readonly t3Events: readonly TimerEvent[];
}

export interface ReportRequestRow {
  readonly id: string;
  readonly establishmentId: string;
  readonly state: string;
  readonly createdAt: Date;
}

export interface ReportBlockRow {
  readonly jobId: string;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
}

export interface ReportConsumptionRow {
  readonly establishmentId: string;
  readonly category: ChangeCategory;
  /** Con signo, como manda el libro (RN-CON): los débitos son negativos. */
  readonly amount: number;
}

export interface ReportMenuRow {
  readonly establishmentId: string;
  readonly publishedAt: Date | null;
  /** RN-MEN-08 · §62: si se publicó dentro de la garantía horaria. */
  readonly withinGuarantee: boolean;
}

export interface OperationDataset {
  readonly requests: readonly ReportRequestRow[];
  readonly jobs: readonly ReportJobRow[];
  readonly blocks: readonly ReportBlockRow[];
  readonly consumption: readonly ReportConsumptionRow[];
  readonly menus: readonly ReportMenuRow[];
  readonly correctionsRequested: number;
  /** RN-MEN-04 · actualizaciones de Menú Diario gastadas en el periodo. */
  readonly menuUpdatesUsed: number;
}

/** Los diez indicadores de §91, en el orden en que §91 los enumera. */
export interface OperationalIndicators {
  readonly requestsReceived: number;
  readonly requestsAccepted: number;
  readonly requestsRejected: number;
  readonly requestsCancelled: number;
  readonly jobsStarted: number;
  readonly jobsCompleted: number;
  readonly jobsPending: number;
  /** Porcentaje de trabajos arrancados dentro de T2, o `null` si no hubo ninguno. */
  readonly startCompliancePercent: number | null;
  /** Porcentaje de trabajos publicados dentro de T3, o `null` si no hubo ninguno. */
  readonly executionCompliancePercent: number | null;
  /** Medias en **minutos laborables** (RN-CLK), no en horas de calendario. */
  readonly averageStartMinutes: number | null;
  readonly averageCompletionMinutes: number | null;
  readonly jobsBlocked: number;
  /** Duración bloqueada en minutos **de calendario** (ver nota abajo). */
  readonly blockedMinutes: number;
  readonly correctionsRequested: number;
  readonly consumptionByCategory: Readonly<Record<ChangeCategory, number>>;
  readonly menuUpdatesUsed: number;
  readonly menusPublished: number;
  readonly menusOutOfGuarantee: number;
}

const ACCEPTED_REQUEST_STATES = [
  "accepted",
  "in_progress",
  "published",
  "correction_requested",
  "in_correction",
  "closed",
];
const CANCELLED_REQUEST_STATES = ["cancelled_before_start", "cancelled_after_start"];
const PENDING_JOB_STATES = [
  "pending_assignment",
  "assigned",
  "reassignment_requested",
  "in_progress",
  "blocked_by_client",
  "authorized_pause",
  "in_correction",
];
const FINISHED_JOB_STATES = ["published", "completed"];

/**
 * §91, los diez indicadores. Dos decisiones que conviene tener a la vista:
 *
 *   · **Cumplimiento** se mide sobre los trabajos que **llegaron** a ese
 *     hito dentro del periodo, no sobre todos: un trabajo que aún no ha
 *     empezado no incumple todavía, lo dice el contador vivo y no el
 *     informe de un mes cerrado. Por eso el porcentaje es `null` —y no
 *     cero— cuando no hubo ninguno: cero significaría "todos mal".
 *   · **Duración bloqueada** se cuenta en minutos de **calendario** y no
 *     laborables. El tiempo bloqueado que no consume plazo ya lo dice
 *     T3 (RN-SLA-14); lo que §91 pide aquí es cuánto tiempo estuvo
 *     parado el trabajo, que es un hecho del calendario. Es lectura
 *     confirmada por Bosco (decisión 28).
 */
export function operationalIndicators(
  dataset: OperationDataset,
  calendar: WorkCalendar,
  measuredAt: Date,
): OperationalIndicators {
  const requestsReceived = dataset.requests.filter((request) => request.state !== "draft").length;
  const requestsAccepted = dataset.requests.filter((request) => ACCEPTED_REQUEST_STATES.includes(request.state)).length;
  const requestsRejected = dataset.requests.filter((request) => request.state === "rejected").length;
  const requestsCancelled = dataset.requests.filter((request) => CANCELLED_REQUEST_STATES.includes(request.state)).length;

  const started = dataset.jobs.filter((job) => job.startedAt !== null);
  const finished = dataset.jobs.filter((job) => job.publishedAt !== null);

  const startElapsed = started.map((job) =>
    t2Status(job.t2Events, calendar, job.startedAt ?? measuredAt, job.hasAcceleratedSla),
  );
  const executionElapsed = finished.map((job) =>
    t3Status(job.t3Events, calendar, job.publishedAt ?? measuredAt, job.category),
  );

  const consumptionByCategory: Record<ChangeCategory, number> = { small: 0, photo: 0, medium: 0, large: 0 };
  for (const entry of dataset.consumption) {
    // El informe enseña lo **gastado**, así que se suma el valor absoluto
    // de los débitos y se descuentan las devoluciones (RN-CON-12): el
    // libro guarda el signo y aquí se lee, nunca al revés.
    consumptionByCategory[entry.category] -= entry.amount;
  }

  return {
    requestsReceived,
    requestsAccepted,
    requestsRejected,
    requestsCancelled,
    jobsStarted: started.length,
    jobsCompleted: dataset.jobs.filter((job) => FINISHED_JOB_STATES.includes(job.state)).length,
    jobsPending: dataset.jobs.filter((job) => PENDING_JOB_STATES.includes(job.state)).length,
    startCompliancePercent: compliancePercent(startElapsed),
    executionCompliancePercent: compliancePercent(executionElapsed),
    averageStartMinutes: average(startElapsed.map((status) => status.elapsedMinutes)),
    averageCompletionMinutes: average(executionElapsed.map((status) => status.elapsedMinutes)),
    jobsBlocked: new Set(dataset.blocks.map((block) => block.jobId)).size,
    blockedMinutes: dataset.blocks.reduce(
      (total, block) => total + minutesBetween(block.startedAt, block.endedAt ?? measuredAt),
      0,
    ),
    correctionsRequested: dataset.correctionsRequested,
    consumptionByCategory,
    menuUpdatesUsed: dataset.menuUpdatesUsed,
    menusPublished: dataset.menus.filter((menu) => menu.publishedAt !== null).length,
    menusOutOfGuarantee: dataset.menus.filter((menu) => menu.publishedAt !== null && !menu.withinGuarantee).length,
  };
}

function compliancePercent(statuses: readonly { readonly overdue: boolean }[]): number | null {
  if (statuses.length === 0) return null;
  const onTime = statuses.filter((status) => !status.overdue).length;
  return Math.round((onTime / statuses.length) * 100);
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
}

/** Minutos laborables entre dos instantes, para quien quiera la otra medida. */
export function businessMinutesOf(from: Date, to: Date, calendar: WorkCalendar): number {
  return businessMinutesBetween(from, to, calendar);
}

// ---------------------------------------------------------------------
// 6 · El informe personal del trabajador (§90, RN-REP-02)
// ---------------------------------------------------------------------

/**
 * §90 · lo que lleva el informe personal, **sin finanzas**. Los puntos
 * históricos van separados de la carga actual porque §90 lo dice con esas
 * palabras: la carga es lo que tiene ahora encima y los puntos históricos
 * son lo que ha hecho, y confundirlos convertiría la carga en una nota de
 * rendimiento (§55: "la carga no es una nota de rendimiento").
 */
export interface WorkerPersonalReport {
  readonly workerId: string;
  readonly currentLoadPoints: number;
  readonly historicalPoints: number;
  readonly jobsCompleted: number;
  readonly jobsPending: number;
  readonly startCompliancePercent: number | null;
  readonly executionCompliancePercent: number | null;
  readonly averageStartMinutes: number | null;
  readonly averageCompletionMinutes: number | null;
  readonly jobsBlocked: number;
  readonly correctionsRequested: number;
}

export function workerPersonalReport(input: {
  readonly workerId: string;
  readonly currentLoadPoints: number;
  readonly historicalPoints: number;
  readonly jobs: readonly ReportJobRow[];
  readonly blocks: readonly ReportBlockRow[];
  readonly correctionsRequested: number;
  readonly calendar: WorkCalendar;
  readonly measuredAt: Date;
}): WorkerPersonalReport {
  const mine = input.jobs.filter((job) => job.assigneeId === input.workerId);
  const started = mine.filter((job) => job.startedAt !== null);
  const finished = mine.filter((job) => job.publishedAt !== null);
  const myJobIds = new Set(mine.map((job) => job.id));

  return {
    workerId: input.workerId,
    currentLoadPoints: input.currentLoadPoints,
    historicalPoints: input.historicalPoints,
    jobsCompleted: mine.filter((job) => FINISHED_JOB_STATES.includes(job.state)).length,
    jobsPending: mine.filter((job) => PENDING_JOB_STATES.includes(job.state)).length,
    startCompliancePercent: compliancePercent(
      started.map((job) => t2Status(job.t2Events, input.calendar, job.startedAt ?? input.measuredAt, job.hasAcceleratedSla)),
    ),
    executionCompliancePercent: compliancePercent(
      finished.map((job) => t3Status(job.t3Events, input.calendar, job.publishedAt ?? input.measuredAt, job.category)),
    ),
    averageStartMinutes: average(
      started.map(
        (job) => t2Status(job.t2Events, input.calendar, job.startedAt ?? input.measuredAt, job.hasAcceleratedSla).elapsedMinutes,
      ),
    ),
    averageCompletionMinutes: average(
      finished.map(
        (job) => t3Status(job.t3Events, input.calendar, job.publishedAt ?? input.measuredAt, job.category).elapsedMinutes,
      ),
    ),
    jobsBlocked: new Set(input.blocks.filter((block) => myJobIds.has(block.jobId)).map((block) => block.jobId)).size,
    correctionsRequested: input.correctionsRequested,
  };
}

/**
 * §55 / RN-ASG-17 · la comparación entre trabajadores **se segmenta** y
 * solo la ven propietario y administradores. Esto es el segmento: la
 * comparación se hace dentro de un mismo plan, una misma categoría de
 * cambio y un mismo periodo, que es lo que §55 enumera. Comparar en bruto
 * a quien lleva Premium con quien lleva Básico es exactamente lo que §55
 * prohíbe.
 */
export interface WorkerComparisonSegment {
  readonly planId: string | null;
  readonly category: ChangeCategory;
  readonly workerId: string;
  readonly jobs: number;
  readonly onTime: number;
}

export function workerComparison(input: {
  readonly jobs: readonly ReportJobRow[];
  readonly calendar: WorkCalendar;
  readonly measuredAt: Date;
}): readonly WorkerComparisonSegment[] {
  const segments = new Map<string, { planId: string | null; category: ChangeCategory; workerId: string; jobs: number; onTime: number }>();

  for (const job of input.jobs) {
    if (!job.assigneeId || job.publishedAt === null) continue;
    const key = `${job.planId ?? "-"}|${job.category}|${job.assigneeId}`;
    const current = segments.get(key) ?? {
      planId: job.planId,
      category: job.category,
      workerId: job.assigneeId,
      jobs: 0,
      onTime: 0,
    };
    const status = t3Status(job.t3Events, input.calendar, job.publishedAt, job.category);
    segments.set(key, {
      ...current,
      jobs: current.jobs + 1,
      onTime: current.onTime + (status.overdue ? 0 : 1),
    });
  }

  return [...segments.values()].sort((a, b) =>
    `${a.planId ?? ""}${a.category}${a.workerId}`.localeCompare(`${b.planId ?? ""}${b.category}${b.workerId}`),
  );
}

// ---------------------------------------------------------------------
// 7 · Las salidas: la versión, el CSV (§93, RN-REP-06/12)
// ---------------------------------------------------------------------

/**
 * Una fila de cifras de la versión del informe. `metric` es una **clave**,
 * no una frase: el nombre en español lo pone la pantalla (CLAUDE.md). `at`
 * es la antigüedad del dato (§94: "se indica fecha de última
 * sincronización"), y `noDataReason` uno de los cinco motivos de §178
 * cuando no hay cifra.
 */
export interface ReportFigure {
  readonly section: ReportSectionKey;
  readonly metric: string;
  readonly value: number | null;
  readonly unit?: string;
  readonly dimension?: string;
  readonly at?: string;
  readonly noDataReason?: string;
  /**
   * RN-REP-17 · la misma cifra en el **periodo anterior**, del mismo
   * tamaño y pegado a este. `undefined` cuando no se pidió la
   * comparación; `null` cuando se pidió y en aquel periodo no había dato.
   *
   * Los dos casos se pintan distinto y por eso no se colapsan en uno: sin
   * comparación no se dice nada, y con comparación pero sin dato anterior
   * se dice "sin periodo anterior". Un 0 % sería mentira en los dos.
   */
  readonly previous?: number | null;
}

/**
 * RN-REP-15 · los cinco niveles de informe, **de menos a más**. El orden
 * de esta lista ES la escalera: ninguno quita lo del anterior. Es la misma
 * que la de `report_level_rank()` en la migración 111, y las dos tienen
 * que decir lo mismo — la de SQL manda, porque es la que hace de barrera.
 */
export const REPORT_LEVELS = ["basic", "standard", "standard_plus", "advanced", "complete"] as const;
export type ReportLevel = (typeof REPORT_LEVELS)[number];

export function isReportLevel(value: string): value is ReportLevel {
  return (REPORT_LEVELS as readonly string[]).includes(value);
}

export function reportLevelRank(level: ReportLevel): number {
  return REPORT_LEVELS.indexOf(level);
}

/** El más alto de varios, que es lo que decide un restaurante con más de un plan vivo. */
export function highestReportLevel(levels: readonly ReportLevel[]): ReportLevel {
  return levels.reduce<ReportLevel>(
    (alto, level) => (reportLevelRank(level) > reportLevelRank(alto) ? level : alto),
    "basic",
  );
}

/**
 * RN-REP-17 · hasta dónde llega la comparación con el periodo anterior en
 * cada nivel. `none` no es "se calcula y no se enseña": es que **no se
 * pide** el periodo anterior (RN-REP-15, el nivel es una barrera).
 */
export type ComparisonReach = "none" | "headline" | "all";

export function reportLevelComparison(level: ReportLevel): ComparisonReach {
  if (level === "basic") return "none";
  if (level === "standard") return "headline";
  return "all";
}

/**
 * RN-REP-19 · las cifras de **"Lo esencial"**, la página del *"si solo
 * lees una página, es esta"*. Van en este orden y se cogen las tres
 * primeras que existan; las que no haya **no se rellenan** (CLAUDE.md).
 *
 * `sessions` lleva dimensión porque lo digital viene por fuente y las
 * visitas de la web son las de Analytics: sin la dimensión se cogería la
 * primera que apareciera, que puede ser la de Clarity y es otra cosa.
 *
 * La tarjeta de "clics en reservas" del primer boceto **no está**: las
 * reservas no se monitorizan (CLAUDE.md), así que esa cifra no existe.
 */
export interface HeadlineFigureKey {
  readonly section: ReportSectionKey;
  readonly metric: string;
  readonly dimension?: string;
}

export const HEADLINE_REPORT_FIGURES: readonly HeadlineFigureKey[] = [
  { section: "operation", metric: "jobs_completed" },
  { section: "digital", metric: "sessions", dimension: "ga4" },
  { section: "operation", metric: "start_compliance" },
  { section: "finance", metric: "income_total" },
];

/** Cuántas tarjetas caben en "Lo esencial" antes de dejar de ser lo esencial. */
export const HEADLINE_LIMIT = 3;

function matchesHeadline(figure: ReportFigure, clave: HeadlineFigureKey): boolean {
  return (
    figure.section === clave.section &&
    figure.metric === clave.metric &&
    (clave.dimension === undefined || figure.dimension === clave.dimension)
  );
}

export function isHeadlineFigure(figure: ReportFigure): boolean {
  return HEADLINE_REPORT_FIGURES.some((clave) => matchesHeadline(figure, clave));
}

/**
 * Las tarjetas de "Lo esencial" de una versión: en el orden de la lista,
 * solo de secciones **incluidas**, solo las que tienen cifra, y como mucho
 * `HEADLINE_LIMIT`.
 */
export function headlineFigures(snapshot: ReportSnapshot): readonly ReportFigure[] {
  const incluidas = new Set(
    snapshot.sections.filter((section) => section.included).map((section) => section.key),
  );
  const elegidas: ReportFigure[] = [];
  for (const clave of HEADLINE_REPORT_FIGURES) {
    if (elegidas.length >= HEADLINE_LIMIT) break;
    if (!incluidas.has(clave.section)) continue;
    const figura = snapshot.figures.find(
      (candidata) => matchesHeadline(candidata, clave) && candidata.value !== null,
    );
    if (figura) elegidas.push(figura);
  }
  return elegidas;
}

function diaIso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/**
 * Si el periodo es **un mes natural entero**: del día 1 al último día del
 * mismo mes. Es el caso normal —el informe es mensual— y el que decide la
 * regla de abajo.
 */
function esMesNatural(inicio: Date, fin: Date): boolean {
  const ultimoDia = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth() + 1, 0));
  return (
    inicio.getUTCDate() === 1 &&
    inicio.getUTCFullYear() === fin.getUTCFullYear() &&
    inicio.getUTCMonth() === fin.getUTCMonth() &&
    fin.getUTCDate() === ultimoDia.getUTCDate()
  );
}

/**
 * RN-REP-17 · el periodo anterior a uno dado. Dos reglas, y la primera
 * manda:
 *
 *   · **Un mes natural se compara con el mes natural anterior**, entero:
 *     septiembre contra agosto del 1 al 31. Aquí sí se aceptan los 30
 *     días contra 31, porque lo que el restaurante lee es "agosto" y
 *     recortarle el día 1 para cuadrar el tamaño sería llamar agosto a
 *     algo que no lo es —una mentira callada, que es peor que un 3 % de
 *     diferencia declarada—.
 *   · **Cualquier otro periodo se compara con otros tantos días pegados
 *     detrás**: uno de 14 días con los 14 anteriores. Un informe no tiene
 *     por qué ser mensual —el equipo elige las fechas— y comparar 14 días
 *     contra un mes diría cualquier cosa.
 *
 * En los dos casos el periodo anterior **termina el día antes de que este
 * empiece**: ni se solapan ni dejan hueco.
 */
export function previousPeriod(period: ReportPeriod): ReportPeriod {
  const inicio = new Date(`${period.start}T00:00:00Z`);
  const fin = new Date(`${period.end}T00:00:00Z`);

  if (esMesNatural(inicio, fin)) {
    const anteriorInicio = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() - 1, 1));
    const anteriorFin = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 0));
    return { start: diaIso(anteriorInicio), end: diaIso(anteriorFin) };
  }

  const dias = Math.round((fin.getTime() - inicio.getTime()) / 86_400_000) + 1;
  const anteriorFin = new Date(inicio.getTime() - 86_400_000);
  const anteriorInicio = new Date(anteriorFin.getTime() - (dias - 1) * 86_400_000);
  return { start: diaIso(anteriorInicio), end: diaIso(anteriorFin) };
}

/**
 * La clave con la que una cifra de un periodo encuentra la del anterior.
 * Sección, métrica y dimensión: sin la dimensión, "Sesiones · móvil" se
 * compararía con "Sesiones · escritorio" y el porcentaje sería inventado.
 */
export function figureKey(figure: ReportFigure): string {
  return `${figure.section}\u0000${figure.metric}\u0000${figure.dimension ?? ""}`;
}

/**
 * RN-REP-17 · pega a cada cifra la del periodo anterior.
 *
 * Una cifra del periodo anterior que no exista ahora **no se añade**: el
 * informe cuenta este periodo, y una fila que solo tiene pasado sería una
 * cifra fantasma. Al revés sí: una cifra de ahora sin pasado sale con
 * `previous` a `null`, que la pantalla dice como "sin periodo anterior".
 */
export function withPreviousFigures(
  current: readonly ReportFigure[],
  previous: readonly ReportFigure[],
  reach: ComparisonReach = "all",
): readonly ReportFigure[] {
  if (reach === "none") return current;
  const antes = new Map(previous.map((figure) => [figureKey(figure), figure.value]));
  return current.map((figure) => {
    // RN-REP-15 · en `standard` la comparación llega solo a "Lo esencial".
    // Las demás cifras salen **sin** `previous`, que la pantalla dice como
    // "sin comparación", y no con un `null`, que diría "no había dato".
    if (reach === "headline" && !isHeadlineFigure(figure)) return figure;
    return { ...figure, previous: antes.get(figureKey(figure)) ?? null };
  });
}

/**
 * RN-REP-17 · la variación de una cifra respecto al periodo anterior, ya
 * resuelta. Son cinco casos y no uno, porque los cinco se dicen distinto:
 *
 *   · `none` — no hay comparación. O el nivel del plan no la incluye
 *     (RN-REP-15), o esta cifra no tiene dato este periodo y entonces ya
 *     dice su motivo (§178) y una variación sobraría.
 *   · `no_previous` — sí hay comparación, pero en aquel periodo esta cifra
 *     no existía. Se dice "sin periodo anterior", nunca 0 %.
 *   · `from_zero` — el periodo anterior fue **cero**. Un porcentaje desde
 *     cero es infinito y escribir "+∞ %" no informa: se dice de cuánto se
 *     viene, que es lo que se entiende.
 *   · `flat` — el mismo número. No es "+0 %": es que no cambió.
 *   · `percent` — la variación, con su signo.
 *
 * **La variación dice la dirección, no si está bien.** Que las incidencias
 * suban un 20 % es malo y que las visitas suban un 20 % es bueno, y decidir
 * eso cifra a cifra sería una lista de juicios inventada (CLAUDE.md). Quien
 * juzga es la persona que escribe el resumen ejecutivo (§93).
 */
export type FigureChange =
  | { readonly kind: "none" }
  | { readonly kind: "no_previous" }
  | { readonly kind: "from_zero"; readonly value: number }
  | { readonly kind: "flat" }
  | { readonly kind: "percent"; readonly percent: number };

export function figureChange(figure: ReportFigure): FigureChange {
  if (figure.previous === undefined || figure.value === null) return { kind: "none" };
  if (figure.previous === null) return { kind: "no_previous" };
  if (figure.value === figure.previous) return { kind: "flat" };
  if (figure.previous === 0) return { kind: "from_zero", value: figure.value };
  // Se redondea a entero: un "+18,4 %" en una tarjeta de portada finge una
  // precisión que la cifra de debajo no tiene.
  return {
    kind: "percent",
    percent: Math.round(((figure.value - figure.previous) / Math.abs(figure.previous)) * 100),
  };
}

/**
 * Una oportunidad aprobada que entra en el informe (§96, §99). Se guarda
 * su **regla y su sujeto**, no su título: la frase la escribe la pantalla
 * desde `src/i18n/es.ts`, igual que en el Hito 15 — así una aprobada hace
 * dos meses no sigue diciendo una frase que se corrigió después.
 */
export interface ReportOpportunity {
  readonly id: string;
  readonly rule: string | null;
  readonly subject: string;
  readonly title: string | null;
  readonly impact: string;
  readonly effortCategory: string | null;
}

/** Lo que se guarda como versión: cifras y secciones, nada redactado. */
export interface ReportSnapshot {
  readonly category: ReportCategory;
  readonly period: ReportPeriod;
  readonly generatedAt: string;
  readonly sections: readonly ReportSectionState[];
  readonly figures: readonly ReportFigure[];
  /** §96 · las oportunidades aprobadas que lleva, si lleva la sección. */
  readonly opportunities: readonly ReportOpportunity[];
  /** Texto que escribió una persona, por sección (§95.5). Nunca generado. */
  readonly notes: Readonly<Record<string, string>>;
}

/**
 * §93 · el CSV. Una fila por cifra, con su sección, su métrica, su
 * dimensión si la tiene, su valor, su unidad y su fecha. Sin traducir:
 * es el dato, y quien lo abre en una hoja de cálculo quiere la clave
 * estable, no la frase de la pantalla, que puede cambiar.
 *
 * El separador es `,` y todo campo que lleve coma, comilla o salto va
 * entrecomillado con la comilla doblada, que es RFC 4180 y lo que Excel y
 * Numbers leen sin preguntar.
 */
export const REPORT_CSV_HEADER = ["section", "metric", "dimension", "value", "unit", "at", "no_data_reason"] as const;

export function reportCsv(snapshot: ReportSnapshot): string {
  const included = new Set(snapshot.sections.filter((section) => section.included).map((section) => section.key));
  const rows = snapshot.figures
    .filter((figure) => included.has(figure.section))
    .map((figure) => [
      figure.section,
      figure.metric,
      figure.dimension ?? "",
      figure.value === null ? "" : String(figure.value),
      figure.unit ?? "",
      figure.at ?? "",
      figure.noDataReason ?? "",
    ]);

  return [[...REPORT_CSV_HEADER], ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Las cifras de una sección, en el orden en que se generaron. */
export function figuresOfSection(snapshot: ReportSnapshot, section: ReportSectionKey): readonly ReportFigure[] {
  return snapshot.figures.filter((figure) => figure.section === section);
}

/** Las secciones incluidas, ordenadas (§95.5: "selecciona, edita y ordena"). */
export function orderedSections(sections: readonly ReportSectionState[]): readonly ReportSectionState[] {
  return [...sections].sort((a, b) => a.position - b.position);
}

/**
 * Reordenar: la lista que llega es el orden nuevo, y las posiciones se
 * reescriben de 1 a n. Que no haya huecos ni empates no es cosmético —
 * es lo que hace que "ordenar" sea una operación repetible.
 */
export function reorderSections(
  sections: readonly ReportSectionState[],
  orderedKeys: readonly ReportSectionKey[],
): readonly ReportSectionState[] {
  const byKey = new Map(sections.map((section) => [section.key, section]));
  const result: ReportSectionState[] = [];
  let position = 1;
  for (const key of orderedKeys) {
    const section = byKey.get(key);
    if (!section) continue;
    result.push({ ...section, position });
    position += 1;
    byKey.delete(key);
  }
  for (const section of orderedSections([...byKey.values()])) {
    result.push({ ...section, position });
    position += 1;
  }
  return result;
}
