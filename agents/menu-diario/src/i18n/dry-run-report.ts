/**
 * Cómo se enseña a Bosco el informe de la prueba en seco (`agente:seco`). Español sencillo, sin jerga.
 * El informe se construye en `src/core/dry-run.ts` (códigos); aquí solo se convierte en frases.
 */
import { dayDiff, localDateTimeOf, type LocalDate } from "../core/local-time.ts";
import type { DryRunAction, DryRunLine, DryRunReport } from "../core/dry-run.ts";
import { es, placeOf } from "./es.ts";

/** «04/10/2026» a partir de «2026-10-04». */
export function formatDate(date: LocalDate): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** «04/10/2026 a las 07:00», en la zona del espacio. */
export function formatLocalInstant(instant: Date, timeZone: string): string {
  const { date, time } = localDateTimeOf(instant, timeZone);
  return `${formatDate(date)} ${es.dryRun.at} ${time}`;
}

/** «hoy», «mañana», «pasado mañana», «ayer», «dentro de 5 días», «hace 3 días». */
export function relativeDay(today: LocalDate, target: LocalDate): string {
  const n = dayDiff(today, target);
  const t = es.dryRun.day;
  if (n === 0) return t.today;
  if (n === 1) return t.tomorrow;
  if (n === 2) return t.dayAfterTomorrow;
  if (n === -1) return t.yesterday;
  return n > 0 ? t.inDays(n) : t.daysAgo(-n);
}

export function menuStateLabel(state: string): string {
  return es.menuState[state] ?? state;
}

function actionText(line: DryRunLine): string {
  const a: DryRunAction = line.action;
  const t = es.dryRun.actions;
  switch (a.kind) {
    case "publish_now":
      return t.publishNow(a.order, a.of);
    case "wait_until":
      return t.waitUntil(formatLocalInstant(a.at, line.timeZone), placeOf(line.timeZone));
    case "report_error": {
      const reasons = { ...es.publishFromError, ...es.orderReason } as Readonly<Record<string, string>>;
      return t.reportError(reasons[a.reason] ?? a.reason);
    }
    case "hands_off":
      return t.handsOff;
    case "no_rule":
      return t.noRule;
    case "not_a_daily_menu":
      return t.notDaily;
    case "service_stopped":
      return t.serviceStopped;
  }
}

export type DryRunPrintContext = {
  /** «Hoy es sábado 3 de octubre de 2026, 21:30, hora de Madrid (UTC+02:00)». */
  clockLine: string;
  simulatedClock: boolean;
  /** Para decir contra qué base se ha mirado, p. ej. «Restavor pruebas (bnucqyki…)». */
  environment: string;
  /** Diferencia del reloj del ordenador con el de Supabase, en segundos; `null` si no se pudo medir. */
  skewSeconds: number | null;
  maxSkewMinutes: number;
  /** Lo que de verdad se pidió a la base: solo lecturas y el inicio y cierre de sesión. */
  requests: { reads: number; auth: number };
};

export function formatDryRunReport(report: DryRunReport, ctx: DryRunPrintContext): string {
  const t = es.dryRun;
  const out: string[] = [];
  out.push(t.title);
  out.push(ctx.clockLine);
  if (ctx.simulatedClock) out.push(`*** ${t.simulatedClock} ***`);
  if (ctx.skewSeconds !== null) out.push(t.skewOk(ctx.skewSeconds, ctx.maxSkewMinutes));
  out.push(`${t.environment}: ${ctx.environment}`);

  out.push("", t.restaurantsTitle);
  if (report.restaurants.length === 0) out.push(`  ${t.noRestaurants}`);
  for (const r of report.restaurants) {
    const label = r.activated ? t.restaurantActivated(r.serviceRunning) : (t.restaurantNotActivated[r.reason] ?? r.reason);
    out.push(`  · ${r.restaurant.name} (${r.restaurant.code}): ${label}`);
  }

  out.push("", t.queueTitle);
  if (report.lines.length === 0) out.push(`  ${t.queueEmpty}`);
  report.lines.forEach((line, i) => {
    const it = line.item;
    out.push(
      `  ${i + 1} · ${it.establishmentName} · ${it.name} · ${formatDate(it.targetDate)} (${relativeDay(line.today, it.targetDate)}) · ${menuStateLabel(it.state)}`,
    );
    const facts: string[] = [];
    if (it.requestedAt) facts.push(`${t.requested}: ${formatLocalInstant(it.requestedAt, line.timeZone)}`);
    if (it.publishByAt) facts.push(`${t.objective}: ${formatLocalInstant(it.publishByAt, line.timeZone)}`);
    out.push(`      ${[...facts, `${t.assignmentLabel}: ${t.assignment[line.assignment] ?? line.assignment}`].join(" · ")}`);
    out.push(`      ${t.whatItWouldDo}: ${actionText(line)}`);
  });

  if (report.drafts.length > 0) {
    out.push("", t.draftsTitle);
    for (const d of report.drafts) {
      out.push(
        `  · ${d.restaurantName} · ${d.menu.name} · ${formatDate(d.menu.targetDate)} (${relativeDay(d.today, d.menu.targetDate)}): ${t.draftLine(menuStateLabel(d.menu.state))}`,
      );
    }
  }

  if (report.warnings.length > 0) {
    out.push("", t.warningsTitle);
    for (const w of report.warnings) out.push(`  · ${t.warningLaterDay(w.restaurantName, formatDate(w.menuDate), formatDate(w.laterDate))}`);
  }

  out.push("", t.summaryTitle);
  const parts = (Object.keys(report.summary) as DryRunAction["kind"][])
    .filter((k) => report.summary[k] > 0)
    .map((k) => `${t.summary[k] ?? k}: ${report.summary[k]}`);
  out.push(`  ${parts.length > 0 ? parts.join(" · ") : t.queueEmpty}`);
  out.push(`  ${t.writes(ctx.requests.reads, ctx.requests.auth)}`);
  return out.join("\n") + "\n";
}
