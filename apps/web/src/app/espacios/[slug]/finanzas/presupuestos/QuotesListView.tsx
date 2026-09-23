import Link from "next/link";

import {
  ButtonLink,
  Card,
  EmptyState,
  FilterBar,
  FilterSearch,
  FilterSelect,
  PageHeader,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import type { QuoteListParams } from "@/core/quote-list";
import { isQuoteState, QUOTE_STATES, quoteTone } from "@/core/quotes";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";

import { FinanceTabs } from "../FinanceTabs";

const t = es.quotesTeam;

export type QuoteListRow = {
  readonly id: string;
  readonly code: string;
  readonly concept: string;
  readonly description: string | null;
  readonly establishment_id: string;
  readonly establishmentName: string;
  readonly totalCents: number;
  readonly createdAt: string;
  readonly sentAt: string | null;
  readonly status: string;
};

function Estado({ status, wrap = false }: { status: string; wrap?: boolean }) {
  return (
    <StatusBadge tone={isQuoteState(status) ? quoteTone(status) : "neutral"} wrap={wrap}>
      {isQuoteState(status) ? es.naming.states.quote[status] : status}
    </StatusBadge>
  );
}

/**
 * M49 · los presupuestos como el dibujo: buscador y dos filtros, la tabla
 * y a la derecha el elegido (`?presupuesto=`). El elegido se abre en su
 * ficha (M50), que es donde están las acciones que el servidor comprueba.
 *
 * Del panel del dibujo no se copian "Entrega estimada", "Incluye" ni
 * "Versión": un presupuesto de Cuotly no guarda ninguna de las tres
 * (§84), y enseñarlas sería inventarlas.
 */
export function QuotesListView({
  slug,
  timeZone,
  params,
  total,
  rows,
  establishments,
  failed,
  canCreate,
}: {
  slug: string;
  timeZone: string;
  params: QuoteListParams;
  /** Cuántos presupuestos hay sin filtros. */
  total: number;
  rows: readonly QuoteListRow[];
  establishments: readonly { readonly id: string; readonly name: string }[];
  failed: boolean;
  canCreate: boolean;
}) {
  const base = `/espacios/${slug}/finanzas/presupuestos`;
  const hayFiltros = params.q !== "" || params.establishmentId !== null || params.state !== null;
  const elegido = rows.find((r) => r.id === params.selected) ?? null;
  const enlaceFila = (id: string) => {
    const q = new URLSearchParams();
    if (params.q) q.set("q", params.q);
    if (params.establishmentId) q.set("restaurante", params.establishmentId);
    if (params.state) q.set("estado", params.state);
    q.set("presupuesto", id);
    return `${base}?${q.toString()}`;
  };
  const dia = (v: string) => enZona(v, timeZone, { day: "numeric", month: "short", year: "numeric" });
  const nuevo = params.establishmentId ? `${base}/nuevo?restaurante=${params.establishmentId}` : `${base}/nuevo`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        subtitle={t.listSubtitle}
        actions={
          canCreate ? (
            <ButtonLink href={nuevo} icon="plus">
              {t.newLink}
            </ButtonLink>
          ) : null
        }
      />

      <FinanceTabs slug={slug} active="presupuestos" />

      <FilterBar action={base} hasFilters={hayFiltros}>
        <FilterSearch id="presupuestos-q" name="q" defaultValue={params.q} placeholder={t.searchPlaceholder} />
        <FilterSelect
          id="presupuestos-restaurante"
          name="restaurante"
          label={t.filterEstablishment}
          defaultValue={params.establishmentId ?? undefined}
          options={establishments.map((e) => ({ value: e.id, label: e.name }))}
        />
        <FilterSelect
          id="presupuestos-estado"
          name="estado"
          label={t.filterState}
          defaultValue={params.state ?? undefined}
          options={QUOTE_STATES.map((s) => ({ value: s, label: es.naming.states.quote[s] }))}
        />
      </FilterBar>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Card className="p-4! sm:p-5!">
          {failed ? (
            <EmptyState title={es.states.errorTitle} description={es.emptyReasons.error} />
          ) : total === 0 ? (
            <EmptyState title={t.listEmptyTitle} description={t.listEmptyReason} />
          ) : rows.length === 0 ? (
            <EmptyState title={t.filteredEmptyTitle} description={t.filteredEmptyReason} />
          ) : (
            <Table
              footer={
                <TableFooter>
                  <span>{es.ui.table.showing(rows.length, total, t.rowsNoun)}</span>
                </TableFooter>
              }
            >
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{t.codeColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.establishmentColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.conceptColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.dateColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.totalColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.stateColumn}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((q) => (
                  <TableRow key={q.id} highlight={q.id === params.selected}>
                    <TableCell>
                      <Link
                        href={enlaceFila(q.id)}
                        aria-current={q.id === params.selected ? "true" : undefined}
                        className="whitespace-nowrap font-semibold text-cuotly-green hover:underline"
                      >
                        {q.code}
                      </Link>
                    </TableCell>
                    <TableCell>{q.establishmentName}</TableCell>
                    <TableCell>
                      <span className="block max-w-56 truncate text-text-secondary" title={q.concept}>
                        {q.concept}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="whitespace-nowrap">{dia(q.createdAt)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{euros(q.totalCents)}</span>
                    </TableCell>
                    <TableCell>
                      <Estado status={q.status} wrap />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card title={t.selectedTitle} className="lg:sticky lg:top-4">
          {elegido === null ? (
            <EmptyState title={t.pickTitle} description={t.pickReason} />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-2xl font-bold text-primary-dark">{elegido.code}</p>
                <Estado status={elegido.status} />
              </div>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-text-secondary">{t.selectedEstablishment}</dt>
                <dd className="text-text">{elegido.establishmentName}</dd>
                <dt className="text-text-secondary">{t.selectedConcept}</dt>
                <dd className="text-text">{elegido.concept}</dd>
                <dt className="text-text-secondary">{t.selectedDate}</dt>
                <dd className="text-text">{dia(elegido.createdAt)}</dd>
                <dt className="text-text-secondary">{t.selectedTotal}</dt>
                <dd className="font-semibold text-text">{euros(elegido.totalCents)}</dd>
              </dl>
              <div>
                <p className="mb-1 text-sm font-semibold text-primary-dark">{t.selectedScope}</p>
                <p className="whitespace-pre-wrap text-sm text-text-secondary">
                  {elegido.description?.trim() || t.selectedScopeNone}
                </p>
              </div>
              <p className="rounded-[10px] bg-soft-surface px-3 py-2 text-xs text-text-secondary">
                {elegido.sentAt ? t.selectedSentAt(dia(elegido.sentAt)) : t.selectedNotSent}
              </p>
              <ButtonLink href={`${base}/${elegido.id}`} variant="secondary" className="w-full">
                {t.openQuote}
              </ButtonLink>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
