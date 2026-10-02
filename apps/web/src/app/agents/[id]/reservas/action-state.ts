/**
 * Los resultados de las acciones de la agenda. Viven aquí y no junto a las acciones: un
 * archivo `"use server"` solo puede exportar funciones asíncronas
 * (`src/app/use-server-exports.test.ts`).
 */
import type { BookingField } from "@/core/reservations/booking-input";

export type ActionFeedback = { readonly ok: true; readonly message: string | null } | { readonly ok: false; readonly message: string };

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
    };

export type ScheduleFeedback =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly message: string; readonly affected?: number };

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
}
