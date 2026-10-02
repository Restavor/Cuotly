/**
 * `src/core/reservations/calendar.ts` · el calendario del mes (RES-10; PRD de agents §11.1).
 *
 * Por día: reservas y personas, barra por origen, día cerrado (rayado), punto amarillo
 * si hay pendientes y, para todo el mes, el total. Tocar un día abre Hoy en ese día.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */
import { addDays, isoWeekday } from "./dates";
import type { LocalDate } from "./dates";
import { isOpenDay } from "./shifts";
import type { Shift } from "./shifts";
import { RESERVATION_ORIGINS, countsTowardCapacity } from "./types";
import type { ReservationOrigin, ReservationStatus } from "./types";

/**
 * Una fila de `reservations_calendar()`: las reservas de un día, origen y estado, ya
 * agregadas por la base de datos (un `select` de PostgREST se cortaría en 1000 filas).
 */
export interface CalendarReservation {
  readonly date: LocalDate;
  readonly status: ReservationStatus;
  readonly source: ReservationOrigin;
  readonly reservations: number;
  readonly people: number;
}

export interface CalendarDay {
  readonly date: LocalDate;
  readonly inMonth: boolean;
  readonly closed: boolean;
  readonly reservations: number;
  readonly people: number;
  readonly bySource: Readonly<Record<ReservationOrigin, number>>;
  readonly hasPending: boolean;
}

export interface CalendarMonth {
  /** "YYYY-MM" */
  readonly month: string;
  /** Semanas de lunes a domingo; los días de fuera del mes salen con `inMonth: false`. */
  readonly weeks: readonly (readonly CalendarDay[])[];
  readonly totalReservations: number;
  readonly totalPeople: number;
}

export function isValidMonth(value: string): boolean {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  return m !== null && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Primer y último día del mes. */
export function monthBounds(month: string): { readonly first: LocalDate; readonly last: LocalDate } {
  const first = `${month}-01`;
  return { first, last: addDays(`${addMonths(month, 1)}-01`, -1) };
}

/** Agrega las reservas del mes. Solo las pendientes y confirmadas cuentan; las pendientes además ponen el punto. */
export function buildCalendarMonth(
  month: string,
  reservations: readonly CalendarReservation[],
  shifts: readonly Shift[],
  closedDates: readonly LocalDate[],
): CalendarMonth {
  if (!isValidMonth(month)) throw new RangeError(`Mes no válido: ${month}`);
  const { first, last } = monthBounds(month);
  const gridStart = addDays(first, -(isoWeekday(first) - 1));
  const gridEnd = addDays(last, 7 - isoWeekday(last));

  const empty = (): Record<ReservationOrigin, number> => ({ agent: 0, platform: 0, web: 0, manual: 0 });
  const byDate = new Map<LocalDate, { reservations: number; people: number; bySource: Record<ReservationOrigin, number>; hasPending: boolean }>();
  for (const r of reservations) {
    if (!countsTowardCapacity(r.status)) continue;
    const cell = byDate.get(r.date) ?? { reservations: 0, people: 0, bySource: empty(), hasPending: false };
    cell.reservations += r.reservations;
    cell.people += r.people;
    cell.bySource[r.source] += r.reservations;
    if (r.status === "pending") cell.hasPending = true;
    byDate.set(r.date, cell);
  }

  const weeks: CalendarDay[][] = [];
  let totalReservations = 0;
  let totalPeople = 0;
  for (let date = gridStart; date <= gridEnd; date = addDays(date, 1)) {
    const inMonth = date >= first && date <= last;
    const cell = byDate.get(date);
    if (inMonth && cell) {
      totalReservations += cell.reservations;
      totalPeople += cell.people;
    }
    const day: CalendarDay = {
      date,
      inMonth,
      closed: !isOpenDay(date, shifts, closedDates),
      reservations: inMonth ? (cell?.reservations ?? 0) : 0,
      people: inMonth ? (cell?.people ?? 0) : 0,
      bySource: inMonth && cell ? cell.bySource : empty(),
      hasPending: inMonth ? (cell?.hasPending ?? false) : false,
    };
    if (isoWeekday(date) === 1) weeks.push([]);
    weeks[weeks.length - 1].push(day);
  }
  return { month, weeks, totalReservations, totalPeople };
}

/** La barra por origen: porcentajes de reservas del día por origen, en el orden de `RESERVATION_ORIGINS`. */
export function originBar(day: CalendarDay): readonly { readonly origin: ReservationOrigin; readonly percent: number }[] {
  if (day.reservations === 0) return [];
  return RESERVATION_ORIGINS.filter((o) => day.bySource[o] > 0).map((origin) => ({ origin, percent: (day.bySource[origin] / day.reservations) * 100 }));
}
