import { NoPermissionState, EmptyState, ErrorState, ButtonLink, PageHeader } from "@/components/ui";
import { agentsPageHref } from "@/core/reservations/agents-routes";
import { isValidLocalDate, localDateOf } from "@/core/reservations/dates";
import { canOffer } from "@/core/reservations/permissions";
import { es } from "@/i18n/es";
import { agentsDb } from "@/app/agents/db";
import { myDisplayName } from "@/services/agents/my-name";
import { loadSchedule } from "@/services/reservations-gateway";

import { requireAgentsPage } from "../../../agents-context";
import { ReservationForm } from "../_components/ReservationForm";

export const dynamic = "force-dynamic";

/**
 * Reservas · Nueva reserva (RES-02; PRD de agents §11.1, `NuevaReserva`). Una reserva a
 * mano: la crea el restaurante y no tiene límite de antelación, pero no se crea en el pasado
 * ni en un día cerrado. Qué cabe y qué no lo decide `book_reservation` al guardar.
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
  const access = await requireAgentsPage(id, "newReservation");
  const t = es.agents.agenda;
  if (access.kind === "denied") {
    return (
      <div className="space-y-6">
        <PageHeader title={es.agents.menu.newReservationTitle} />
        <NoPermissionState />
      </div>
    );
  }

  const supabase = await agentsDb(id);
  let schedule;
  try {
    schedule = await loadSchedule(supabase, id);
  } catch {
    schedule = null;
  }
  if (schedule === null) return <ErrorState title={t.common.failedLoad} description={t.common.failedLoadReason} />;

  const { nav } = access;
  const today = localDateOf(new Date(), schedule.timeZone);
  const startDate = fecha !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && isValidLocalDate(fecha) && fecha >= today ? fecha : today;

  // La tablet no es nadie en concreto: quien la crea es quien ponga su PIN al guardar (`PinTablet`).
  const creatorName = access.mode === "device" ? t.newReservation.creatorByPin : await myDisplayName();

  const canCreate = canOffer(nav.actor, "create_reservation", { serviceStatus: nav.serviceStatus });
  const creationBlockedReason = canCreate ? null : t.newReservation.pausedReason;

  return (
    <div className="space-y-6">
      <PageHeader title={es.agents.menu.newReservationTitle} subtitle={nav.name} />
      {!schedule.shifts.some((s) => s.active) ? (
        <EmptyState
          title={t.newReservation.noShiftsTitle}
          description={t.newReservation.noShiftsReason}
          action={<ButtonLink href={agentsPageHref(id, "settings")} className="min-h-[44px]">{t.today.noShiftsAction}</ButtonLink>}
        />
      ) : (
        <ReservationForm
          establishmentId={id}
          initial={null}
          shifts={schedule.shifts}
          closedDates={schedule.closedDates.map((c) => c.date)}
          slotInterval={schedule.slotInterval}
          today={today}
          startDate={startDate}
          creatorName={creatorName}
          schedulingLockedReason={null}
          origin={null}
          creationBlockedReason={creationBlockedReason}
        />
      )}
    </div>
  );
}
