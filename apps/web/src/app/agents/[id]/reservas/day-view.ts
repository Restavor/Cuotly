import { daySummary, groupByShift, originCounters, type AgendaReservation } from "@/core/reservations/agenda";
import { localDateTimeOf, isoWeekday } from "@/core/reservations/dates";
import type { LocalDate } from "@/core/reservations/dates";
import { reservationHref } from "@/core/reservations/agents-routes";
import { shiftsOnWeekday, type Shift } from "@/core/reservations/shifts";
import { countsTowardCapacity } from "@/core/reservations/types";
import { es } from "@/i18n/es";
import type { ReservationRecord } from "@/services/reservations-gateway";

import type { DayBlockData, DayCounters, DayRowData } from "./_components/day-types";

/** «Cancelada por X · 11:20»: quién y a qué hora, sin nombres de personas (P7), en la zona del restaurante. */
export function cancelledNote(record: ReservationRecord, timeZone: string): string | null {
  if (record.status !== "cancelled") return null;
  const t = es.agents.agenda.today;
  const hora = record.cancelledAt ? localDateTimeOf(record.cancelledAt, timeZone).time : "";
  switch (record.cancelReason) {
    case "customer":
      return t.cancelledByCustomer(hora);
    case "error":
      return t.cancelledByError(hora);
    case "other":
      return t.cancelledByRestaurant(hora);
    case "rejected":
      return t.cancelledRejected(hora);
    case "platform":
      return t.cancelledByPlatform(record.platformName ?? es.agents.components.origins.platform, hora);
    case "agent":
      return t.cancelledByAgent(hora);
    case "customer_link":
      return t.cancelledByLink(hora);
    default:
      return t.cancelledOther(hora);
  }
}

function toAgenda(r: ReservationRecord): AgendaReservation {
  return { id: r.id, shiftId: r.shiftId, date: r.date, time: r.time, partySize: r.partySize, status: r.status, source: r.source, customerName: r.customerName };
}

/**
 * Lo que enseña Hoy un día: un bloque por turno que abre ese día (con la ocupación del DÍA
 * ENTERO), el bloque «Fuera de turno» si lo hay, los contadores de los filtros y el
 * resumen (RES-01, RN-RES-02). Un día cerrado no tiene turnos: solo salen sus reservas
 * fuera de turno, si las hay.
 */
export function buildDayView(input: {
  establishmentId: string;
  records: readonly ReservationRecord[];
  shifts: readonly Shift[];
  closedDates: readonly LocalDate[];
  date: LocalDate;
  timeZone: string;
  largeGroupThreshold: number;
}): { blocks: readonly DayBlockData[]; counters: DayCounters; summary: ReturnType<typeof daySummary>; closed: boolean } {
  const { records, date } = input;
  const closed = input.closedDates.includes(date) || shiftsOnWeekday(isoWeekday(date), input.shifts).length === 0;
  const shiftsOfDay = input.closedDates.includes(date) ? [] : shiftsOnWeekday(isoWeekday(date), input.shifts);

  const agenda = records.map(toAgenda);
  const byId = new Map(records.map((r) => [r.id, r]));

  const partnerOf = (r: ReservationRecord): string | null => {
    if (!r.duplicate || r.phoneE164 === null) return null;
    const other = records.find((o) => o.id !== r.id && o.phoneE164 === r.phoneE164 && countsTowardCapacity(o.status) && o.duplicate);
    return other?.id ?? null;
  };

  const rowOf = (a: AgendaReservation): DayRowData => {
    const r = byId.get(a.id) as ReservationRecord;
    return {
      id: r.id,
      time: r.time,
      name: r.customerName,
      note: r.notes,
      partySize: r.partySize,
      origin: r.source,
      platformName: r.platformName,
      status: r.status,
      isNew: r.isNew,
      duplicate: r.duplicate,
      largeGroup: r.status === "pending" && r.partySize >= input.largeGroupThreshold,
      cancelledNote: cancelledNote(r, input.timeZone),
      duplicatePartnerId: r.status === "cancelled" ? null : partnerOf(r),
      href: reservationHref(input.establishmentId, r.id),
    };
  };

  const blocks: DayBlockData[] = groupByShift(agenda, agenda, shiftsOfDay)
    .filter((b) => b.shift !== null || b.rows.length > 0)
    .map((b) => ({
      key: b.shift?.id ?? "fuera-de-turno",
      shift: b.shift
        ? { name: b.shift.name, range: es.agents.agenda.today.shiftRange(b.shift.startTime, b.shift.endTime), capacity: b.shift.capacity }
        : null,
      occupied: b.occupied,
      state: b.state,
      rows: b.rows.map(rowOf),
    }));

  return { blocks, counters: originCounters(agenda), summary: daySummary(agenda), closed };
}
