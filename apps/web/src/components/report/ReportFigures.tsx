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

            {figures.length === 0 ? (
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
