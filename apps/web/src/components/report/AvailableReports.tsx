import Link from "next/link";

import { Card, EmptyState, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui";
import { fechaCorta } from "@/i18n/dates";
import { es } from "@/i18n/es";

import { periodLabel } from "./ReportsTable";
import type { ReportRow } from "./reports-load";

const t = es.reportsPage;

/**
 * Vista 22.01 · "Informes disponibles": lo que el restaurante ve de sus
 * informes (RN-REP-13).
 *
 * Aquí llegan **solo los enviados**, y no porque esta lista los filtre:
 * la política de `reports` no le devuelve ningún otro. Lo que se enseña
 * de cada uno es su nombre, su periodo, la fecha en que se compartió y el
 * PDF — nunca quién lo preparó ni quién lo aprobó (P7).
 */
export function AvailableReports({
  reports,
  base,
}: {
  reports: readonly ReportRow[];
  base: string;
}) {
  return (
    <Card title={t.clientTitle}>
      <p className="mb-3 text-sm text-text-secondary">{t.clientSubtitle}</p>

      {reports.length === 0 ? (
        <EmptyState icon="document" title={t.clientEmpty} description={t.clientEmptyReason} />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t.columns.name}</TableHeaderCell>
              <TableHeaderCell>{t.columns.period}</TableHeaderCell>
              <TableHeaderCell>{t.columns.sentAt}</TableHeaderCell>
              <TableHeaderCell>{t.columns.format}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {reports.map((report) => (
              <TableRow key={report.id}>
                <TableCell>{report.name}</TableCell>
                <TableCell>{periodLabel(report)}</TableCell>
                <TableCell>
                  {report.sentAt ? fechaCorta(report.sentAt.slice(0, 10)) : t.pdf.noValue}
                </TableCell>
                <TableCell>
                  <Link className="underline" href={`${base}/${report.id}/descargar?formato=pdf`}>
                    {t.downloadPdf}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
