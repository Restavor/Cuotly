import { notFound } from "next/navigation";

import { EmptyState, ErrorState, ButtonLink, NoPermissionState, PageHeader } from "@/components/ui";
import { agentsPageHref, reservationHref } from "@/core/reservations/agents-routes";
import { isValidLocalDate, localDateOf } from "@/core/reservations/dates";
import { formatPhoneDisplay } from "@/core/reservations/phone";
import { canReservations } from "@/core/reservations/permissions";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadReservation, loadSchedule } from "@/services/reservations-gateway";

import { requireAgentsPage } from "../../../../agents-context";
import { ReservationForm } from "../../_components/ReservationForm";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reservas · Editar (RES-04; PRD de agents §6.8, `EditarReserva`). Se puede cambiar fecha,
 * hora, personas, nombre, teléfono, idioma y nota. Cambiar fecha, hora o personas vuelve a
 * aplicar el aforo; en una reserva de plataforma esos tres campos se cambian en la
 * plataforma, y con Reservas en pausa tampoco se cambian. Lo decide `book_reservation`;
 * aquí solo se bloquea el campo para no prometer lo que el servidor va a rechazar.
 */
export default async function Page({ params }: { params: Promise<{ id: string; reservaId: string }> }) {
  const { id, reservaId } = await params;
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
        action={<ButtonLink href={agentsPageHref(id, "today")} className="min-h-[44px]">{t.common.backToToday}</ButtonLink>}
      />
    );
  }

  const canEdit = canReservations(nav.actor, "edit_reservation_notes", { serviceStatus: nav.serviceStatus });
  if (!canEdit) return <NoPermissionState />;
  if (reservation.status === "cancelled") {
    return (
      <div className="space-y-6">
        <PageHeader title={t.newReservation.editTitle} subtitle={nav.name} />
        <EmptyState
          title={t.rejected.not_editable}
          action={<ButtonLink href={reservationHref(id, reservation.id)} className="min-h-[44px]">{t.common.back}</ButtonLink>}
        />
      </div>
    );
  }

  const today = localDateOf(new Date(), schedule.timeZone);
  const platformName = reservation.platformName ?? es.agents.components.origins.platform;
  const canChangeScheduling = canReservations(nav.actor, "edit_reservation_slot", { serviceStatus: nav.serviceStatus });
  const lockedReason =
    reservation.source === "platform"
      ? t.rejected.platform_locked(platformName)
      : !canChangeScheduling
        ? t.ficha.pausedHint
        : null;

  return (
    <div className="space-y-6">
      <PageHeader title={t.newReservation.editTitle} subtitle={nav.name} />
      <ReservationForm
        establishmentId={id}
        initial={{
          reservationId: reservation.id,
          date: isValidLocalDate(reservation.date) ? reservation.date : today,
          time: reservation.time,
          partySize: reservation.partySize,
          name: reservation.customerName,
          phone: reservation.phoneE164 ? formatPhoneDisplay(reservation.phoneE164) : "",
          email: reservation.email ?? "",
          notes: reservation.notes ?? "",
          language: reservation.language,
        }}
        shifts={schedule.shifts}
        closedDates={schedule.closedDates.map((c) => c.date)}
        slotInterval={schedule.slotInterval}
        today={today}
        startDate={reservation.date}
        creatorName=""
        schedulingLockedReason={lockedReason}
        origin={{ origin: reservation.source, platformName: reservation.platformName }}
        creationBlockedReason={null}
      />
    </div>
  );
}
