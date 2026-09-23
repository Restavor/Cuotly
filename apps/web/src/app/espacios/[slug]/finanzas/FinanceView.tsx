import Link from "next/link";
import type { ReactNode } from "react";

import {
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  StatCard,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
} from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { addMonths } from "@/core/client-calendar";
import type { FinanceTab } from "@/core/finance-summary";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";

const t = es.teamArea.finance;
type ChargeStateKey = keyof typeof es.teamArea.chargeStates;
type StageKey = keyof typeof es.teamArea.dunningStages;

export function chargeTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "paid" || status === "waived") return "success";
  if (status === "overdue") return "danger";
  if (status === "partially_paid" || status === "refunded") return "warning";
  return "neutral";
}

export type FinanceChargeRow = {
  readonly id: string;
  readonly issuedAt: string;
  readonly establishment: string;
  readonly concept: string;
  readonly baseCents: number;
  readonly taxCents: number;
  readonly taxRatePercent: number;
  readonly totalCents: number;
  readonly status: string;
  readonly outstanding: number;
  /** El restaurante ha subido justificante y aún queda algo por cobrar. */
  readonly receiptWaiting: boolean;
};

export type FinanceSummaryData = {
  readonly collected: number;
  readonly collectedChange: number | null;
  readonly pending: number;
  readonly pendingCount: number;
  readonly overdue: number;
  readonly overdueCount: number;
  readonly issued: number;
  readonly recurring: number;
  /** Los doce meses; `null` en un mes que no se pudo leer. */
  readonly monthly: readonly { readonly month: string; readonly collected: number | null }[];
};

/**
 * M16 · Finanzas del espacio, como el dibujo: el mes arriba a la derecha,
 * las pestañas, tres cifras, el gráfico de cobros mensuales, el estado de
 * cobros y la tabla. Solo pinta: todas las cifras llegan hechas del
 * servidor (`financial_dashboard()`, `charge_status()`).
 */
export function FinanceView({
  slug,
  timeZone,
  month,
  today,
  tab,
  summary,
  rows,
  nonpayment,
}: {
  slug: string;
  timeZone: string;
  month: string;
  today: string;
  tab: FinanceTab;
  summary: FinanceSummaryData;
  rows: readonly FinanceChargeRow[];
  nonpayment: readonly {
    readonly establishmentId: string;
    readonly name: string;
    readonly oldestDueAt: string;
    readonly outstandingCents: number;
    readonly stage: string;
  }[];
}) {
  const base = `/espacios/${slug}/finanzas`;
  const esteMes = today.slice(0, 7);
  const enlace = (cambios: { month?: string; tab?: FinanceTab }) => {
    const m = cambios.month ?? month;
    const pestana = cambios.tab ?? tab;
    const q = new URLSearchParams();
    if (pestana !== "resumen") q.set("tab", pestana);
    if (m !== esteMes) q.set("mes", m);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const nombreMes = (m: string, opciones: Intl.DateTimeFormatOptions) =>
    enZona(`${m}-01`, timeZone, opciones);
  const tituloMes = mayuscula(nombreMes(month, { month: "long", year: "numeric" }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        subtitle={t.subtitleMonth}
        actions={
          tab === "resumen" ? (
            <SelectorDeMes
              label={tituloMes}
              prev={enlace({ month: addMonths(month, -1) })}
              next={month >= esteMes ? null : enlace({ month: addMonths(month, 1) })}
            />
          ) : null
        }
      />

      <Tabs
        label={t.title}
        active={tab}
        tabs={[
          { key: "resumen", label: t.tabSummary, href: enlace({ tab: "resumen" }) },
          { key: "cobros", label: t.tabCharges, href: enlace({ tab: "cobros" }) },
          { key: "presupuestos", label: t.tabQuotes, href: `${base}/presupuestos` },
        ]}
      />

      {tab === "resumen" ? (
        <>
          <section aria-label={tituloMes} className="grid gap-4 md:grid-cols-3">
            <StatCard
              icon="finance"
              tone="green"
              label={t.cardCollected}
              value={euros(summary.collected)}
              hint={
                summary.collectedChange === null ? (
                  t.noPreviousToCompare
                ) : (
                  <span className="inline-flex items-center gap-1 font-semibold text-text">
                    <Icon
                      name={summary.collectedChange >= 0 ? "arrowUp" : "arrowDown"}
                      className="h-3.5 w-3.5"
                    />
                    {t.changeVsPrevious(summary.collectedChange)}
                  </span>
                )
              }
            />
            <StatCard
              icon="clock"
              tone="info"
              label={t.cardPending}
              value={euros(summary.pending)}
              hint={t.chargesCount(summary.pendingCount)}
            />
            <StatCard
              icon="alert"
              tone="danger"
              label={t.cardOverdue}
              value={euros(summary.overdue)}
              hint={t.chargesCount(summary.overdueCount)}
            />
          </section>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card title={t.monthlyTitle}>
              <p className="-mt-2 mb-4 text-sm text-text-secondary">{t.monthlyHint}</p>
              <Barras
                meses={summary.monthly.map((m) => ({
                  ...m,
                  corto: nombreMes(m.month, { month: "short" }).replace(".", ""),
                  largo: mayuscula(nombreMes(m.month, { month: "long", year: "numeric" })),
                  href: enlace({ month: m.month }),
                }))}
                elegido={month}
              />
            </Card>

            <Card title={t.statusTitle}>
              <ul className="space-y-4">
                <FilaEstado color="bg-success" label={t.collectedLabel} cents={summary.collected} total={summary.issued} />
                <FilaEstado color="bg-warning" label={t.pendingLabel} cents={summary.pending} total={summary.issued} />
                <FilaEstado color="bg-danger" label={t.overdueLabel} cents={summary.overdue} total={summary.issued} />
              </ul>
              <div className="mt-5 space-y-1 border-t border-border pt-3 text-sm text-text-secondary">
                <p>{t.statusIssued(euros(summary.issued))}</p>
                <p>{t.statusRecurring(euros(summary.recurring))}</p>
              </div>
            </Card>
          </div>

          <TablaDeCobros
            title={t.monthChargesTitle}
            rows={rows}
            timeZone={timeZone}
            base={base}
          />

          <Card title={t.nonpaymentTitle}>
            {nonpayment.length === 0 ? (
              <EmptyState title={t.nonpaymentEmptyTitle} description={t.nonpaymentEmptyReason} />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{t.establishmentColumn}</TableHeaderCell>
                    <TableHeaderCell>{t.oldestDueColumn}</TableHeaderCell>
                    <TableHeaderCell>{t.outstandingColumn}</TableHeaderCell>
                    <TableHeaderCell>{t.stageColumn}</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {nonpayment.map((row) => (
                    <TableRow key={row.establishmentId}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{enZona(row.oldestDueAt, timeZone, { dateStyle: "short" })}</TableCell>
                      <TableCell>{euros(row.outstandingCents)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={row.stage === "suspended" ? "danger" : "warning"}>
                          {es.teamArea.dunningStages[row.stage as StageKey] ?? row.stage}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      ) : (
        <TablaDeCobros title={t.allChargesTitle} rows={rows} timeZone={timeZone} base={base} />
      )}
    </div>
  );
}

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function SelectorDeMes({ label, prev, next }: { label: string; prev: string; next: string | null }) {
  return (
    <div className="flex items-center gap-1 rounded-[10px] border border-border bg-surface px-2 py-1.5">
      <Link
        href={prev}
        aria-label={t.previousMonth}
        className="rounded p-1 text-text-secondary hover:bg-soft-surface hover:text-text"
      >
        <Icon name="arrowLeft" className="h-4 w-4" />
      </Link>
      <span className="flex min-w-40 items-center justify-center gap-2 text-sm font-semibold text-text">
        <Icon name="calendar" className="h-4 w-4 text-text-secondary" />
        {label}
      </span>
      {next === null ? (
        <span className="w-6" />
      ) : (
        <Link
          href={next}
          aria-label={t.nextMonth}
          className="rounded p-1 text-text-secondary hover:bg-soft-surface hover:text-text"
        >
          <Icon name="arrowRight" className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

/**
 * El gráfico de cobros mensuales. Barras de CSS, sin librería: doce
 * columnas no la necesitan. La altura es relativa al mes más alto de los
 * doce; cada barra lleva su importe escrito para el lector de pantalla y
 * lleva a ese mes. Un mes que no se pudo leer se dice, no se pinta a cero.
 */
function Barras({
  meses,
  elegido,
}: {
  meses: readonly {
    month: string;
    collected: number | null;
    corto: string;
    largo: string;
    href: string;
  }[];
  elegido: string;
}): ReactNode {
  const maximo = Math.max(1, ...meses.map((m) => m.collected ?? 0));
  return (
    <ol className="flex h-52 items-end gap-1.5 sm:gap-2.5">
      {meses.map((m) => {
        const activo = m.month === elegido;
        const alto = m.collected === null ? 0 : Math.max(2, (m.collected / maximo) * 100);
        return (
          <li key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
            <Link
              href={m.href}
              title={m.collected === null ? `${m.largo}: ${t.monthlyFailed}` : t.monthlyBarLabel(m.largo, euros(m.collected))}
              className="flex h-full w-full flex-col items-center justify-end rounded-t-md focus:outline focus:outline-2 focus:outline-cuotly-green"
            >
              <span className="sr-only">
                {m.collected === null ? `${m.largo}: ${t.monthlyFailed}` : t.monthlyBarLabel(m.largo, euros(m.collected))}
              </span>
              {m.collected === null ? (
                <span aria-hidden="true" className="mb-1 text-[10px] text-text-secondary">
                  —
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className={`w-full max-w-10 rounded-t-md transition-colors ${
                    activo ? "bg-primary-dark" : "bg-cuotly-green/60 hover:bg-cuotly-green"
                  }`}
                  style={{ height: `${alto}%` }}
                />
              )}
            </Link>
            <span
              aria-hidden="true"
              className={`text-[11px] capitalize ${activo ? "font-bold text-text" : "text-text-secondary"}`}
            >
              {m.corto}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function FilaEstado({
  color,
  label,
  cents,
  total,
}: {
  color: string;
  label: string;
  cents: number;
  total: number;
}) {
  const ancho = total > 0 ? Math.min(100, (cents / total) * 100) : 0;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_9rem_minmax(0,1fr)_auto] items-center gap-3">
      <span aria-hidden="true" className={`h-3 w-3 rounded-full ${color}`} />
      <span className="text-sm text-text">{label}</span>
      <span aria-hidden="true" className="col-span-3 row-start-2 h-2 overflow-hidden rounded-full bg-soft-surface sm:col-span-1 sm:row-start-auto">
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${ancho}%` }} />
      </span>
      <span className="text-right text-sm font-semibold text-text">{euros(cents)}</span>
    </li>
  );
}

function TablaDeCobros({
  title,
  rows,
  timeZone,
  base,
}: {
  title: string;
  rows: readonly FinanceChargeRow[];
  timeZone: string;
  base: string;
}) {
  const tipos = [...new Set(rows.map((r) => r.taxRatePercent))];
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <EmptyState title={t.chargesEmptyTitle} description={t.chargesEmptyReason} />
      ) : (
        <Table
          footer={
            <TableFooter>
              <span>{es.ui.table.showing(rows.length, rows.length, t.chargesTitle.toLowerCase())}</span>
            </TableFooter>
          }
        >
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t.issuedColumn}</TableHeaderCell>
              <TableHeaderCell>{t.establishmentColumn}</TableHeaderCell>
              <TableHeaderCell>{t.conceptColumn}</TableHeaderCell>
              <TableHeaderCell>{t.baseColumn}</TableHeaderCell>
              {/* Con un solo tipo de IVA en la tabla, va en la cabecera como en el dibujo. */}
              <TableHeaderCell>{tipos.length === 1 ? t.taxColumn(tipos[0]) : t.taxColumnPlain}</TableHeaderCell>
              <TableHeaderCell>{t.totalColumn}</TableHeaderCell>
              <TableHeaderCell>{t.statusColumn}</TableHeaderCell>
              <TableHeaderCell>{t.actionsColumn}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{enZona(row.issuedAt, timeZone, { dateStyle: "short" })}</TableCell>
                <TableCell>
                  <span className="font-medium">{row.establishment}</span>
                </TableCell>
                <TableCell>
                  <span className="block max-w-64 truncate text-text-secondary" title={row.concept}>
                    {row.concept}
                  </span>
                </TableCell>
                <TableCell>{euros(row.baseCents)}</TableCell>
                <TableCell>
                  {euros(row.taxCents)}
                  {tipos.length === 1 ? null : (
                    <span className="block text-xs text-text-secondary">{`${row.taxRatePercent} %`}</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="font-semibold">{euros(row.totalCents)}</span>
                </TableCell>
                <TableCell>
                  <span className="flex flex-col items-start gap-1">
                    <StatusBadge tone={chargeTone(row.status)}>
                      {es.teamArea.chargeStates[row.status as ChargeStateKey] ?? row.status}
                    </StatusBadge>
                    {row.receiptWaiting ? (
                      <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                        <Icon name="document" className="h-3.5 w-3.5" />
                        {t.receiptWaiting}
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell>
                  <ButtonLink
                    href={`${base}/cobros/${row.id}`}
                    variant={row.outstanding > 0 ? "secondary" : "outline"}
                    size="sm"
                  >
                    {row.outstanding > 0 ? t.registerFromList : t.openCharge}
                  </ButtonLink>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
