import Link from "next/link";

import { OriginChip } from "@/components/agents";
import { Icon } from "@/components/ui/Icon";
import { EmptyState, ErrorState, NoPermissionState } from "@/components/ui";
import { agentsPageHref, reservationHref } from "@/core/reservations/agents-routes";
import { formatShortDate } from "@/core/reservations/format";
import { parseSearchQuery, searchReservations, type SearchHit } from "@/core/reservations/search";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadSchedule, searchReservationRows, type ReservationRecordLite } from "@/services/reservations-gateway";

import { requireAgentsPage } from "../../../agents-context";

export const dynamic = "force-dynamic";

function Highlighted({ text, range }: { text: string; range: readonly [number, number] | null }) {
  if (range === null) return <>{text}</>;
  return (
    <>
      {text.slice(0, range[0])}
      <mark className="rounded bg-pending-bg px-0.5 text-pending-text">{text.slice(range[0], range[1])}</mark>
      {text.slice(range[1])}
    </>
  );
}

function Results({ id, hits }: { id: string; hits: readonly SearchHit<ReservationRecordLite>[] }) {
  const t = es.agents.agenda.search;
  return (
    <ul className="divide-y divide-border/60 rounded-card border border-border bg-surface">
      {hits.map(({ reservation: r, nameRange }) => (
        <li key={r.id}>
          <Link
            href={reservationHref(id, r.id)}
            className="flex min-h-[56px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 hover:bg-soft-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-cuotly-green"
          >
            <span className="w-24 text-sm text-text-secondary">{formatShortDate(r.date)}</span>
            <span className="w-14 font-bold tabular-nums">{r.time}</span>
            <span className={`min-w-0 flex-1 font-semibold [overflow-wrap:anywhere] ${r.status === "cancelled" ? "text-status-muted line-through" : ""}`}>
              <Highlighted text={r.customerName} range={nameRange} />
            </span>
            <span className="flex items-center gap-1 text-sm tabular-nums text-text-secondary">
              <Icon name="person" className="h-4 w-4" />
              {es.agents.agenda.common.peopleShort(r.partySize)}
            </span>
            <OriginChip origin={r.source} platformName={r.platformName} muted={r.status === "cancelled"} />
            <span className="text-sm text-text-secondary">{t.statuses[r.status]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Reservas · Buscar (RES-09; PRD de agents §11.1, `Buscar`): por nombre o por teléfono
 * (bastan los 3 últimos números), en los últimos 30 días y todas las futuras. Los
 * resultados salen agrupados en «Próximas» y «Últimos 30 días», con la coincidencia
 * resaltada. El filtro lo aplica la base de datos (`reservations_search`), que solo
 * devuelve lo que la RLS deja leer a esta persona.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q = "" } = await searchParams;
  const access = await requireAgentsPage(id, "search");
  const t = es.agents.agenda;
  if (access.kind === "denied") return <NoPermissionState />;

  const query = parseSearchQuery(q);
  const supabase = await createClient();

  let hits: { upcoming: readonly SearchHit<ReservationRecordLite>[]; past: readonly SearchHit<ReservationRecordLite>[] } | null = null;
  let failed = false;
  if (query.kind === "name" || query.kind === "phone") {
    try {
      const [rows, schedule] = await Promise.all([searchReservationRows(supabase, id, q), loadSchedule(supabase, id)]);
      if (schedule === null) throw new Error("sin ajustes");
      hits = searchReservations(query, rows, new Date(), schedule.timeZone);
    } catch {
      failed = true;
    }
  }
  const total = hits ? hits.upcoming.length + hits.past.length : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <form method="get" role="search" className="flex items-center gap-2">
        <label htmlFor="q" className="flex min-h-[48px] flex-1 items-center gap-2 rounded-field border border-border bg-surface px-3 focus-within:border-cuotly-green">
          <Icon name="search" className="h-5 w-5 text-text-secondary" />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            autoFocus
            autoComplete="off"
            aria-label={t.search.label}
            placeholder={t.search.placeholder}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
          />
        </label>
        <button type="submit" className="min-h-[48px] rounded-field bg-primary px-4 text-sm font-semibold text-surface hover:bg-primary-dark">
          {t.search.submit}
        </button>
        <Link href={agentsPageHref(id, "today")} className="inline-flex min-h-[48px] items-center px-2 text-sm font-semibold text-text-secondary underline">
          {t.search.close}
        </Link>
      </form>

      <p className="text-sm text-text-secondary">{t.search.hint}</p>

      {query.kind === "too_short" ? <p role="status" className="text-sm">{t.search.tooShort}</p> : null}
      {failed ? <ErrorState title={t.search.failedTitle} description={t.search.failedReason} /> : null}

      {hits && total === 0 ? <EmptyState title={t.search.none(q.trim())} description={t.search.noneReason} /> : null}
      {hits && hits.upcoming.length > 0 ? (
        <section aria-label={t.search.upcoming} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">{t.search.upcoming}</h2>
          <Results id={id} hits={hits.upcoming} />
        </section>
      ) : null}
      {hits && hits.past.length > 0 ? (
        <section aria-label={t.search.past} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">{t.search.past}</h2>
          <Results id={id} hits={hits.past} />
        </section>
      ) : null}
      {hits && total > 0 ? <p className="text-sm text-text-secondary">{t.search.results(total)}</p> : null}
    </div>
  );
}
