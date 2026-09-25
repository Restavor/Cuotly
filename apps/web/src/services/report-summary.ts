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

import type { ExecutiveSummaryFacts, ReportPeriod } from "@/core/reports";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";

const t = es.reportsPage.autoSummary;

/** "agosto de 2026". El periodo es de días naturales, así que va en UTC. */
export function monthName(period: ReportPeriod): string {
  return enZona(period.start, "UTC", { month: "long", year: "numeric" });
}

export function executiveSummaryText(facts: ExecutiveSummaryFacts): string {
  const mes = monthName(facts.period);
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
