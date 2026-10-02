/**
 * `src/core/reservations/availability.ts` · disponibilidad, antelación y alternativas
 * (RN-RES-02, RN-RES-03, RN-RES-04, RN-RES-05; PRD de agents §6.3 a §6.6).
 *
 * `getAvailability` responde, para un día y un número de personas, qué horas tienen
 * sitio según quién pide (agente, web, plataforma o manual), y, si la hora pedida no
 * está disponible, hasta tres alternativas. La misma regla se repite en SQL
 * (`book_reservation`, que es la que protege la base de datos) con su suite.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */
import { capacityState, freeSeats } from "./capacity";
import type { CapacityState } from "./capacity";
import { addDays, isoWeekday, localDateTimeOf, localToUtc, minutesOfDay } from "./dates";
import type { LocalDate, LocalTime } from "./dates";
import { classifyRequestedTime, slotsOfDay } from "./shifts";
import type { Shift, SlotInterval } from "./shifts";
import { countsTowardCapacity } from "./types";
import type { ReservationOrigin, ReservationStatus } from "./types";

export type UnavailableReason =
  | "full"
  | "too_soon"
  | "too_far"
  | "closed_day"
  | "not_a_slot"
  | "service_paused";

/** Lo mínimo de una reserva que hace falta para contar la ocupación. */
export interface OccupancyReservation {
  readonly id: string;
  readonly shiftId: string | null;
  readonly date: LocalDate;
  readonly partySize: number;
  readonly status: ReservationStatus;
}

/** Los ajustes del restaurante que intervienen (`reservation_settings`). */
export interface AvailabilitySettings {
  readonly timeZone: string;
  readonly slotInterval: SlotInterval;
  readonly largeGroupThreshold: number;
  readonly minNoticeMinutes: number;
  readonly maxAdvanceDays: number;
  /** `paused` y `ending` cambian lo que se puede reservar (§6.12). Otro estado no cambia nada. */
  readonly serviceStatus: "approved_pending_payment" | "active" | "past_due" | "paused" | "ending" | "closed";
  /** Último día cubierto por el periodo pagado, solo con la baja pedida (`ending`). */
  readonly paidUntil?: LocalDate | null;
}

export interface AvailabilityRestaurant {
  readonly name: string;
  readonly localPhone: string | null;
  readonly transferPhone: string | null;
}

export interface AvailabilityInput {
  readonly date: LocalDate;
  readonly partySize: number;
  readonly requestedTime?: LocalTime;
  readonly source: ReservationOrigin;
  /** El instante de "ahora". Se pasa de fuera: el dominio no lee el reloj. */
  readonly now: Date;
  readonly shifts: readonly Shift[];
  readonly closedDates: readonly LocalDate[];
  /** Las reservas de los días que pueden entrar en juego (el día pedido y los 14 siguientes). */
  readonly reservations: readonly OccupancyReservation[];
  readonly settings: AvailabilitySettings;
  readonly restaurant: AvailabilityRestaurant;
  /** Reserva que se está editando: no cuenta contra sí misma (§6.3). */
  readonly excludeReservationId?: string;
}

export interface SlotAvailability {
  readonly time: LocalTime;
  readonly shiftId: string;
  readonly available: boolean;
  readonly reason?: UnavailableReason;
  /** Personas ≥ umbral de grupo grande, y quien pide es agente o web: queda pendiente (§6.6). */
  readonly requiresConfirmation: boolean;
  /** Plazas libres del turno ese día, sin contar a quien pide (puede ser negativa). */
  readonly freeSeats: number;
}

export interface Alternative {
  readonly date: LocalDate;
  readonly time: LocalTime;
}

export interface RequestedAvailability {
  readonly time: LocalTime;
  readonly available: boolean;
  readonly reason?: UnavailableReason;
  /** Frase lista para decir al cliente. Solo cuando no está disponible. */
  readonly message?: string;
}

export interface AvailabilityResult {
  readonly date: LocalDate;
  readonly slots: readonly SlotAvailability[];
  readonly requested?: RequestedAvailability;
  readonly alternatives: readonly Alternative[];
  readonly restaurant: AvailabilityRestaurant;
}

/** Cuántos días hacia delante se busca la misma hora cuando el día pedido no sirve (§6.5). */
export const ALTERNATIVE_SEARCH_DAYS = 14;
/** Distancia máxima, en minutos, de una alternativa del mismo día (§6.5). */
export const SAME_DAY_ALTERNATIVE_MINUTES = 120;
export const MAX_ALTERNATIVES = 3;

/** Los orígenes a los que se aplica el aforo duro y la antelación: los que piden el hueco, no los que informan de una reserva ya hecha. */
export function isRequestingOrigin(source: ReservationOrigin): boolean {
  return source === "agent" || source === "web";
}

/** Ocupación de un turno un día: personas de reservas pendientes y confirmadas (§6.3). */
export function occupancyOf(
  reservations: readonly OccupancyReservation[],
  shiftId: string,
  date: LocalDate,
  excludeReservationId?: string,
): number {
  return reservations
    .filter((r) => r.shiftId === shiftId && r.date === date && r.id !== excludeReservationId && countsTowardCapacity(r.status))
    .reduce((sum, r) => sum + r.partySize, 0);
}

/** Antelación (§6.4): `too_soon` antes del mínimo, `too_far` después del máximo o del fin del periodo pagado. Solo agente y web. */
export function noticeReason(
  date: LocalDate,
  time: LocalTime,
  now: Date,
  settings: AvailabilitySettings,
): "too_soon" | "too_far" | undefined {
  const start = localToUtc(date, time, settings.timeZone);
  if (!start.ok) return undefined;
  if (start.value.getTime() < now.getTime() + settings.minNoticeMinutes * 60_000) return "too_soon";
  const today = localDateTimeOf(now, settings.timeZone).date;
  if (date > addDays(today, settings.maxAdvanceDays)) return "too_far";
  if (settings.serviceStatus === "ending" && settings.paidUntil && date > settings.paidUntil) return "too_far";
  return undefined;
}

interface SlotEvaluation {
  readonly available: boolean;
  readonly reason?: UnavailableReason;
  readonly requiresConfirmation: boolean;
  readonly free: number;
  readonly state: CapacityState;
}

function evaluateSlot(input: AvailabilityInput, date: LocalDate, time: LocalTime, shift: Shift): SlotEvaluation {
  const { settings, source } = input;
  const occupied = occupancyOf(input.reservations, shift.id, date, input.excludeReservationId);
  const free = freeSeats(shift.capacity, occupied);
  const state = capacityState(shift.capacity, occupied);
  const requiresConfirmation = isRequestingOrigin(source) && input.partySize >= settings.largeGroupThreshold;
  const base = { requiresConfirmation, free, state };

  // Reservas en pausa: no se crean reservas por ninguna vía salvo las que ya hizo una plataforma.
  if (settings.serviceStatus === "paused" && source !== "platform") {
    return { ...base, available: false, reason: "service_paused" };
  }
  if (isRequestingOrigin(source)) {
    const notice = noticeReason(date, time, input.now, settings);
    if (notice) return { ...base, available: false, reason: notice };
    if (occupied + input.partySize > shift.capacity) return { ...base, available: false, reason: "full" };
  }
  return { ...base, available: true };
}

const WEEKDAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;

/**
 * Las frases que el agente le dice al cliente (§6.5). Viven aquí y no en `es.ts` porque
 * son la respuesta de la API para la voz, no texto de una pantalla.
 */
export function unavailableMessage(
  reason: UnavailableReason,
  date: LocalDate,
  time: LocalTime,
  partySize: number,
): string {
  const day = WEEKDAY_NAMES[isoWeekday(date) - 1];
  switch (reason) {
    case "full":
      return `El ${day} a las ${time} no nos queda sitio para ${partySize} ${partySize === 1 ? "persona" : "personas"}.`;
    case "closed_day":
      return `El ${day} ${date.slice(8)}/${date.slice(5, 7)} estamos cerrados.`;
    case "not_a_slot":
      return `A las ${time} no tenemos hueco para reservar.`;
    case "too_soon":
      return `Para el ${day} a las ${time} ya no podemos aceptar la reserva: hace falta pedirla con más antelación.`;
    case "too_far":
      return `Todavía no aceptamos reservas para el ${day} ${date.slice(8)}/${date.slice(5, 7)}.`;
    case "service_paused":
      return "Ahora mismo no podemos tomar reservas por teléfono.";
  }
}

/** Todas las horas de un día con su disponibilidad. */
function slotsFor(input: AvailabilityInput, date: LocalDate): readonly SlotAvailability[] {
  const { shifts, closedDates, settings } = input;
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  return slotsOfDay(date, shifts, closedDates, settings.slotInterval).map((slot) => {
    const shift = shiftById.get(slot.shiftId) as Shift;
    const e = evaluateSlot(input, date, slot.time, shift);
    return {
      time: slot.time,
      shiftId: slot.shiftId,
      available: e.available,
      ...(e.reason ? { reason: e.reason } : {}),
      requiresConfirmation: e.requiresConfirmation,
      freeSeats: e.free,
    };
  });
}

/**
 * Alternativas (§6.5): primero huecos del MISMO día a 120 minutos o menos de la hora
 * pedida (los más cercanos; a igual distancia, el más temprano; en orden cronológico);
 * si no hay, la MISMA hora en los siguientes días abiertos (14 días como mucho).
 */
function alternativesFor(input: AvailabilityInput, requestedTime: LocalTime, sameDay: readonly SlotAvailability[]): readonly Alternative[] {
  const target = minutesOfDay(requestedTime);
  const near = sameDay
    .filter((s) => s.available && s.time !== requestedTime && Math.abs(minutesOfDay(s.time) - target) <= SAME_DAY_ALTERNATIVE_MINUTES)
    .sort((a, b) => {
      const da = Math.abs(minutesOfDay(a.time) - target);
      const db = Math.abs(minutesOfDay(b.time) - target);
      return da - db || minutesOfDay(a.time) - minutesOfDay(b.time);
    })
    .slice(0, MAX_ALTERNATIVES)
    .sort((a, b) => minutesOfDay(a.time) - minutesOfDay(b.time));
  if (near.length > 0) return near.map((s) => ({ date: input.date, time: s.time }));

  const out: Alternative[] = [];
  for (let i = 1; i <= ALTERNATIVE_SEARCH_DAYS && out.length < MAX_ALTERNATIVES; i += 1) {
    const date = addDays(input.date, i);
    const hit = slotsFor(input, date).find((s) => s.time === requestedTime && s.available);
    if (hit) out.push({ date, time: requestedTime });
  }
  return out;
}

/** `getAvailability` (RN-RES-04). Ver la cabecera del archivo. */
export function getAvailability(input: AvailabilityInput): AvailabilityResult {
  const slots = slotsFor(input, input.date);
  const { requestedTime } = input;
  if (requestedTime === undefined) {
    return { date: input.date, slots, alternatives: [], restaurant: input.restaurant };
  }

  const classified = classifyRequestedTime(input.date, requestedTime, input.shifts, input.closedDates, input.settings.slotInterval);
  let reason: UnavailableReason | undefined;
  if (classified.status === "closed_day") reason = "closed_day";
  else if (classified.status === "not_a_slot") reason = "not_a_slot";
  else reason = slots.find((s) => s.time === requestedTime)?.reason;

  if (reason === undefined) {
    return { date: input.date, slots, requested: { time: requestedTime, available: true }, alternatives: [], restaurant: input.restaurant };
  }
  const requested: RequestedAvailability = {
    time: requestedTime,
    available: false,
    reason,
    message: unavailableMessage(reason, input.date, requestedTime, input.partySize),
  };
  // Con las reservas en pausa no hay nada que ofrecer (§6.5 d).
  const alternatives = reason === "service_paused" ? [] : alternativesFor(input, requestedTime, slots);
  return { date: input.date, slots, requested, alternatives, restaurant: input.restaurant };
}
