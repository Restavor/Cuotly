/**
 * `src/services/report-summary.ts` — el resumen ejecutivo automático
 * (RN-REP-28, decisión 78).
 *
 * **Frases fijas, sin IA** (RN-CLS-06, §93). Qué hechos hay lo decide
 * `executiveSummaryFacts()` en `src/core/reports.ts`, que es lógica pura y
 * se prueba sola; aquí solo se ponen en español con las frases de
 * `src/i18n/es.ts`. Cada frase sale **solo si tiene su dato**: lo que no
 * hay no se dice con un cero (CLAUDE.md).
 *
 * El texto se escribe **al generar la versión** y se guarda dentro de
 * ella: es lo que el restaurante va a leer, y una versión es el original
 * de su día (RN-REP-12). Si mañana se corrige una frase, los informes ya
 * subidos siguen diciendo lo que dijeron.
 */

import { type ExecutiveSummaryFacts, type ReportPeriod, periodShape } from "@/core/reports";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";

const t = es.reportsPage.autoSummary;

/** "agosto de 2026". El periodo es de días naturales, así que va en UTC. */
export function monthName(period: ReportPeriod): string {
  return enZona(period.start, "UTC", { month: "long", year: "numeric" });
}

/**
 * RN-REP-32 · "julio a septiembre de 2026". Solo tiene sentido para un
 * trimestre natural; para cualquier otro periodo, `periodPhrase` usa el
 * nombre del mes como hasta ahora.
 */
export function quarterName(period: ReportPeriod): string {
  return t.quarterRange(
    enZona(period.start, "UTC", { month: "long" }),
    enZona(period.end, "UTC", { month: "long", year: "numeric" }),
  );
}

/**
 * Cómo se nombra el periodo dentro de una frase: "agosto de 2026" o, si es
 * un trimestre natural (RN-REP-32), "el trimestre de julio a septiembre de
 * 2026".
 */
export function periodPhrase(period: ReportPeriod): string {
  return periodShape(period) === "quarter" ? t.quarterPhrase(quarterName(period)) : monthName(period);
}

export function executiveSummaryText(facts: ExecutiveSummaryFacts): string {
  const mes = periodPhrase(facts.period);
  const frases: string[] = [];

  if (facts.changes !== null) {
    const { delivered, inProgress, pendingStart } = facts.changes;
    frases.push(
      delivered + inProgress + pendingStart === 0
        ? t.noChanges(mes)
        : t.changes(mes, delivered, inProgress, pendingStart),
    );
  }

  if (facts.allowance.length > 0) {
    frases.push(
      t.allowance(
        facts.allowance.map((line) => {
          const nombre = t.categoryNames[line.category];
          return t.allowancePart(line.consumed, line.included, line.included === 1 ? nombre.one : nombre.many);
        }),
      ),
    );
  }

  if (facts.budgeted > 0) frases.push(t.budgeted(facts.budgeted));
  if (facts.menusPublished !== null && facts.menusPublished > 0) frases.push(t.menus(facts.menusPublished));
  if (facts.startCompliance !== null) frases.push(t.startCompliance(Math.round(facts.startCompliance)));
  if (facts.visits !== null) frases.push(t.visits(new Intl.NumberFormat("es-ES").format(facts.visits)));

  return frases.join(" ");
}
