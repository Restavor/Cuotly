"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { requestReservations, reservationTerms } from "@/services/app-gateway";
import { sendReservationPushNow } from "@/services/reservation-push";

/**
 * RN-APP-03 · las dos operaciones de "Contratar Reservas".
 *
 * Ninguna autoriza nada: `reservation_service_terms()` solo contesta al
 * Propietario del restaurante (o a quien gestiona sus clientes) y
 * `request_reservations()` comprueba en el servidor quién pide, que el
 * espacio ofrezca Reservas, que las condiciones sean las vigentes y que no
 * haya otra solicitud abierta. Aquí solo se traduce el resultado.
 */

export type ReservationTermsResult =
  | {
      readonly ok: true;
      readonly versionId: string;
      readonly version: number;
      readonly conditions: string;
    }
  | { readonly ok: false; readonly error: string };

export async function loadReservationTerms(
  establishmentId: string,
): Promise<ReservationTermsResult> {
  const supabase = await createClient();
  try {
    const terms = await reservationTerms(supabase, establishmentId);
    if (terms === null) return { ok: false, error: es.app.contract.conditionsMissing };
    return {
      ok: true,
      versionId: terms.serviceVersionId,
      version: terms.version,
      conditions: terms.conditions,
    };
  } catch {
    return { ok: false, error: es.app.contract.conditionsMissing };
  }
}

export type RequestReservationsResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

export async function requestReservationsAction(
  establishmentId: string,
  serviceVersionId: string,
  idempotencyKey: string,
): Promise<RequestReservationsResult> {
  const supabase = await createClient();
  let requestId: string;
  try {
    requestId = await requestReservations(supabase, establishmentId, serviceVersionId, idempotencyKey);
  } catch (error) {
    const message = error instanceof Error ? error.message.trim() : "";
    return { ok: false, error: message === "" ? es.app.contract.errorFallback : message };
  }
  // Decisión 99 · el push sale al momento; el correo, en su tanda del día.
  await sendReservationPushNow(requestId);
  revalidatePath("/");
  return { ok: true };
}
