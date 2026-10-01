"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { createReservationRequestOnBehalf } from "@/services/app-gateway";
import { sendReservationPushNow } from "@/services/reservation-push";

import type { ReservationRequestFormState } from "./action-state";

/**
 * RN-APP-03 · "Crear solicitud para este restaurante": el equipo del espacio
 * deja escrita la solicitud de Reservas de un restaurante que la pidió fuera
 * de la aplicación. Sin aceptación de condiciones todavía: la da el
 * Propietario del restaurante la primera vez que entra, tras la aprobación.
 *
 * Quién puede lo decide `create_reservation_request_on_behalf()`
 * (`manage_clients`), y que el espacio ofrezca Reservas y que no haya otra
 * solicitud abierta, también. Esta acción solo traduce el resultado. La clave
 * de idempotencia la trae el formulario: dos pulsaciones, una sola solicitud.
 */
export async function createReservationRequest(
  _prev: ReservationRequestFormState,
  formData: FormData,
): Promise<ReservationRequestFormState> {
  const slug = String(formData.get("slug") ?? "");
  const establishmentId = String(formData.get("establishmentId") ?? "").trim();
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();
  const t = es.reservationsSpace.create;

  if (establishmentId === "") return { error: t.chooseOne, done: false, establishmentId };

  const supabase = await createClient();
  let requestId: string;
  try {
    requestId = await createReservationRequestOnBehalf(supabase, establishmentId, idempotencyKey);
  } catch (error) {
    const message = error instanceof Error ? error.message.trim() : "";
    return { error: message === "" ? es.states.errorDescription : message, done: false, establishmentId };
  }

  // Decisión 99 · el push al equipo sale al momento; el correo, en su tanda.
  await sendReservationPushNow(requestId);
  revalidatePath(`/espacios/${slug}/reservas`);
  return { error: null, done: true, establishmentId: "" };
}
