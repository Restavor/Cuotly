import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { ButtonLink, EmptyState, ErrorState, NoPermissionState } from "@/components/ui";
import { agentsPageHref, calendarHref, todayHref } from "@/core/reservations/agents-routes";
import { addMonths, buildCalendarMonth, isValidMonth, originBar } from "@/core/reservations/calendar";
import { localDateOf } from "@/core/reservations/dates";
import { formatMonth, formatShortDate, weekdayName } from "@/core/reservations/format";
import { canOffer } from "@/core/reservations/permissions";
import { RESERVATION_ORIGINS } from "@/core/reservations/types";
import { es } from "@/i18n/es";
import { agentsDb } from "@/app/agents/db";
import { loadCalendarRows, loadSchedule } from "@/services/reservations-gateway";
import { realtimeChannelFor } from "@/services/reservations-realtime";

import { requireAgentsPage } from "../../../agents-context";
import { RealtimeRefresh } from "../_components/RealtimeRefresh";

export const dynamic = "force-dynamic";

const ORIGIN_BAR: Record<(typeof RESERVATION_ORIGINS)[number], string> = {
  agent: "bg-origin-agent",
  platform: "bg-origin-platform",
  web: "bg-origin-web",
  manual: "bg-origin-manual",
};

/**
 * Reservas · Calendario (RES-10; PRD de agents §11.1, `Calendario`): reservas y personas por
 * día, una barra por origen, los días cerrados rayados, un punto amarillo si hay pendientes
 * y el total del mes. Tocar un día abre Hoy en ese día. Los números los agrega la base de
 * datos (`reservations_calendar`): no se cuentan en el navegador.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { id } = await params;
  const { mes } = await searchParams;
  const access = await requireAgentsPage(id, "calendar");
  const t = es.agents.agenda;
  if (access.kind === "denied") return <NoPermissionState />;
  const { nav } = access;

  const supabase = await agentsDb(id);
  let schedule;
  try {
    schedule = await loadSchedule(supabase, id);
  } catch {
    schedule = null;
  }
  if (schedule === null) return <ErrorState title={t.calendar.failedTitle} description={t.calendar.failedReason} />;

  const today = localDateOf(new Date(), schedule.timeZone);
  const month = mes !== undefined && isValidMonth(mes) ? mes : today.slice(0, 7);

  let rows;
  try {
    rows = await loadCalendarRows(supabase, id, month);
  } catch {
    return <ErrorState title={t.calendar.failedTitle} description={t.calendar.failedReason} />;
  }

  const hasShifts = schedule.shifts.some((s) => s.active);
  const calendar = buildCalendarMonth(month, rows, schedule.shifts, schedule.closedDates.map((c) => c.date));
  const canCreate = canOffer(nav.actor, "create_reservation", { serviceStatus: nav.serviceStatus });

  return (
    <div className="space-y-5">
      <RealtimeRefresh establishmentId={id} channel={realtimeChannelFor(id)} viewingDate={null} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <div className="flex items-center gap-2">
          <Link
            href={calendarHref(id, addMonths(month, -1))}
            aria-label={t.calendar.previousMonth}
            className="flex h-11 w-11 items-center justify-center rounded-field border border-border bg-surface hover:bg-soft-surface"
          >
            <Icon name="arrowLeft" className="h-5 w-5" />
          </Link>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-primary-dark sm:text-[28px]">{formatMonth(month)}</h1>
          <Link
            href={calendarHref(id, addMonths(month, 1))}
            aria-label={t.calendar.nextMonth}
            className="flex h-11 w-11 items-center justify-center rounded-field border border-border bg-surface hover:bg-soft-surface"
          >
            <Icon name="arrowRight" className="h-5 w-5" />
          </Link>
          {month !== today.slice(0, 7) ? (
            <Link href={agentsPageHref(id, "calendar")} className="inline-flex min-h-[44px] items-center rounded-field border border-border bg-surface px-3 text-sm font-semibold hover:bg-soft-surface">
              {t.calendar.todayButton}
            </Link>
          ) : null}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ButtonLink href={agentsPageHref(id, "search")} variant="secondary" icon="search" className="min-h-[44px]">
            {t.calendar.search}
          </ButtonLink>
          {canCreate ? (
            <ButtonLink href={agentsPageHref(id, "newReservation")} icon="plus" className="min-h-[44px]">
              {t.calendar.newReservation}
            </ButtonLink>
          ) : null}
        </div>
      </div>

      {!hasShifts ? <EmptyState title={t.calendar.noShiftsTitle} description={t.calendar.noShiftsReason} /> : null}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {RESERVATION_ORIGINS.map((origin) => (
          <span key={origin} className="inline-flex items-center gap-2">
            <span aria-hidden="true" className={`h-3 w-3 rounded-sm ${ORIGIN_BAR[origin]}`} />
            {t.calendar.legend[origin]}
          </span>
        ))}
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-3 rounded-full bg-meter-warn" />
          {t.calendar.legend.pending}
        </span>
        <span className="ml-auto text-text-secondary">
          <strong className="text-text">{t.calendar.monthTotal(formatMonth(month), calendar.totalReservations, calendar.totalPeople)}</strong>
        </span>
      </div>

      <div className="overflow-x-auto">
        <div aria-hidden="true" className="grid min-w-[640px] grid-cols-7 gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <span key={d} className="px-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {weekdayName(d, "short")}
            </span>
          ))}
        </div>
        <div className="mt-1.5 grid min-w-[640px] grid-cols-7 gap-1.5" aria-label={formatMonth(month)}>
          {calendar.weeks.flat().map((day) => {
            const number = Number(day.date.slice(8));
            if (!day.inMonth) {
              return (
                <div key={day.date} aria-hidden="true" className="min-h-[92px] rounded-xl bg-background p-2 text-xs text-status-muted/60">
                  {number}
                </div>
              );
            }
            const isToday = day.date === today;
            if (day.closed) {
              return (
                <Link
                  key={day.date}
                  href={todayHref(id, day.date)}
                  aria-label={t.calendar.closedDayAria(formatShortDate(day.date))}
                  className="min-h-[92px] rounded-xl border border-border p-2 text-xs text-status-muted [background:repeating-linear-gradient(135deg,var(--color-soft-surface)_0_6px,var(--color-surface)_6px_12px)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cuotly-green"
                >
                  <span className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{number}</span>
                    {isToday ? <span className="rounded-full bg-primary px-2 text-[11px] font-semibold text-surface">{t.calendar.todayTag}</span> : null}
                  </span>
                  <span className="mt-2 block font-semibold">{day.reservations > 0 ? t.calendar.dayReservations(day.reservations) : t.calendar.closed}</span>
                </Link>
              );
            }
            return (
              <Link
                key={day.date}
                href={todayHref(id, day.date)}
                aria-label={t.calendar.openDay(formatShortDate(day.date), day.reservations, day.people)}
                className={`flex min-h-[92px] flex-col rounded-xl border bg-surface p-2 hover:bg-soft-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-cuotly-green ${
                  isToday ? "border-primary" : "border-border"
                }`}
              >
                <span className="flex items-center justify-between">
                  <span className="text-sm font-bold">{number}</span>
                  <span className="flex items-center gap-1">
                    {isToday ? <span className="rounded-full bg-primary px-2 text-[11px] font-semibold text-surface">{t.calendar.todayTag}</span> : null}
                    {day.hasPending ? <span role="img" aria-label={t.calendar.pendingAria} className="h-3 w-3 rounded-full bg-meter-warn" /> : null}
                  </span>
                </span>
                {day.reservations > 0 ? (
                  <>
                    <span className="mt-1 text-sm font-semibold">{t.calendar.dayReservations(day.reservations)}</span>
                    <span className="text-xs text-text-secondary">{t.calendar.dayPeople(day.people)}</span>
                    <span aria-hidden="true" className="mt-auto flex h-1.5 w-full overflow-hidden rounded-full bg-soft-surface">
                      {originBar(day).map((part) => (
                        <span key={part.origin} className={ORIGIN_BAR[part.origin]} style={{ width: `${part.percent}%` }} />
                      ))}
                    </span>
                  </>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
