import Link from "next/link";
import { redirect } from "next/navigation";

import { AgentStatusPill } from "@/components/agents";
import { Icon } from "@/components/ui/Icon";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { ButtonLink, EmptyState, ErrorState, NoPermissionState } from "@/components/ui";
import { addDays, isValidLocalDate, localDateOf, localDateTimeOf } from "@/core/reservations/dates";
import { agentsPageHref, needsOnboarding, todayHref } from "@/core/reservations/agents-routes";
import { formatLongDate } from "@/core/reservations/format";
import { canOffer } from "@/core/reservations/permissions";
import { es } from "@/i18n/es";
import { agentsDb } from "@/app/agents/db";
import {
  loadAgentIndicator,
  loadDayReservations,
  loadPendingGroups,
  loadSchedule,
} from "@/services/reservations-gateway";
import { realtimeChannelFor } from "@/services/reservations-realtime";

import { requireAgentsPage } from "../../agents-context";
import { DayBoard } from "./_components/DayBoard";
import { RealtimeRefresh } from "./_components/RealtimeRefresh";
import { buildDayView } from "./day-view";

export const dynamic = "force-dynamic";

/**
 * Reservas · Hoy (RES-01; PRD de agents §6, `AgentsHoy` y `AgentsHoyMovil`): la fecha con
 * sus flechas y «Hoy», Buscar, Nueva reserva, el indicador del agente, las barras de aviso,
 * los filtros por origen con contadores y un bloque por turno con su aforo y sus filas.
 *
 * Todo sale del servidor y de lo que la base de datos deja leer a esta persona: si una
 * lectura falla se dice, no se pinta un día vacío (CLAUDE.md, nada de datos de relleno).
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { id } = await params;
  const { fecha } = await searchParams;
  const access = await requireAgentsPage(id, "today");
  const t = es.agents.agenda;
  if (access.kind === "denied") return <NoPermissionState />;

  const { nav } = access;
  const supabase = await agentsDb(id);

  let schedule;
  try {
    schedule = await loadSchedule(supabase, id);
  } catch {
    return <ErrorState title={t.common.failedLoad} description={t.common.failedLoadReason} />;
  }
  if (schedule === null) return <ErrorState title={t.common.failedLoad} description={t.common.failedLoadReason} />;

  // Primer uso (PRD §5.1): un restaurante que ya puede usar Reservas y no ha terminado de configurarlo.
  if (needsOnboarding(nav.actor, nav.serviceStatus, schedule.onboardingCompletedAt)) {
    redirect(agentsPageHref(id, "onboarding"));
  }

  const now = new Date();
  const today = localDateOf(now, schedule.timeZone);
  const date = fecha !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && isValidLocalDate(fecha) ? fecha : today;

  let view;
  let pending;
  let agent;
  try {
    const [records, pendingGroups, indicator] = await Promise.all([
      loadDayReservations(supabase, id, date),
      loadPendingGroups(supabase, id, today),
      loadAgentIndicator(supabase, id),
    ]);
    pending = pendingGroups;
    agent = indicator;
    view = buildDayView({
      establishmentId: id,
      records,
      shifts: schedule.shifts,
      closedDates: schedule.closedDates.map((c) => c.date),
      date,
      timeZone: schedule.timeZone,
      largeGroupThreshold: schedule.largeGroupThreshold,
    });
  } catch {
    return <ErrorState title={t.today.noDataTitle} description={t.today.noDataReason} />;
  }

  const canCreate = canOffer(nav.actor, "create_reservation", { serviceStatus: nav.serviceStatus });
  const canDecide = canOffer(nav.actor, "decide_group", { serviceStatus: nav.serviceStatus });
  const closedReason = schedule.closedDates.find((c) => c.date === date)?.reason || null;
  const hasShifts = schedule.shifts.some((s) => s.active);
  const isEmpty = view.blocks.every((b) => b.rows.length === 0);
  const newHref = `${agentsPageHref(id, "newReservation")}?fecha=${date}`;

  const agentPill =
    agent.state === "on" ? (
      <AgentStatusPill state="on">{t.today.agentOn}</AgentStatusPill>
    ) : agent.state === "off" ? (
      <AgentStatusPill state="off">
        {agent.until ? t.today.agentOffUntil(localDateTimeOf(agent.until, schedule.timeZone).time) : t.today.agentOff}
      </AgentStatusPill>
    ) : (
      <AgentStatusPill state="off">{t.today.agentNone}</AgentStatusPill>
    );

  return (
    <div className="space-y-5">
      <RealtimeRefresh establishmentId={id} channel={realtimeChannelFor(id)} viewingDate={date} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <div className="flex items-center gap-2">
          <Link
            href={todayHref(id, addDays(date, -1))}
            aria-label={t.today.previousDay}
            className="flex h-11 w-11 items-center justify-center rounded-field border border-border bg-surface hover:bg-soft-surface"
          >
            <Icon name="arrowLeft" className="h-5 w-5" />
          </Link>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-primary-dark sm:text-[28px]">
            {formatLongDate(date)}
          </h1>
          <Link
            href={todayHref(id, addDays(date, 1))}
            aria-label={t.today.nextDay}
            className="flex h-11 w-11 items-center justify-center rounded-field border border-border bg-surface hover:bg-soft-surface"
          >
            <Icon name="arrowRight" className="h-5 w-5" />
          </Link>
          {date !== today ? (
            <Link
              href={agentsPageHref(id, "today")}
              className="inline-flex min-h-[44px] items-center rounded-field border border-border bg-surface px-3 text-sm font-semibold hover:bg-soft-surface"
            >
              {t.today.todayButton}
            </Link>
          ) : null}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link href={agentsPageHref(id, "calls")} aria-label={t.today.agentLink}>
            {agentPill}
          </Link>
          <ButtonLink href={agentsPageHref(id, "search")} variant="secondary" icon="search" className="min-h-[44px]">
            {t.today.search}
          </ButtonLink>
          {canCreate ? (
            <ButtonLink href={newHref} icon="plus" className="min-h-[44px]">
              {t.today.newReservation}
            </ButtonLink>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex min-h-[44px] cursor-not-allowed items-center gap-2 rounded-field bg-primary px-4 py-2.5 text-sm font-semibold text-surface opacity-60"
            >
              <Icon name="plus" className="h-4 w-4" />
              {t.today.newReservation}
            </span>
          )}
        </div>
      </div>

      {nav.serviceStatus === "paused" ? (
        <div role="status" className="rounded-xl border border-pending-border bg-pending-row px-4 py-3 text-sm">
          <p className="font-semibold text-pending-text">{t.today.pausedBar}</p>
          <p className="text-text-secondary">{t.today.pausedBarReason}</p>
        </div>
      ) : null}
      {nav.serviceStatus === "ending" ? (
        <div role="status" className="rounded-xl border border-border bg-soft-surface px-4 py-3 text-sm">
          <p className="font-semibold">{t.today.endingBar}</p>
          <p className="text-text-secondary">{t.today.endingBarReason}</p>
        </div>
      ) : null}
      {canDecide && pending.count > 0 && pending.first ? (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-pending-border bg-pending-row px-4 py-3 text-sm">
          <Icon name="warning" className="h-5 w-5 shrink-0 text-pending-text" />
          <span className="flex-1 font-semibold text-pending-text">{t.today.pendingBar(pending.count)}</span>
          <Link
            href={`${todayHref(id, pending.first.date)}#reserva-${pending.first.id}`}
            className="inline-flex min-h-[44px] items-center rounded-field px-3 font-semibold text-pending-text underline"
          >
            {t.today.review}
          </Link>
        </div>
      ) : null}

      {!hasShifts ? (
        <EmptyState
          title={t.today.noShiftsTitle}
          description={t.today.noShiftsReason}
          action={<ButtonLink href={agentsPageHref(id, "settings")} className="min-h-[44px]">{t.today.noShiftsAction}</ButtonLink>}
        />
      ) : (
        <>
          <p className="text-sm text-text-secondary">
            <strong className="text-base text-text">
              {t.today.summary(view.summary.reservations, view.summary.people, view.summary.pending)}
            </strong>
          </p>

          {isEmpty ? (
            <div className="rounded-card border border-border bg-surface p-6 text-center">
              {view.closed ? (
                <EmptyReason reason="no_data_yet" title={t.today.closedDay} />
              ) : (
                <EmptyReason reason="no_data_yet" title={t.today.emptyDay} />
              )}
              {view.closed ? <p className="mt-2 text-sm text-text-secondary">{t.today.closedDayReason(closedReason)}</p> : null}
              {canCreate && !view.closed ? (
                <p className="mt-3">
                  <ButtonLink href={newHref} variant="outline" className="min-h-[44px]">
                    {t.today.emptyDayAction}
                  </ButtonLink>
                </p>
              ) : null}
            </div>
          ) : (
            <DayBoard establishmentId={id} date={date} counters={view.counters} blocks={view.blocks} />
          )}
        </>
      )}
    </div>
  );
}
