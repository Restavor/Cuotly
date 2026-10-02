/**
 * `src/core/reservations/shifts.ts` · turnos y huecos (RN-RES-01; PRD de agents §6.2).
 *
 * Un turno tiene un nombre, unos días de la semana (1 = lunes … 7 = domingo), una hora
 * de apertura, una última hora de reserva, una hora de cierre y un aforo. Los huecos
 * son las horas a las que se puede reservar: de la apertura a la última hora de
 * reserva, ambas incluidas, cada 15 o 30 minutos. Un día sin turno activo, o que el
 * restaurante ha cerrado a propósito, no tiene huecos. Las tandas son turnos distintos.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React. Lo que decide si una
 * hora tiene sitio (aforo, antelación, alternativas) es de la agenda (Fase C): aquí solo
 * está lo que dice cuándo se puede reservar.
 */
import { isoWeekday, isValidLocalDate, isValidLocalTime, minutesOfDay, timeFromMinutes } from "./dates";
import type { LocalDate, LocalTime } from "./dates";

export const SLOT_INTERVALS = [15, 30] as const;
export type SlotInterval = (typeof SLOT_INTERVALS)[number];

export interface Shift {
  readonly id: string;
  readonly name: string;
  /** 1 = lunes … 7 = domingo. */
  readonly weekdays: readonly number[];
  readonly startTime: LocalTime;
  readonly endTime: LocalTime;
  readonly lastBookingTime: LocalTime;
  readonly capacity: number;
  readonly active: boolean;
}

export type ShiftIssue =
  | "name_empty"
  | "weekdays_empty"
  | "weekday_out_of_range"
  | "time_invalid"
  | "start_not_before_last_booking"
  | "last_booking_after_end"
  | "capacity_not_positive";

/** Validaciones de un turno suelto. Vacío = válido. La apertura, la última hora y el cierre no cruzan la medianoche. */
export function validateShift(shift: Omit<Shift, "id" | "active"> & Partial<Pick<Shift, "id" | "active">>): readonly ShiftIssue[] {
  const issues: ShiftIssue[] = [];
  if (shift.name.trim() === "") issues.push("name_empty");
  if (shift.weekdays.length === 0) issues.push("weekdays_empty");
  if (shift.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) issues.push("weekday_out_of_range");
  if (!Number.isInteger(shift.capacity) || shift.capacity <= 0) issues.push("capacity_not_positive");

  const times = [shift.startTime, shift.lastBookingTime, shift.endTime];
  if (!times.every(isValidLocalTime)) {
    issues.push("time_invalid");
    return issues;
  }
  const [start, last, end] = times.map(minutesOfDay);
  if (!(start < last)) issues.push("start_not_before_last_booking");
  if (!(last <= end)) issues.push("last_booking_after_end");
  return issues;
}

/**
 * ¿Se solapan dos turnos en horas de reserva? Comparten algún día de la semana y sus
 * horas de reserva (de la apertura a la última hora, ambas incluidas) se tocan: el
 * mismo hueco no puede pertenecer a dos turnos.
 */
export function shiftsOverlap(a: Shift, b: Shift): boolean {
  if (!a.weekdays.some((d) => b.weekdays.includes(d))) return false;
  const [aStart, aLast] = [minutesOfDay(a.startTime), minutesOfDay(a.lastBookingTime)];
  const [bStart, bLast] = [minutesOfDay(b.startTime), minutesOfDay(b.lastBookingTime)];
  return aStart <= bLast && bStart <= aLast;
}

/** Los pares de turnos activos que se solapan (RN-RES-01). Vacío = el conjunto es válido. */
export function overlappingShifts(shifts: readonly Shift[]): readonly (readonly [Shift, Shift])[] {
  const active = shifts.filter((s) => s.active);
  const pairs: (readonly [Shift, Shift])[] = [];
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      if (shiftsOverlap(active[i], active[j])) pairs.push([active[i], active[j]]);
    }
  }
  return pairs;
}

/** Las horas de reserva de un turno: de la apertura a la última hora, ambas incluidas, cada `interval` minutos. */
export function slotsOfShift(shift: Shift, interval: SlotInterval): readonly LocalTime[] {
  const out: LocalTime[] = [];
  const last = minutesOfDay(shift.lastBookingTime);
  for (let m = minutesOfDay(shift.startTime); m <= last; m += interval) out.push(timeFromMinutes(m));
  return out;
}

/** Turnos activos que abren un día concreto (sin mirar los días cerrados). */
export function shiftsOnWeekday(weekday: number, shifts: readonly Shift[]): readonly Shift[] {
  return shifts.filter((s) => s.active && s.weekdays.includes(weekday));
}

/** ¿Está abierto ese día? Al menos un turno activo ese día de la semana y el día no cerrado a propósito. */
export function isOpenDay(date: LocalDate, shifts: readonly Shift[], closedDates: readonly LocalDate[]): boolean {
  if (!isValidLocalDate(date) || closedDates.includes(date)) return false;
  return shiftsOnWeekday(isoWeekday(date), shifts).length > 0;
}

export interface Slot {
  readonly time: LocalTime;
  readonly shiftId: string;
}

/** Todos los huecos de un día, por orden de hora. Un día cerrado no tiene ninguno. */
export function slotsOfDay(
  date: LocalDate,
  shifts: readonly Shift[],
  closedDates: readonly LocalDate[],
  interval: SlotInterval,
): readonly Slot[] {
  if (!isOpenDay(date, shifts, closedDates)) return [];
  return shiftsOnWeekday(isoWeekday(date), shifts)
    .flatMap((shift) => slotsOfShift(shift, interval).map((time) => ({ time, shiftId: shift.id })))
    .sort((a, b) => minutesOfDay(a.time) - minutesOfDay(b.time));
}

export type RequestedTimeStatus = "slot" | "closed_day" | "not_a_slot";

/**
 * ¿Qué es la hora pedida? Un hueco, un día cerrado o una hora que no es hueco
 * (`not_a_slot`: "21:15" con huecos cada 30). Si es un hueco, de qué turno es.
 */
export function classifyRequestedTime(
  date: LocalDate,
  time: LocalTime,
  shifts: readonly Shift[],
  closedDates: readonly LocalDate[],
  interval: SlotInterval,
): { readonly status: RequestedTimeStatus; readonly shiftId?: string } {
  const slots = slotsOfDay(date, shifts, closedDates, interval);
  if (slots.length === 0) return { status: "closed_day" };
  const hit = slots.find((s) => s.time === time);
  return hit ? { status: "slot", shiftId: hit.shiftId } : { status: "not_a_slot" };
}
