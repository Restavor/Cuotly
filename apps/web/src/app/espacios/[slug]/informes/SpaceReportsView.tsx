import Link from "next/link";
import type { ReactNode } from "react";

import { AutoSubmitForm } from "@/components/panel/AutoSubmitForm";
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  StatCard,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
} from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { addMonths } from "@/core/client-calendar";
import { INTEGRATION_PROVIDERS } from "@/core/integrations";
import type { SpaceReportTab } from "@/core/space-reports";
import { percentChange } from "@/core/finance-summary";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";

import type { DigitalPanel, FinancePanel, OperationPanel } from "./dashboard-load";

const t = es.reportsPage.dashboard;
type ReasonKey = keyof typeof es.emptyReasons;

export type SpaceReportsContent =
  | { readonly tab: "operacion"; readonly data: OperationPanel | null }
  | { readonly tab: "finanzas"; readonly data: FinancePanel | null }
  | { readonly tab: "digital"; readonly data: DigitalPanel | null }
  | { readonly tab: "generados"; readonly library: ReactNode };

/**
 * M18 y M65 a M68 · Informes con sus cuatro pestañas, como el dibujo: el
 * mes y el restaurante arriba a la derecha, y en cada pestaña sus cifras.
 * Todas llegan hechas (`dashboard-load.ts`); aquí solo se pintan, y cada
 * una que falta dice por qué.
 *
 * Del dibujo no se copian "Datos de ejemplo" ni el botón "Exportar" de los
 * paneles: el PDF y el CSV salen de cada informe (§95), que es lo que se
 * envía a un restaurante, no de esta vista de trabajo.
 */
export function SpaceReportsView({
  slug,
  timeZone,
  month,
  today,
  establishmentId,
  establishments,
  content,
}: {
  slug: string;
  timeZone: string;
  month: string;
  today: string;
  establishmentId: string | null;
  establishments: readonly { readonly id: string; readonly name: string }[];
  content: SpaceReportsContent;
}) {
  const base = `/espacios/${slug}/informes`;
  const esteMes = today.slice(0, 7);
  const enlace = (cambios: { tab?: SpaceReportTab; month?: string }) => {
    const q = new URLSearchParams();
    q.set("tab", cambios.tab ?? content.tab);
    const m = cambios.month ?? month;
    if (m !== esteMes) q.set("mes", m);
    if (establishmentId) q.set("restaurante", establishmentId);
    return `${base}?${q.toString()}`;
  };
  const tituloMes = mayuscula(enZona(`${month}-01`, timeZone, { month: "long", year: "numeric" }));
  const conFiltros = content.tab !== "generados";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        actions={
          conFiltros ? (
            <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
              <div className="flex items-center gap-1 rounded-[10px] border border-border bg-surface px-2 py-1.5">
                <Link
                  href={enlace({ month: addMonths(month, -1) })}
                  aria-label={t.previousMonth}
                  className="rounded p-1 text-text-secondary hover:bg-soft-surface hover:text-text"
                >
                  <Icon name="arrowLeft" className="h-4 w-4" />
                </Link>
                <span className="flex min-w-40 items-center justify-center gap-2 text-sm font-semibold text-text">
                  <Icon name="calendar" className="h-4 w-4 text-text-secondary" />
                  {tituloMes}
                </span>
                {month >= esteMes ? (
                  <span className="w-6" />
                ) : (
                  <Link
                    href={enlace({ month: addMonths(month, 1) })}
                    aria-label={t.nextMonth}
                    className="rounded p-1 text-text-secondary hover:bg-soft-surface hover:text-text"
                  >
                    <Icon name="arrowRight" className="h-4 w-4" />
                  </Link>
                )}
              </div>
              <AutoSubmitForm action={base} submitLabel={t.apply} className="flex w-full items-end gap-2 sm:w-auto">
                <input type="hidden" name="tab" value={content.tab} />
                {month !== esteMes ? <input type="hidden" name="mes" value={month} /> : null}
                <label className="min-w-0 flex-1 text-sm font-medium text-text sm:flex-none">
                  <span className="sr-only">{t.establishmentLabel}</span>
                  <select
                    name="restaurante"
                    defaultValue={establishmentId ?? ""}
                    className="w-full min-w-0 rounded-[10px] sm:w-auto sm:min-w-52 border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
                  >
                    <option value="">{t.allEstablishments}</option>
                    {establishments.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
              </AutoSubmitForm>
            </div>
          ) : null
        }
      />

      <Tabs
        label={t.title}
        active={content.tab}
        tabs={(["operacion", "finanzas", "digital", "generados"] as const).map((key) => ({
          key,
          label: t.tabs[key],
          href: enlace({ tab: key }),
        }))}
      />

      {content.tab === "generados" ? (
        content.library
      ) : content.data === null ? (
        <Card>
          <ErrorState title={t.failedTitle} description={t.failedReason} />
        </Card>
      ) : content.tab === "operacion" ? (
        <Operacion data={content.data} />
      ) : content.tab === "finanzas" ? (
        <Finanzas data={content.data} slug={slug} />
      ) : (
        <Digital data={content.data} slug={slug} timeZone={timeZone} />
      )}
    </div>
  );
}

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function Variacion({ actual, anterior }: { actual: number; anterior: number | null }) {
  const pct = percentChange(actual, anterior);
  if (pct === null) return <>{t.noPrevious}</>;
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-text">
      <Icon name={pct >= 0 ? "arrowUp" : "arrowDown"} className="h-3.5 w-3.5" />
      {t.vsPrevious(pct)}
    </span>
  );
}

function horas(minutos: number | null): string {
  if (minutos === null) return "—";
  return t.hours((minutos / 60).toLocaleString("es-ES", { maximumFractionDigits: 1 }));
}

function Operacion({ data }: { data: OperationPanel }) {
  const { current, previous } = data;
  const maximo = Math.max(1, ...data.workers.map((w) => w.assigned));
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          icon="job"
          tone="green"
          label={t.jobsCompleted}
          value={current.jobsCompleted}
          hint={<Variacion actual={current.jobsCompleted} anterior={previous?.jobsCompleted ?? null} />}
        />
        <StatCard
          icon="request"
          tone="info"
          label={t.requestsReceived}
          value={current.requestsReceived}
          hint={<Variacion actual={current.requestsReceived} anterior={previous?.requestsReceived ?? null} />}
        />
        <StatCard
          icon="clock"
          tone="neutral"
          label={t.averageStart}
          value={horas(current.averageStartMinutes)}
          hint={current.averageStartMinutes === null ? t.notApplicable : t.averageStartHint}
        />
        <StatCard
          icon="check"
          tone="green"
          label={t.executionCompliance}
          value={current.executionCompliancePercent === null ? "—" : `${current.executionCompliancePercent} %`}
          hint={current.executionCompliancePercent === null ? t.notApplicable : t.executionComplianceHint}
        />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card title={t.workloadTitle}>
          <p className="-mt-2 mb-4 text-sm text-text-secondary">{t.workloadHint}</p>
          {data.workers.length === 0 ? (
            <EmptyState title={t.workloadEmpty} />
          ) : (
            <>
              <p className="mb-3 flex gap-4 text-xs text-text-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-cuotly-green/40" />
                  {t.workloadAssigned}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-cuotly-green" />
                  {t.workloadCompleted}
                </span>
              </p>
              <ul className="space-y-4">
                {data.workers.map((w) => (
                  <li key={w.userId} className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-3">
                    <span className="truncate text-sm font-medium text-text">{w.name}</span>
                    <span className="space-y-1">
                      <Barra valor={w.assigned} maximo={maximo} clase="bg-cuotly-green/40" etiqueta={`${t.workloadAssigned}: ${w.assigned}`} />
                      <Barra valor={w.completed} maximo={maximo} clase="bg-cuotly-green" etiqueta={`${t.workloadCompleted}: ${w.completed}`} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title={t.delaysTitle}>
          <p className="-mt-2 mb-4 text-sm text-text-secondary">{t.delaysHint}</p>
          {data.attention.length === 0 ? (
            <EmptyState title={t.delaysEmpty} />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{t.codeColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.establishmentColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.stateColumn}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.attention.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={a.deepLink} className="font-semibold text-cuotly-green hover:underline">
                        {a.code}
                      </Link>
                    </TableCell>
                    <TableCell>{a.establishment ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge tone={a.kind === "job_blocked_by_client" ? "warning" : a.kind === "job_out_of_deadline" ? "danger" : "warning"}>
                        {t.delayKinds[a.kind]}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

function Barra({ valor, maximo, clase, etiqueta }: { valor: number; maximo: number; clase: string; etiqueta: string }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="h-3 flex-1 overflow-hidden rounded-full bg-soft-surface">
        <span className={`block h-full rounded-full ${clase}`} style={{ width: `${(valor / maximo) * 100}%` }} />
      </span>
      <span className="w-6 text-right text-xs font-semibold text-text">
        <span className="sr-only">{etiqueta}</span>
        <span aria-hidden="true">{valor}</span>
      </span>
    </span>
  );
}

function Finanzas({ data, slug }: { data: FinancePanel; slug: string }) {
  const f = `/espacios/${slug}/finanzas`;
  const totalOrigen = data.origin.recurring + data.origin.extras + data.origin.other;
  const acciones: { href: string; icon: IconName; titulo: string; pista: string }[] = [
    { href: `${f}?tab=cobros`, icon: "document", titulo: t.quickCharges, pista: t.quickChargesHint },
    { href: `${f}?tab=vencimientos`, icon: "alert", titulo: t.quickDue, pista: t.quickDueHint },
    { href: `${f}/presupuestos`, icon: "finance", titulo: t.quickQuotes, pista: t.quickQuotesHint },
  ];
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard icon="document" tone="neutral" label={t.issued} value={euros(data.issued)} />
        <StatCard icon="finance" tone="green" label={t.collected} value={euros(data.collected)} />
        <StatCard icon="clock" tone="info" label={t.outstanding} value={euros(data.outstanding)} />
        <StatCard icon="alert" tone="danger" label={t.overdueCharges} value={data.chargesOverdue} />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title={t.byEstablishmentTitle}>
          <p className="-mt-2 mb-4 text-sm text-text-secondary">{t.byEstablishmentHint}</p>
          {data.rows.length === 0 ? (
            <EmptyState title={t.digitalEmpty} />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{t.establishmentColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.planColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.colIssued}</TableHeaderCell>
                  <TableHeaderCell>{t.colCollected}</TableHeaderCell>
                  <TableHeaderCell>{t.colOutstanding}</TableHeaderCell>
                  <TableHeaderCell>{t.colOverdue}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.establishmentId}>
                    <TableCell>
                      <span className="font-medium">{r.name}</span>
                    </TableCell>
                    <TableCell>{r.plan ?? <span className="text-text-secondary">{t.noPlan}</span>}</TableCell>
                    <TableCell>{euros(r.issued)}</TableCell>
                    <TableCell>{euros(r.collected)}</TableCell>
                    <TableCell>{euros(r.outstanding)}</TableCell>
                    <TableCell>
                      <span className={r.chargesOverdue > 0 ? "font-semibold text-danger" : "text-text-secondary"}>
                        {r.chargesOverdue}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <div className="space-y-5">
          <Card title={t.originTitle}>
            <p className="-mt-2 mb-4 text-sm text-text-secondary">{t.originHint}</p>
            <ul className="space-y-3">
              {(
                [
                  ["bg-primary-dark", t.originRecurring, data.origin.recurring],
                  ["bg-cuotly-green/50", t.originExtras, data.origin.extras],
                  ["bg-text-secondary/40", t.originOther, data.origin.other],
                ] as const
              ).map(([color, label, cents]) => (
                <li key={label}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 text-text">
                      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${color}`} />
                      {label}
                    </span>
                    <span className="font-semibold text-text">
                      {euros(cents)}
                      {totalOrigen > 0 ? (
                        <span className="ml-1 text-xs font-normal text-text-secondary">
                          ({Math.round((cents / totalOrigen) * 100)} %)
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-soft-surface">
                    <span
                      className={`block h-full rounded-full ${color}`}
                      style={{ width: `${totalOrigen > 0 ? (cents / totalOrigen) * 100 : 0}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title={t.quickTitle}>
            <ul className="space-y-2">
              {acciones.map((a) => (
                <li key={a.href}>
                  <Link
                    href={a.href}
                    className="flex items-center gap-3 rounded-[12px] border border-border p-3 hover:border-cuotly-green hover:bg-soft-surface"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-cuotly-green/10 text-cuotly-green"
                    >
                      <Icon name={a.icon} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-text">{a.titulo}</span>
                      <span className="block text-xs text-text-secondary">{a.pista}</span>
                    </span>
                    <Icon name="chevronRight" className="h-4 w-4 text-text-secondary" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Digital({ data, slug, timeZone }: { data: DigitalPanel; slug: string; timeZone: string }) {
  const sesiones = data.rows.map((r) => r.sessions).filter((v): v is number => v !== null);
  const clics = data.rows.map((r) => r.clicks).filter((v): v is number => v !== null);
  const conDatos = data.rows.filter((r) => INTEGRATION_PROVIDERS.some((p) => r.providers[p].kind === "ok")).length;
  const ultima = data.rows.map((r) => r.lastUpdate).filter((v): v is string => v !== null).sort().at(-1) ?? null;
  const fecha = (v: string) => enZona(v, timeZone, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          icon="reports"
          tone="green"
          label={t.sessions}
          value={sesiones.length === 0 ? "—" : sesiones.reduce((a, b) => a + b, 0).toLocaleString("es-ES")}
          hint={sesiones.length === 0 ? es.emptyReasons.no_data_yet : undefined}
        />
        <StatCard
          icon="search"
          tone="info"
          label={t.clicks}
          value={clics.length === 0 ? "—" : clics.reduce((a, b) => a + b, 0).toLocaleString("es-ES")}
          hint={clics.length === 0 ? es.emptyReasons.no_data_yet : undefined}
        />
        <StatCard icon="building" tone="neutral" label={t.connected} value={`${conDatos}/${data.rows.length}`} />
        <StatCard icon="calendar" tone="neutral" label={t.lastSync} value={ultima ? fecha(ultima) : t.lastSyncNone} />
      </section>

      <Card title={t.digitalTitle}>
        <p className="-mt-2 mb-4 text-sm text-text-secondary">{t.digitalHint}</p>
        {data.rows.length === 0 ? (
          <EmptyState title={t.digitalEmpty} />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t.establishmentColumn}</TableHeaderCell>
                <TableHeaderCell>{t.colSessions}</TableHeaderCell>
                <TableHeaderCell>{t.colClicks}</TableHeaderCell>
                {INTEGRATION_PROVIDERS.map((p) => (
                  <TableHeaderCell key={p}>{t.providerShort[p]}</TableHeaderCell>
                ))}
                <TableHeaderCell>{t.colLastSync}</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">{es.ui.table.actions}</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.establishmentId}>
                  <TableCell>
                    <span className="font-medium">{r.name}</span>
                  </TableCell>
                  <TableCell>{r.sessions === null ? "—" : r.sessions.toLocaleString("es-ES")}</TableCell>
                  <TableCell>{r.clicks === null ? "—" : r.clicks.toLocaleString("es-ES")}</TableCell>
                  {INTEGRATION_PROVIDERS.map((p) => {
                    const celda = r.providers[p];
                    const motivo =
                      celda.kind === "ok"
                        ? null
                        : (es.emptyReasons[celda.reason as ReasonKey] ?? es.emptyReasons.no_data_yet);
                    return (
                      <TableCell key={p}>
                        <span
                          title={motivo ?? t.providerShort[p]}
                          className={`inline-block h-2.5 w-2.5 rounded-full ${
                            celda.kind === "ok" ? "bg-cuotly-green" : "bg-text-secondary/30"
                          }`}
                        />
                        <span className="sr-only">{motivo ?? t.providerOk}</span>
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    <span className="whitespace-nowrap text-text-secondary">
                      {r.lastUpdate ? fecha(r.lastUpdate) : t.lastSyncNone}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/espacios/${slug}/restaurantes/${r.establishmentId}?vista=datos&seccion=analitica`}
                      className="whitespace-nowrap text-sm font-semibold text-cuotly-green hover:underline"
                    >
                      {t.seeData}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="mt-4 flex items-start gap-2 rounded-[10px] bg-info/10 p-3 text-xs text-text">
          <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
          {t.sourcesNote}
        </p>
      </Card>
    </div>
  );
}
