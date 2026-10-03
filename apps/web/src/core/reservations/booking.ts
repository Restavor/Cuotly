/**
 * `src/core/reservations/booking.ts` · qué pasa cuando alguien intenta reservar o cambiar
 * una reserva (RN-RES-02, RN-RES-03, RN-RES-05, RN-RES-07; PRD de agents §6.3 a §6.6, §6.8).
 *
 * Según quién hace la operación:
 * - `agent` y `web`: si no cabe, `full` con alternativas; si son ≥ umbral, quedan `pending`.
 * - `platform`: entra siempre; el turno puede quedar en "Aforo superado"; fuera de turno
 *   o en día cerrado entra con `shiftId = null` ("Fuera de turno").
 * - `manual` (el restaurante o el soporte): si se pasa del aforo, avisa y pide `force`;
 *   no admite fechas pasadas, días cerrados ni horas que no son hueco.
 *
 * La RPC `book_reservation` repite esta decisión en SQL bajo un bloqueo; esto es la
 * versión pura que se enseña en pantalla y se prueba con los ejemplos del PRD.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */
import { getAvailability, isRequestingOrigin, occupancyOf } from "./availability";
import type { Alternative, AvailabilityInput, UnavailableReason } from "./availability";
import { capacityState, overflowBy } from "./capacity";
import type { CapacityState } from "./capacity";
import { localDateOf } from "./dates";
import type { LocalDate, LocalTime } from "./dates";
import { classifyRequestedTime } from "./shifts";
import type { ReservationOrigin, ReservationStatus } from "./types";

export type BookingRejection = UnavailableReason | "past_date";

/** Lo que puede contestar la RPC `book_reservation` además de las razones de `decideBooking`. */
export type BookingRejectionReason = BookingRejection | "platform_locked" | "not_editable" | "invalid_time";

export type BookingDecision =
  | {
      readonly outcome: "accepted";
      readonly status: Extract<ReservationStatus, "pending" | "confirmed">;
      /** `null` solo para una plataforma fuera de todo turno ("Fuera de turno"). */
      readonly shiftId: string | null;
      readonly outOfShift: boolean;
      /** Estado de la barra del turno una vez guardada. */
      readonly capacityAfter: CapacityState | null;
      /** Personas por encima del aforo tras guardarla (plataforma y manual forzada). 0 si cabe. */
      readonly overCapacityBy: number;
    }
  | {
      /** Manual: se pasa del aforo. Hay que volver a pedir con `force`. */
      readonly outcome: "needs_confirmation";
      readonly shiftId: string;
      readonly overflowBy: number;
      readonly occupiedAfter: number;
      readonly capacity: number;
    }
  | {
      readonly outcome: "rejected";
      readonly reason: BookingRejection;
      readonly message?: string;
      readonly alternatives: readonly Alternative[];
    };

export interface BookingInput extends Omit<AvailabilityInput, "requestedTime" | "date"> {
  readonly date: LocalDate;
  readonly time: LocalTime;
  /** El usuario ha aceptado el aviso de aforo (manual). */
  readonly force?: boolean;
}

/** La decisión de §6.3 a §6.6 para un alta o un cambio de fecha, hora o personas. */
export function decideBooking(input: BookingInput): BookingDecision {
  const { source, settings, date, time, partySize } = input;
  const availability = getAvailability({ ...input, requestedTime: time });
  const requested = availability.requested;
  const classified = classifyRequestedTime(date, time, input.shifts, input.closedDates, settings.slotInterval);
  const shiftId = classified.status === "slot" ? (classified.shiftId ?? null) : null;

  // Las reservas en pausa solo dejan pasar a las plataformas (§6.12).
  if (settings.serviceStatus === "paused" && source !== "platform") {
    return { outcome: "rejected", reason: "service_paused", message: requested?.message, alternatives: [] };
  }

  // Las manuales no se crean en fechas pasadas (§6.4). `date` y hoy, en la zona del restaurante.
  if (source === "manual" && date < localDateOf(input.now, settings.timeZone)) {
    return { outcome: "rejected", reason: "past_date", alternatives: [] };
  }

  if (source === "platform") {
    if (shiftId === null) {
      return { outcome: "accepted", status: "confirmed", shiftId: null, outOfShift: true, capacityAfter: null, overCapacityBy: 0 };
    }
    return acceptedAt(input, shiftId, "confirmed");
  }

  if (shiftId === null) {
    // Manual o requesting en un día cerrado o en una hora que no es hueco.
    const reason: BookingRejection = classified.status === "closed_day" ? "closed_day" : "not_a_slot";
    return { outcome: "rejected", reason, message: requested?.message, alternatives: availability.alternatives };
  }

  if (isRequestingOrigin(source)) {
    if (requested && !requested.available && requested.reason) {
      return { outcome: "rejected", reason: requested.reason, message: requested.message, alternatives: availability.alternatives };
    }
    const status = partySize >= settings.largeGroupThreshold ? "pending" : "confirmed";
    return acceptedAt(input, shiftId, status);
  }

  // Manual: avisa si se pasa del aforo (§6.3) y entra si se acepta.
  const shift = input.shifts.find((s) => s.id === shiftId);
  if (!shift) return { outcome: "rejected", reason: "not_a_slot", alternatives: [] };
  const occupied = occupancyOf(input.reservations, shiftId, date, input.excludeReservationId);
  const over = overflowBy(shift.capacity, occupied, partySize);
  if (over > 0 && input.force !== true) {
    return { outcome: "needs_confirmation", shiftId, overflowBy: over, occupiedAfter: occupied + partySize, capacity: shift.capacity };
  }
  return acceptedAt(input, shiftId, "confirmed");
}

function acceptedAt(input: BookingInput, shiftId: string, status: "pending" | "confirmed"): BookingDecision {
  const shift = input.shifts.find((s) => s.id === shiftId);
  if (!shift) return { outcome: "accepted", status, shiftId, outOfShift: false, capacityAfter: null, overCapacityBy: 0 };
  const occupiedAfter = occupancyOf(input.reservations, shiftId, input.date, input.excludeReservationId) + input.partySize;
  return {
    outcome: "accepted",
    status,
    shiftId,
    outOfShift: false,
    capacityAfter: capacityState(shift.capacity, occupiedAfter),
    overCapacityBy: Math.max(0, occupiedAfter - shift.capacity),
  };
}

// ---------------------------------------------------------------------------
// Editar (RN-RES-07, §6.8)
// ---------------------------------------------------------------------------

export type EditField = "date" | "time" | "party_size" | "name" | "phone" | "language" | "notes";

/** Los campos que reaplican las reglas de aforo, antelación y grupo (§6.8). */
export const SCHEDULING_FIELDS: readonly EditField[] = ["date", "time", "party_size"];

export function touchesScheduling(changed: readonly EditField[]): boolean {
  return changed.some((f) => SCHEDULING_FIELDS.includes(f));
}

export interface PlatformCapabilities {
  readonly canCancel: boolean;
  readonly canModify: boolean;
}

/**
 * Qué campos quedan bloqueados en una reserva de plataforma (§6.8): si el conector no
 * permite modificar, fecha, hora y personas se cambian en la plataforma; nombre,
 * teléfono, idioma y nota solo existen en la app y siempre se pueden cambiar.
 */
export function lockedFields(source: ReservationOrigin, capabilities: PlatformCapabilities | null): readonly EditField[] {
  if (source !== "platform") return [];
  return capabilities?.canModify === true ? [] : SCHEDULING_FIELDS;
}

/**
 * El estado tras un cambio de personas (§6.8): el agente que sube una confirmada al
 * umbral o más la deja `pending`; bajar una pendiente por debajo del umbral NO la
 * confirma sola; cualquier otro caso conserva el estado.
 */
export function statusAfterEdit(
  current: ReservationStatus,
  changedBy: ReservationOrigin,
  newPartySize: number,
  largeGroupThreshold: number,
): ReservationStatus {
  if (current === "confirmed" && changedBy === "agent" && newPartySize >= largeGroupThreshold) return "pending";
  return current;
}

/** Pendiente sin respuesta: a las 2 horas se avisa una vez más; nunca caduca sola (§6.6). */
export const PENDING_REMINDER_MINUTES = 120;

export function pendingNeedsReminder(createdAt: Date, remindedAt: Date | null, now: Date): boolean {
  return remindedAt === null && now.getTime() - createdAt.getTime() >= PENDING_REMINDER_MINUTES * 60_000;
}
