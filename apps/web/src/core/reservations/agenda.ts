/**
 * `src/core/reservations/agenda.ts` · lo que enseña la pantalla Hoy (RES-01; PRD de agents
 * §6.1, §6.3 y §15): el resumen del día, el orden de las filas, los filtros por origen
 * con sus contadores y los bloques por turno con su aforo.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */
import { capacityState } from "./capacity";
import type { CapacityState } from "./capacity";
import type { LocalDate, LocalTime } from "./dates";
import { minutesOfDay } from "./dates";
import type { Shift } from "./shifts";
import { RESERVATION_ORIGINS, countsTowardCapacity } from "./types";
import type { ReservationOrigin, ReservationStatus } from "./types";

export interface AgendaReservation {
  readonly id: string;
  readonly shiftId: string | null;
  readonly date: LocalDate;
  readonly time: LocalTime;
  readonly partySize: number;
  readonly status: ReservationStatus;
  readonly source: ReservationOrigin;
  readonly customerName: string;
}

/** "N reservas · M personas · K pendientes": no cuenta canceladas ni "No vino" (RES-01). */
export function daySummary(reservations: readonly AgendaReservation[]): {
  readonly reservations: number;
  readonly people: number;
  readonly pending: number;
} {
  const live = reservations.filter((r) => countsTowardCapacity(r.status));
  return {
    reservations: live.length,
    people: live.reduce((sum, r) => sum + r.partySize, 0),
    pending: live.filter((r) => r.status === "pending").length,
  };
}

/** Las canceladas van tachadas AL FINAL DE SU HORA; "No vino" conserva su sitio (RES-01). */
export function sortDayRows<T extends AgendaReservation>(rows: readonly T[]): readonly T[] {
  return [...rows].sort((a, b) => {
    const byTime = minutesOfDay(a.time) - minutesOfDay(b.time);
    if (byTime !== 0) return byTime;
    const ca = a.status === "cancelled" ? 1 : 0;
    const cb = b.status === "cancelled" ? 1 : 0;
    if (ca !== cb) return ca - cb;
    return a.customerName.localeCompare(b.customerName, "es");
  });
}

export type OriginFilter = "all" | ReservationOrigin;
export const ORIGIN_FILTERS: readonly OriginFilter[] = ["all", ...RESERVATION_ORIGINS];

export function isOriginFilter(value: unknown): value is OriginFilter {
  return typeof value === "string" && (ORIGIN_FILTERS as readonly string[]).includes(value);
}

/** Contadores de los filtros: solo reservas vivas, como el resumen ("Todas 10" del PRD). */
export function originCounters(reservations: readonly AgendaReservation[]): Readonly<Record<OriginFilter, number>> {
  const live = reservations.filter((r) => countsTowardCapacity(r.status));
  return {
    all: live.length,
    agent: live.filter((r) => r.source === "agent").length,
    platform: live.filter((r) => r.source === "platform").length,
    web: live.filter((r) => r.source === "web").length,
    manual: live.filter((r) => r.source === "manual").length,
  };
}

export function filterByOrigin<T extends AgendaReservation>(rows: readonly T[], filter: OriginFilter): readonly T[] {
  return filter === "all" ? rows : rows.filter((r) => r.source === filter);
}

export interface ShiftBlock<T extends AgendaReservation> {
  /** `null` = el bloque "Fuera de turno" (plataforma sin turno). */
  readonly shift: Shift | null;
  readonly rows: readonly T[];
  readonly occupied: number;
  readonly state: CapacityState | null;
}

/**
 * Un bloque por turno que abre ese día, con la ocupación del DÍA ENTERO (no la del
 * filtro: el aforo es del turno, no de lo que se está mirando) y las filas filtradas.
 * Las reservas sin turno van a "Fuera de turno" con su aviso. Los turnos activos de
 * ese día de la semana salen aunque no tengan reservas.
 */
export function groupByShift<T extends AgendaReservation>(
  all: readonly T[],
  visible: readonly T[],
  shiftsOfDay: readonly Shift[],
): readonly ShiftBlock<T>[] {
  const blocks: ShiftBlock<T>[] = shiftsOfDay
    .slice()
    .sort((a, b) => minutesOfDay(a.startTime) - minutesOfDay(b.startTime))
    .map((shift) => {
      const occupied = all.filter((r) => r.shiftId === shift.id && countsTowardCapacity(r.status)).reduce((s, r) => s + r.partySize, 0);
      return {
        shift,
        rows: sortDayRows(visible.filter((r) => r.shiftId === shift.id)),
        occupied,
        state: capacityState(shift.capacity, occupied),
      };
    });
  const knownIds = new Set(shiftsOfDay.map((s) => s.id));
  const orphan = visible.filter((r) => r.shiftId === null || !knownIds.has(r.shiftId));
  if (orphan.length > 0) {
    blocks.push({ shift: null, rows: sortDayRows(orphan), occupied: orphan.filter((r) => countsTowardCapacity(r.status)).reduce((s, r) => s + r.partySize, 0), state: null });
  }
  return blocks;
}

/** La primera pendiente del día por hora: a donde lleva "Revisar" (RES-01). */
export function firstPending<T extends AgendaReservation>(rows: readonly T[]): T | undefined {
  return sortDayRows(rows).find((r) => r.status === "pending");
}
