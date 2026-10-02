/**
 * `src/core/reservations/schedule-validation.ts` · guardar los horarios (RES-12;
 * RN-RES-01, PRD de agents §6.2).
 *
 * Además de las validaciones de cada turno (`shifts.ts`): no se puede quitar un turno,
 * ni quitarle un día de la semana, ni marcar un día cerrado si hay reservas futuras
 * activas afectadas. La app dice cuántas son y pide moverlas o cancelarlas antes.
 * "Días que abrís" es un atajo que marca o desmarca un día en todos los turnos.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */
import { isoWeekday } from "./dates";
import type { LocalDate } from "./dates";
import { overlappingShifts, validateShift } from "./shifts";
import type { Shift, ShiftIssue } from "./shifts";
import { countsTowardCapacity } from "./types";
import type { ReservationStatus } from "./types";

export type ScheduleIssue =
  | { readonly kind: "shift"; readonly shiftId: string; readonly issue: ShiftIssue }
  | { readonly kind: "overlap"; readonly shiftIds: readonly [string, string] };

/** Todos los problemas del conjunto de turnos: los de cada turno y los solapes. Vacío = válido. */
export function validateSchedule(shifts: readonly Shift[]): readonly ScheduleIssue[] {
  const out: ScheduleIssue[] = [];
  for (const shift of shifts) {
    if (!shift.active) continue;
    for (const issue of validateShift(shift)) out.push({ kind: "shift", shiftId: shift.id, issue });
  }
  // Un turno mal formado no tiene horas fiables con las que comparar solapes.
  if (out.length === 0) {
    for (const [a, b] of overlappingShifts(shifts)) out.push({ kind: "overlap", shiftIds: [a.id, b.id] });
  }
  return out;
}

export interface FutureReservation {
  readonly id: string;
  readonly shiftId: string | null;
  readonly date: LocalDate;
  readonly status: ReservationStatus;
}

export interface ScheduleChange {
  readonly before: readonly Shift[];
  readonly after: readonly Shift[];
  readonly closedBefore: readonly LocalDate[];
  readonly closedAfter: readonly LocalDate[];
}

/**
 * Las reservas futuras activas que el cambio dejaría sin turno (RN-RES-01): las de un
 * turno que se quita o se desactiva, las de un día de la semana que el turno ya no abre
 * y las de un día que pasa a estar cerrado. Una reserva se cuenta una sola vez.
 * `futureReservations` son las de hoy en adelante.
 */
export function affectedReservations(change: ScheduleChange, futureReservations: readonly FutureReservation[]): readonly FutureReservation[] {
  const afterById = new Map(change.after.map((s) => [s.id, s]));
  const newlyClosed = new Set(change.closedAfter.filter((d) => !change.closedBefore.includes(d)));
  return futureReservations.filter((r) => {
    if (!countsTowardCapacity(r.status)) return false;
    // Un día que pasa a estar cerrado afecta a TODAS sus reservas, también a las de "Fuera de turno".
    if (newlyClosed.has(r.date)) return true;
    if (r.shiftId === null) return false;
    const stillThere = afterById.get(r.shiftId);
    if (!stillThere || !stillThere.active) return true;
    return !stillThere.weekdays.includes(isoWeekday(r.date));
  });
}

/** Atajo "Días que abrís": marca o desmarca un día de la semana en TODOS los turnos activos. */
export function setWeekdayOpen(shifts: readonly Shift[], weekday: number, open: boolean): readonly Shift[] {
  return shifts.map((s) => {
    if (!s.active) return s;
    const has = s.weekdays.includes(weekday);
    if (open && !has) return { ...s, weekdays: [...s.weekdays, weekday].sort((a, b) => a - b) };
    if (!open && has) return { ...s, weekdays: s.weekdays.filter((d) => d !== weekday) };
    return s;
  });
}
