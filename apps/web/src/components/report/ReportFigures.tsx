import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui";
import { EmptyReason } from "@/components/ui/EmptyReason";
import {
  type ReportSnapshot,
  figuresOfSection,
  orderedSections,
} from "@/core/reports";
import { fechaCorta } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { figureLabel, figureText } from "@/services/report-pdf";

const t = es.reportsPage;

/**
 * Las cifras de una versión, sección a sección. Es la "Vista previa" de
 * la vista 10.04 y lo mismo que pinta el PDF: una sola maquetación, para
 * que lo que se ve y lo que se descarga no puedan desfasarse.
 *
 * Una cifra sin valor **dice su motivo** (§178, CA-20): no conectado, sin
 * datos todavía, error, dato desactualizado o periodo insuficiente. Nunca
 * un guion mudo y nunca un dato viejo presentado como actual (RN-REP-07).
 */
/**
 * §96 · las oportunidades aprobadas que lleva el informe. El título se
 * escribe aquí desde `es.ts` a partir de la regla y el sujeto que guardó
 * la versión: la base no guarda español, y así una aprobada hace dos meses
 * no sigue diciendo una frase que se corrigió después (CLAUDE.md).
 */
function OpportunityList({ snapshot }: { snapshot: ReportSnapshot }) {
  if (snapshot.opportunities.length === 0) {
    return <EmptyReason reason="no_data_yet" title={t.sections.opportunities} />;
  }

  return (
    <ul className="space-y-2">
      {snapshot.opportunities.map((opportunity) => {
        const rule = opportunity.rule as keyof typeof es.opportunities.ruleTitles | null;
        const titulo =
          rule === null
            ? (opportunity.title ?? es.opportunities.title)
            : es.opportunities.ruleTitles[rule](opportunity.subject);
        const impacto = opportunity.impact as keyof typeof es.opportunities.impacts;

        return (
          <li key={opportunity.id} className="rounded-[10px] bg-soft-surface p-3 text-sm">
            <span className="font-semibold text-text">{titulo}</span>
            <span className="ml-2 text-text-secondary">{es.opportunities.impacts[impacto]}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function ReportFigures({ snapshot }: { snapshot: ReportSnapshot }) {
  const sections = orderedSections(snapshot.sections).filter((section) => section.included);

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const figures = figuresOfSection(snapshot, section.key);
        const note = snapshot.notes[section.key];

        return (
          <section key={section.key} className="space-y-2">
            <h4 className="text-sm font-semibold text-primary-dark">{t.sections[section.key]}</h4>
            {note ? <p className="text-sm text-text">{note}</p> : null}

            {section.key === "opportunities" ? (
              <OpportunityList snapshot={snapshot} />
            ) : figures.length === 0 ? (
              <EmptyReason reason="no_data_yet" title={t.sections[section.key]} />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{t.columns.name}</TableHeaderCell>
                    <TableHeaderCell>{t.columns.period}</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {figures.map((figure, index) => (
                    <TableRow key={`${figure.metric}-${figure.dimension ?? ""}-${index}`}>
                      <TableCell>{figureLabel(figure, t)}</TableCell>
                      <TableCell>
                        <span className="font-semibold text-text">{figureText(figure, t)}</span>
                        {figure.at ? (
                          <span className="ml-2 text-xs text-text-secondary">{fechaCorta(figure.at)}</span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        );
      })}
    </div>
  );
}
