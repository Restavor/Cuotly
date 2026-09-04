import { Card, EmptyState } from "@/components/ui";
import { es } from "@/i18n/es";

/**
 * §20.2 · "En Fase 1, Menú Diario e Informes muestran su estructura con el
 * estado vacío correspondiente."
 *
 * Eso es literalmente esta pantalla: las tres familias de informe que el
 * ROADMAP fija para la Fase 3, nombradas, y cada una diciendo que **no
 * está construida**. No dice "todavía no hay datos", que sería mentir
 * sobre el motivo (CA-20: el estado vacío explica su causa). Y no hay ni
 * una cifra de ejemplo ni una gráfica de relleno (CLAUDE.md MUST NOT).
 */
export const dynamic = "force-static";

export default function ReportsPage() {
  const familias = [
    { title: es.reportsPage.operationTitle, empty: es.reportsPage.operationEmpty, reason: es.reportsPage.notBuiltReason },
    { title: es.reportsPage.financeTitle, empty: es.reportsPage.financeEmpty, reason: es.reportsPage.notBuiltReason },
    { title: es.reportsPage.digitalTitle, empty: es.reportsPage.digitalEmpty, reason: es.reportsPage.digitalNotBuiltReason },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{es.reportsPage.title}</h1>
        <p className="text-sm text-text-secondary">{es.reportsPage.subtitle}</p>
      </header>

      <Card title={es.reportsPage.phaseTitle}>
        <p className="text-sm text-text-secondary">{es.reportsPage.phaseReason}</p>
      </Card>

      {familias.map((familia) => (
        <Card key={familia.title} title={familia.title}>
          <EmptyState title={familia.empty} description={familia.reason} />
        </Card>
      ))}
    </div>
  );
}
