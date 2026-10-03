/**
 * Los resultados de las acciones de la agenda. Viven aquí y no junto a las acciones: un
 * archivo `"use server"` solo puede exportar funciones asíncronas
 * (`src/app/use-server-exports.test.ts`).
 */
import type { BookingField } from "@/core/reservations/booking-input";
import type { DeviceAuthFailure } from "@/core/reservations/device";

/**
 * `device` solo viene cuando la acción se pidió desde la tablet del local y el acceso se denegó (PIN malo,
 * bloqueada, rol que no alcanza, dispositivo desactivado): es lo que hace que el teclado de PIN vuelva a pedirlo.
 */
export type ActionFeedback =
  | { readonly ok: true; readonly message: string | null }
  | { readonly ok: false; readonly message: string; readonly device?: DeviceAuthFailure };

export type SaveReservationResult =
  | { readonly status: "done"; readonly reservationId: string; readonly date: string }
  | {
      readonly status: "needs_confirmation";
      readonly overflowBy: number;
      readonly occupiedAfter: number;
      readonly capacity: number;
      readonly shiftName: string;
    }
  | {
      readonly status: "error";
      readonly message: string;
      readonly fields: Partial<Record<BookingField, true>>;
      readonly device?: DeviceAuthFailure;
    };

export type ScheduleFeedback =
  | { readonly ok: true; readonly message: string; readonly shiftIds?: readonly string[] }
  | { readonly ok: false; readonly message: string; readonly affected?: number; readonly device?: DeviceAuthFailure };

export interface SaveReservationInput {
  readonly establishmentId: string;
  /** `null` = alta; con id, edición. */
  readonly reservationId: string | null;
  readonly date: string;
  readonly time: string;
  readonly partySize: number | string;
  readonly name: string;
  readonly phone: string;
  readonly email: string;
  readonly notes: string;
  readonly language: string;
  readonly force: boolean;
  readonly idempotencyKey: string;
  /** El PIN tecleado en la tablet del local para esta acción (PRD §3.3). No autoriza nada por sí solo. */
  readonly pin?: string;
  /** Solo al editar: la fecha que tenía, para avisar también a las pantallas que miran ese día. No autoriza nada. */
  readonly previousDate?: string;
}
