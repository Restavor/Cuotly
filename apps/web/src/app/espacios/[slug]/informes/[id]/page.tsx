import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ReportFigures } from "@/components/report/ReportFigures";
import {
  RegenerateButton,
  RenameForm,
  ScheduleForm,
  SectionsForm,
  SendButton,
  StatusButton,
} from "@/components/report/ReportForms";
import { ReportStateBadge, periodLabel } from "@/components/report/ReportsTable";
import { loadReportDetail } from "@/components/report/reports-load";
import { isStaffRole } from "@/components/shell/navigation";
import { resolveShellViewer } from "@/components/shell/viewer";
import { Card, EmptyState } from "@/components/ui";
import { isObjectiveOnly, orderedSections } from "@/core/reports";
import { DEFAULT_TIMEZONE, enZona, fechaCorta } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * Vista 10.04 · revisar y programar un informe (§95, RN-REP-08/09/10).
 *
 * Lo que esta pantalla enseña y por qué:
 *
 *   · **Las secciones con su casilla y su orden** (§95.5), marcando las
 *     que requieren criterio. Editarlas después de aprobar devuelve el
 *     informe a revisión, y lo dice antes de que pase (RN-REP-09).
 *   · **La vista previa** es la versión vigente, con sus cifras y su
 *     fecha. No hay una segunda maquetación: el PDF pinta esto mismo.
 *   · **Aprobar, programar y enviar** solo se ofrecen a quien puede, pero
 *     quien puede lo decide el servidor: los tres botones llaman a
 *     funciones que comprueban la capacidad "Aprobar informes".
 *   · **El freno de §95** —oportunidades pendientes— se avisa aquí y se
 *     aplica al enviar, porque una oportunidad puede detectarse después de
 *     aprobar.
 */
export const dynamic = "force-dynamic";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [viewer, detail, { data: space }] = await Promise.all([
    resolveShellViewer(supabase, user.id, slug),
    loadReportDetail(supabase, id),
    supabase.from("spaces").select("timezone").eq("slug", slug).maybeSingle(),
  ]);
  if (detail === null) notFound();

  const t = es.reportsPage;
  const { report, sections, versions, pendingOpportunities } = detail;
  const ultima = versions[0] ?? null;
  const ordenadas = orderedSections(sections);
  const objetivo = isObjectiveOnly(ordenadas);
  const cerrado = report.status === "sent" || report.status === "archived";
  // CLAUDE.md · la zona del espacio, no una escrita a mano. Esta pantalla
  // se quedó fuera del barrido del 14/09/2026: aquel solo prohibía
  // construir un formateador por tu cuenta, y aquí la zona se le pasaba a
  // `enZona()` como literal. La revisión del Hito 16 lo encontró y el
  // barrido ahora también mira eso.
  const timezone = space?.timezone ?? DEFAULT_TIMEZONE;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-dark">{t.detailTitle}</h1>
          <p className="text-sm text-text-secondary">{t.detailSubtitle}</p>
        </div>
        <ReportStateBadge status={report.status} />
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t.infoTitle}>
            <RenameForm slug={slug} reportId={report.id} name={report.name} readOnly={cerrado} />
            <dl className="grid gap-3 sm:grid-cols-2">
              <Dato label={t.filters.establishment} value={report.establishmentName ?? t.pdf.consolidated} />
              <Dato label={t.columns.category} value={t.categories[report.category]} />
              <Dato label={t.periodLabel} value={periodLabel(report)} />
              <Dato
                label={t.columns.sentAt}
                value={report.sentAt ? fechaCorta(report.sentAt.slice(0, 10)) : t.pdf.noValue}
              />
            </dl>
            <p className="mt-3 rounded-[10px] bg-soft-surface p-3 text-sm text-text-secondary">
              {t.historicalHint}
            </p>
          </Card>

          <Card title={t.sectionsTitle}>
            <p className="mb-3 text-sm text-text-secondary">
              {objetivo ? t.objectiveOnly : t.needsApproval}
            </p>
            <SectionsForm
              slug={slug}
              reportId={report.id}
              sections={ordenadas.map((section) => ({
                key: section.key,
                included: section.included,
                note: sections.find((row) => row.key === section.key)?.note ?? null,
              }))}
              readOnly={cerrado}
            />
          </Card>

          <Card
            title={t.previewTitle}
            action={
              ultima === null ? null : (
                <span className="flex gap-3 text-sm">
                  <Link className="underline" href={`/espacios/${slug}/informes/${report.id}/descargar?formato=pdf`}>
                    {t.downloadPdf}
                  </Link>
                  <Link className="underline" href={`/espacios/${slug}/informes/${report.id}/descargar?formato=csv`}>
                    {t.downloadCsv}
                  </Link>
                </span>
              )
            }
          >
            {ultima === null ? (
              <EmptyState icon="document" title={t.noVersion} description={t.emptyReason} />
            ) : (
              <ReportFigures snapshot={ultima.snapshot} />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={t.stateTitle}>
            <ReportStateBadge status={report.status} />
            <p className="mt-2 text-sm text-text-secondary">{t.stateHints[report.status]}</p>
            {report.statusReason ? (
              <p className="mt-2 rounded-[10px] bg-soft-surface p-3 text-sm text-text">
                {report.statusReason}
              </p>
            ) : null}
            {pendingOpportunities > 0 ? (
              <p className="mt-2 rounded-[10px] bg-soft-surface p-3 text-sm text-text">
                {t.pendingOpportunities}
              </p>
            ) : null}
          </Card>

          {cerrado ? null : (
            <>
              <Card title={t.approvalTitle}>
                <p className="mb-3 text-sm text-text-secondary">{t.approveHint}</p>
                <div className="space-y-3">
                  {report.status === "preparing" ? (
                    <StatusButton
                      slug={slug}
                      reportId={report.id}
                      status="pending_review"
                      label={t.sendToReview}
                      variant="secondary"
                    />
                  ) : null}
                  {report.status === "preparing" || report.status === "pending_review" ? (
                    <StatusButton slug={slug} reportId={report.id} status="approved" label={t.approve} />
                  ) : null}
                  <RegenerateButton slug={slug} reportId={report.id} />
                </div>
              </Card>

              <Card title={t.scheduleTitle}>
                <ScheduleForm
                  slug={slug}
                  reportId={report.id}
                  scheduledFor={report.scheduledFor}
                  includeCsv={report.includeCsv}
                  channel={report.deliveryChannel === "none" ? "none" : "email"}
                />
                {report.status === "approved" || report.status === "scheduled" ? (
                  <div className="mt-4">
                    <SendButton slug={slug} reportId={report.id} />
                  </div>
                ) : null}
              </Card>
            </>
          )}

          <Card title={t.versionsTitle}>
            {versions.length === 0 ? (
              <p className="text-sm text-text-secondary">{t.noVersion}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {versions.map((version) => (
                  <li key={version.id} className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-text">{t.versionLabel(version.versionNumber)}</span>
                    <span className="text-text-secondary">
                      {enZona(version.generatedAt, timezone, { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/*
            Archivar es del equipo: `set_report_status()` se lo niega a
            quien no gestiona la cartera. El restaurante llega aquí por su
            propio informe enviado —la RLS se lo da, y debe—, y ofrecerle
            un botón que siempre falla es justo lo que esta pantalla dice
            evitar (CA-20).
          */}
          {isStaffRole(viewer.role) ? (
            <Card title={t.archive}>
              <StatusButton
                slug={slug}
                reportId={report.id}
                status="archived"
                label={t.archive}
                needsReason={report.status !== "sent"}
                variant="secondary"
              />
            </Card>
          ) : null}

          {viewer.role === "worker" ? (
            <Card>
              <p className="text-sm text-text-secondary">{t.workerNotAllowed}</p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="text-sm font-semibold text-text">{value}</dd>
    </div>
  );
}
