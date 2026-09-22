import Link from "next/link";
import type { ReactNode } from "react";

import { InfoNote } from "@/components/panel/RequestPieces";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { fechaCorta } from "@/i18n/dates";
import { es } from "@/i18n/es";

import { periodLabel } from "./ReportsTable";
import type { ReportRow } from "./reports-load";

const t = es.panelData;

/**
 * R29 · los informes enviados al restaurante, en tarjetas, con el último a
 * la derecha. Lo que llega ya viene filtrado por la política de `reports`
 * (RN-REP-13, RN-REP-16): solo los enviados y solo los que su plan y su
 * permiso le dejan ver. Aquí no se filtra nada.
 */
export function ClientReports({
  reports,
  base,
  aside,
}: {
  reports: readonly ReportRow[];
  base: string;
  /** Lo que va debajo del último informe (el resumen de solicitudes). */
  aside?: ReactNode;
}) {
  const ultimo = reports[0] ?? null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title={t.published} subtitle={t.publishedHint}>
        {reports.length === 0 ? (
          <EmptyState icon="document" title={es.reportsPage.clientEmpty} description={es.reportsPage.clientEmptyReason} />
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-soft-surface text-cuotly-green">
                  <Icon name="document" className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-text">{r.name}</span>
                  <span className="block text-xs text-text-secondary">
                    {r.sentAt ? t.generatedOn(fechaCorta(r.sentAt.slice(0, 10))) : periodLabel(r)}
                  </span>
                </span>
                <ButtonLink href={`${base}/${r.id}`} variant="outline" size="sm">
                  {t.viewReport}
                </ButtonLink>
                <ButtonLink href={`${base}/${r.id}/descargar?formato=pdf`} variant="outline" size="sm" icon="download">
                  {t.download}
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <InfoNote title={t.published}>{t.onlyYourPlan}</InfoNote>
        </div>
      </Card>

      <div className="space-y-6">
      {ultimo ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-primary-dark">{t.latestTitle(ultimo.name)}</h2>
              <p className="text-sm text-text-secondary">{t.latestPeriod(periodLabel(ultimo))}</p>
            </div>
            <Link
              href={`${base}/${ultimo.id}`}
              className="inline-flex items-center justify-center rounded-[10px] bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark"
            >
              {t.viewFull}
            </Link>
          </div>
        </Card>
      ) : null}
      {aside}
      </div>
    </div>
  );
}
