/**
 * `src/core/reservations/types.ts` · orígenes y estados de una reserva y sus
 * transiciones (PRD de agents §6.1). Son los datos; las condiciones de cada
 * transición ("No vino" solo cuando ya pasó la hora, deshacerlo el mismo día…) las
 * añade la Fase C con su regla y su test (RN-RES-07 y RN-RES-09).
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */

export const RESERVATION_ORIGINS = ["agent", "platform", "web", "manual"] as const;
export type ReservationOrigin = (typeof RESERVATION_ORIGINS)[number];

export const RESERVATION_STATUSES = ["pending", "confirmed", "cancelled", "no_show"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/**
 * Transiciones que el PRD permite, sin sus condiciones: Confirmar (`pending` a
 * `confirmed`), Rechazar y Cancelar (a `cancelled`), "No vino" y deshacerlo, y el
 * agente que sube las personas de una confirmada al umbral (`confirmed` a `pending`).
 * `cancelled` es final: una reserva cancelada no vuelve.
 */
export const RESERVATION_TRANSITIONS: Readonly<Record<ReservationStatus, readonly ReservationStatus[]>> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "no_show", "pending"],
  cancelled: [],
  no_show: ["confirmed"],
};

export function isValidTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return RESERVATION_TRANSITIONS[from].includes(to);
}

/** Las reservas que cuentan para el aforo y el resumen del día: pendientes y confirmadas (§6.3). */
export function countsTowardCapacity(status: ReservationStatus): boolean {
  return status === "pending" || status === "confirmed";
}
