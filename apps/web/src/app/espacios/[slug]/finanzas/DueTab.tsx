import Link from "next/link";

import {
  ButtonLink,
  Card,
  EmptyState,
  FilterBar,
  FilterSelect,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { DUE_FILTERS, calendarDaysBetween, reminderSchedule, type DueFilter } from "@/core/finance-due";
import { todayInTimeZone } from "@/core/finance";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";

import { chargeTone } from "./charge-tone";

const t = es.teamArea.finance;
type ChargeStateKey = keyof typeof es.teamArea.chargeStates;

export type DueRow = {
  readonly id: string;
  readonly establishmentId: string;
  readonly establishment: string;
  readonly concept: string;
  readonly dueAt: string;
  readonly baseCents: number;
  readonly taxCents: number;
  readonly taxRatePercent: number;
  readonly totalCents: number;
  readonly outstanding: number;
  readonly status: string;
};

/**
 * M52 · Vencimientos: los cobros con deuda viva, del que venció antes al
 * que vence después, y a la derecha el elegido con sus importes y los tres
 * avisos de RN-REC-01 con su fecha.
 *
 * El dibujo marca cada aviso como "enviado". Aquí se dice si su fecha
 * **llegó**: lo que le llega al restaurante queda en sus avisos, que el
 * equipo no lee, y puede tener apagado el del vencimiento (RN-REC-05).
 * Afirmar "enviado" sería decir algo que esta pantalla no sabe.
 */
export function DueTab({
  slug,
  timeZone,
  now,
  total,
  rows,
  establishments,
  filters,
  selectedId,
}: {
  slug: string;
  timeZone: string;
  now: Date;
  /** Cuántos cobros con deuda hay sin filtros. */
  total: number;
  rows: readonly DueRow[];
  establishments: readonly { readonly id: string; readonly name: string }[];
  filters: { readonly establishmentId: string | null; readonly state: DueFilter | null };
  selectedId: string | null;
}) {
  const base = `/espacios/${slug}/finanzas`;
  const hoy = todayInTimeZone(now, timeZone);
  const hayFiltros = filters.establishmentId !== null || filters.state !== null;
  const elegido = rows.find((r) => r.id === selectedId) ?? null;
  const dia = (v: string) => enZona(v, timeZone, { day: "numeric", month: "short", year: "numeric" });
  const relativo = (dueAt: string) => {
    const n = calendarDaysBetween(hoy, todayInTimeZone(new Date(dueAt), timeZone));
    return n >= 0 ? t.dueInDays(n) : t.dueAgoDays(-n);
  };
  const enlaceFila = (id: string) => {
    const q = new URLSearchParams({ tab: "vencimientos" });
    if (filters.establishmentId) q.set("restaurante", filters.establishmentId);
    if (filters.state) q.set("situacion", filters.state);
    q.set("cobro", id);
    return `${base}?${q.toString()}`;
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">{t.dueSubtitle}</p>

      <FilterBar action={base} hasFilters={hayFiltros} hidden={{ tab: "vencimientos" }}>
        <FilterSelect
          id="vencimientos-restaurante"
          name="restaurante"
          label={t.dueFilterEstablishment}
          defaultValue={filters.establishmentId ?? undefined}
          options={establishments.map((e) => ({ value: e.id, label: e.name }))}
        />
        <FilterSelect
          id="vencimientos-situacion"
          name="situacion"
          label={t.dueFilterState}
          defaultValue={filters.state ?? undefined}
          options={DUE_FILTERS.map((f) => ({ value: f, label: t.dueFilters[f] }))}
        />
      </FilterBar>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="p-4! sm:p-5!">
          {total === 0 ? (
            <EmptyState title={t.dueNoneTitle} description={t.dueNoneReason} />
          ) : rows.length === 0 ? (
            <EmptyState title={t.dueFilteredTitle} description={t.dueFilteredReason} />
          ) : (
            <Table
              footer={
                <TableFooter>
                  <span>{es.ui.table.showing(rows.length, total, t.chargesTitle.toLowerCase())}</span>
                </TableFooter>
              }
            >
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{t.establishmentColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.conceptColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.dueColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.outstandingColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.statusColumn}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} highlight={r.id === selectedId}>
                    <TableCell>
                      <Link
                        href={enlaceFila(r.id)}
                        aria-current={r.id === selectedId ? "true" : undefined}
                        className="font-semibold text-cuotly-green hover:underline"
                      >
                        {r.establishment}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-56 truncate text-text-secondary" title={r.concept}>
                        {r.concept}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="block whitespace-nowrap">{dia(r.dueAt)}</span>
                      <span className={`block text-xs ${r.status === "overdue" ? "text-danger" : "text-text-secondary"}`}>
                        {relativo(r.dueAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{euros(r.outstanding)}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={chargeTone(r.status)}>
                        {es.teamArea.chargeStates[r.status as ChargeStateKey] ?? r.status}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* En el teléfono, sin nada elegido no se pinta el hueco vacío
            del detalle bajo la lista: la lista es la pantalla. */}
        <Card title={t.dueDetailTitle} className={`lg:sticky lg:top-4 ${elegido === null ? "hidden lg:block" : ""}`}>
          {elegido === null ? (
            <EmptyState title={t.duePickTitle} description={t.duePickReason} />
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-primary-dark">{elegido.establishment}</p>
                  <p className="text-sm text-text-secondary">{elegido.concept}</p>
                </div>
                <StatusBadge tone={chargeTone(elegido.status)}>
                  {es.teamArea.chargeStates[elegido.status as ChargeStateKey] ?? elegido.status}
                </StatusBadge>
              </div>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-text-secondary">{t.dueColumn}</dt>
                <dd className={elegido.status === "overdue" ? "text-danger" : "text-text"}>
                  {dia(elegido.dueAt)} ({relativo(elegido.dueAt)})
                </dd>
                <dt className="text-text-secondary">{t.detailBase}</dt>
                <dd className="text-text">{euros(elegido.baseCents)}</dd>
                <dt className="text-text-secondary">{t.detailTax(elegido.taxRatePercent)}</dt>
                <dd className="text-text">{euros(elegido.taxCents)}</dd>
                <dt className="font-semibold text-text">{t.detailTotal}</dt>
                <dd className="font-semibold text-text">{euros(elegido.totalCents)}</dd>
                <dt className="text-text-secondary">{t.detailOutstanding}</dt>
                <dd className="font-semibold text-danger">{euros(elegido.outstanding)}</dd>
              </dl>

              <div>
                <p className="mb-2 text-sm font-semibold text-primary-dark">{t.remindersTitle}</p>
                <ol className="space-y-2">
                  {reminderSchedule(new Date(elegido.dueAt), now).map((paso) => (
                    <li key={paso.kind} className="flex items-start gap-2.5 text-sm">
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                          paso.reached ? (paso.kind === "due" ? "bg-cuotly-green" : "bg-danger") : "bg-text-secondary/40"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-text">{t.reminderSteps[paso.kind]}</span>
                        <span className="block text-xs text-text-secondary">
                          {enZona(paso.at.toISOString(), timeZone, { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                          {paso.reached ? t.reminderReached : t.reminderUpcoming}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 flex items-start gap-2 rounded-[10px] bg-soft-surface p-3 text-xs text-text-secondary">
                  <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
                  {t.remindersHint}
                </p>
              </div>

              <div className="grid gap-2">
                <ButtonLink href={`${base}?tab=pagos&cobro=${elegido.id}`} className="w-full">
                  {t.registerFromList}
                </ButtonLink>
                <ButtonLink href={`${base}/cobros/${elegido.id}`} variant="outline" className="w-full">
                  {t.openFullCharge}
                </ButtonLink>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
