import Link from "next/link";
import { notFound } from "next/navigation";

import { OriginChip, StatusChip } from "@/components/agents";
import { Icon } from "@/components/ui/Icon";
import { ButtonLink, EmptyState, ErrorState, NoPermissionState } from "@/components/ui";
import { agentsPageHref, editReservationHref, todayHref } from "@/core/reservations/agents-routes";
import { formatShortDate } from "@/core/reservations/format";
import { formatPhoneDisplay } from "@/core/reservations/phone";
import { VISIT_HISTORY_MONTHS, visitStats } from "@/core/reservations/lifecycle";
import { canReservations } from "@/core/reservations/permissions";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import {
  loadDuplicatePartners,
  loadHistory,
  loadReservation,
  loadSchedule,
  loadVisitHistory,
  type HistoryEvent,
} from "@/services/reservations-gateway";
import { realtimeChannelFor } from "@/services/reservations-realtime";

import { requireAgentsPage } from "../../../agents-context";
import { FichaActions } from "../_components/FichaActions";
import { OpenMarker } from "../_components/OpenMarker";
import { RealtimeRefresh } from "../_components/RealtimeRefresh";
import { describeEvent } from "../history-view";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reservas · Ficha (RES-03; PRD de agents §6.1, `Ficha`): la hora grande, el nombre, las
 * personas, el turno y la fecha, el estado y el origen, la nota, el teléfono con «Llamar»
 * (`tel:`), «Ha venido N veces · ha fallado M veces», el historial legible y las acciones.
 * Al abrirla se quita «Nueva».
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; reservaId: string }>;
  searchParams: Promise<{ cancelar?: string; rechazar?: string }>;
}) {
  const { id, reservaId } = await params;
  const sp = await searchParams;
  const access = await requireAgentsPage(id, "today");
  const t = es.agents.agenda;
  if (access.kind === "denied") return <NoPermissionState />;
  if (!UUID.test(reservaId)) notFound();

  const { nav } = access;
  const supabase = await createClient();
  let reservation;
  let schedule;
  try {
    [reservation, schedule] = await Promise.all([loadReservation(supabase, id, reservaId), loadSchedule(supabase, id)]);
  } catch {
    return <ErrorState title={t.common.failedLoad} description={t.common.failedLoadReason} />;
  }
  if (reservation === null || schedule === null) {
    return (
      <EmptyState
        title={t.common.notFoundTitle}
        description={t.common.notFoundReason}
        action={<ButtonLink href={reservation ? todayHref(id, reservation.date) : agentsPageHref(id, "today")} className="min-h-[44px]">{t.common.backToToday}</ButtonLink>}
      />
    );
  }
  const tz = schedule.timeZone;

  // El historial, las visitas y la pareja de una posible duplicada: si una lectura falla se dice, no se inventa.
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - VISIT_HISTORY_MONTHS);
  const [history, visits, partners] = await Promise.all([
    loadHistory(supabase, id, reservaId).catch((): readonly HistoryEvent[] | null => null),
    reservation.phoneE164 ? loadVisitHistory(supabase, id, reservation.phoneE164, since).catch(() => null) : Promise.resolve([]),
    loadDuplicatePartners(supabase, id, reservation).catch(() => null),
  ]);

  const shift = schedule.shifts.find((s) => s.id === reservation.shiftId) ?? null;
  const stats = visits === null ? null : visitStats(visits, reservation.id, new Date());
  const canChange = canReservations(nav.actor, "cancel_reservation", { serviceStatus: nav.serviceStatus });
  const canEdit = canReservations(nav.actor, "edit_reservation_notes", { serviceStatus: nav.serviceStatus }) && reservation.status !== "cancelled";
  const status = reservation.status;

  const statusChip =
    status === "pending" ? (
      <StatusChip kind="pending" />
    ) : status === "no_show" ? (
      <StatusChip kind="noShow" />
    ) : status === "cancelled" ? (
      <span className="inline-flex h-7 items-center rounded-full bg-soft-surface px-3 text-[13px] font-semibold text-status-muted">{t.ficha.statuses.cancelled}</span>
    ) : (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-agent-on-bg px-3 text-[13px] font-semibold text-agent-on-text">
        <Icon name="check" className="h-4 w-4" />
        {t.ficha.statuses.confirmed}
      </span>
    );

  const customerLine = t.cancel.summary(reservation.customerName, formatShortDate(reservation.date), reservation.time, reservation.partySize);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <RealtimeRefresh establishmentId={id} channel={realtimeChannelFor(id)} viewingDate={reservation.date} />
      {reservation.isNew ? <OpenMarker establishmentId={id} reservationId={reservation.id} date={reservation.date} /> : null}

      <div className="flex items-center gap-3">
        <Link
          href={todayHref(id, reservation.date)}
          aria-label={t.common.back}
          className="flex h-11 w-11 items-center justify-center rounded-field border border-border bg-surface hover:bg-soft-surface"
        >
          <Icon name="arrowLeft" className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-[22px] font-bold tracking-tight text-primary-dark sm:text-[28px]">{t.ficha.title}</h1>
        {canEdit ? (
          <ButtonLink href={editReservationHref(id, reservation.id)} variant="outline" icon="pencil" className="min-h-[44px]">
            {t.ficha.edit}
          </ButtonLink>
        ) : null}
      </div>

      <section className="rounded-card border border-border bg-surface p-5">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className={`text-[44px] font-bold leading-none tabular-nums ${status === "cancelled" ? "text-status-muted line-through" : ""}`}>
            {reservation.time}
          </span>
          <span className="text-sm text-text-secondary">
            {t.ficha.at(formatShortDate(reservation.date), shift?.name ?? t.ficha.outOfShift)}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold [overflow-wrap:anywhere]">{reservation.customerName}</h2>
          <span className="flex items-center gap-1.5 text-[15px] font-semibold">
            <Icon name="person" className="h-4 w-4" />
            {es.agents.components.people(reservation.partySize)}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {statusChip}
          <OriginChip origin={reservation.source} platformName={reservation.platformName} size="md" />
        </div>
      </section>

      {reservation.notes ? (
        <section className="flex items-start gap-3 rounded-card border border-border bg-surface p-4">
          <Icon name="document" className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" />
          <div>
            <h2 className="text-sm font-semibold text-text-secondary">{t.ficha.note}</h2>
            <p className="[overflow-wrap:anywhere]">{reservation.notes}</p>
          </div>
        </section>
      ) : null}

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold text-text-secondary">{t.ficha.client}</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold tabular-nums">{reservation.phoneE164 ? formatPhoneDisplay(reservation.phoneE164) : t.ficha.noPhone}</p>
            <p className="text-sm text-text-secondary">
              {reservation.phoneE164
                ? stats === null
                  ? t.ficha.visitsUnknown
                  : stats.came === 0 && stats.failed === 0
                    ? t.ficha.visitsFirst
                    : t.ficha.visits(stats.came, stats.failed)
                : null}
            </p>
          </div>
          {reservation.phoneE164 ? (
            <a
              href={`tel:${reservation.phoneE164}`}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-field bg-primary px-5 text-sm font-semibold text-surface hover:bg-primary-dark"
            >
              <Icon name="phone" className="h-4 w-4" />
              {t.ficha.call}
            </a>
          ) : null}
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-secondary">{t.ficha.emailLabel}</dt>
            <dd className="[overflow-wrap:anywhere]">{reservation.email ?? t.ficha.noEmail}</dd>
          </div>
          <div>
            <dt className="text-text-secondary">{t.ficha.languageLabel}</dt>
            <dd>{t.ficha.languages[reservation.language]}</dd>
          </div>
        </dl>
      </section>

      {nav.serviceStatus === "paused" ? (
        <p role="status" className="rounded-xl border border-pending-border bg-pending-row px-4 py-3 text-sm">
          {t.ficha.pausedHint}
        </p>
      ) : null}

      <FichaActions
        establishmentId={id}
        reservationId={reservation.id}
        date={reservation.date}
        time={reservation.time}
        status={reservation.status}
        startsAtMs={reservation.startsAt.getTime()}
        customerLine={customerLine}
        platformName={reservation.source === "platform" ? (reservation.platformName ?? es.agents.components.origins.platform) : null}
        pendingPlatformCancel={reservation.pendingPlatformCancel}
        partners={(partners ?? []).map((p) => ({ id: p.id, time: p.time, name: p.customerName, href: `/agents/${id}/reservas/${p.id}` }))}
        openCancel={sp.cancelar === "1"}
        openReject={sp.rechazar === "1"}
        canChange={canChange}
      />

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">{t.ficha.history}</h2>
        {history === null ? (
          <p className="text-sm text-danger">{t.ficha.historyFailed}</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-text-secondary">{t.ficha.historyEmpty}</p>
        ) : (
          <ol className="space-y-2">
            {history.map((event) => {
              const line = describeEvent(event, reservation.platformName, tz);
              return (
                <li key={event.id} className="flex gap-3 text-sm">
                  <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-border" />
                  <span>
                    <span className="font-semibold tabular-nums">{line.when}</span> · {line.text}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
