"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import {
  approveRequest,
  closeService,
  reactivateClosed,
  rejectRequest,
  requestCancellation,
  savePaymentDetails,
  undoCancellation,
} from "@/services/agents/billing-gateway";
import { deliverNoticesNow } from "@/services/agents/lifecycle-delivery";
import { createReservationRequestOnBehalf } from "@/services/app-gateway";
import { sendReservationPushNow } from "@/services/reservation-push";

import type { ReservationRequestFormState, SpaceReservationsFeedback } from "./action-state";

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

// ---------------------------------------------------------------------------
// Fase E · aprobar, rechazar y llevar el ciclo de vida desde el espacio (PRD de agents §4.4 y §6.12).
//
// Ninguna autoriza nada: quién puede lo deciden `approve_reservation_request()`, `reject_reservation_request()`,
// `close_reservations_service()`… (`manage_clients`). Aquí se traduce lo que contestan y, tras aprobar, se manda
// al momento lo que lo pide: el push y el correo «Aprobado: datos para pagar» (decisión 137).
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Los mensajes de negocio de la base de datos están en español y se enseñan tal cual; cualquier otro, el genérico. */
const BUSINESS_MESSAGE =
  /^(No tienes permiso|Solo |Esta solicitud|Este restaurante|Este espacio|Rechazar|Cerrar|Reservas |Restaurante no|Solicitud no|El IBAN|El teléfono|La nota|El motivo|El espacio|Pasaron|Hace falta)/;

function failure(error: unknown): SpaceReservationsFeedback {
  const text = error instanceof Error ? error.message.trim() : "";
  return { ok: false, message: BUSINESS_MESSAGE.test(text) ? text : es.reservationsSpace.errors.failed };
}

function refresh(slug: string) {
  revalidatePath(`/espacios/${slug}/reservas`);
}

/** El restaurante de una solicitud, leído con la sesión de quien actúa (RLS: solo el equipo del espacio la ve). */
async function establishmentOfRequest(requestId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reservation_service_requests")
    .select("establishment_id")
    .eq("id", requestId)
    .maybeSingle();
  return data?.establishment_id ?? null;
}

export async function approveRequestAction(input: { slug: string; requestId: string }): Promise<SpaceReservationsFeedback> {
  if (!UUID.test(input.requestId)) return { ok: false, message: es.reservationsSpace.errors.failed };
  try {
    const establishmentId = await establishmentOfRequest(input.requestId);
    await approveRequest(await createClient(), input.requestId);
    if (establishmentId) {
      const key = `reservation_service_approved:${input.requestId}`;
      await deliverNoticesNow({ pushKeys: [key], emailKeys: [key], establishmentIds: [establishmentId] });
    }
    refresh(input.slug);
    return { ok: true, message: es.reservationsSpace.requests.approved };
  } catch (error) {
    return failure(error);
  }
}

export async function rejectRequestAction(input: { slug: string; requestId: string; reason: string }): Promise<SpaceReservationsFeedback> {
  if (!UUID.test(input.requestId)) return { ok: false, message: es.reservationsSpace.errors.failed };
  const reason = input.reason.trim();
  if (reason === "") return { ok: false, message: es.reservationsSpace.requests.reasonRequired };
  try {
    await rejectRequest(await createClient(), input.requestId, reason);
    // Solo el push al momento; el correo de «No podemos darte acceso» sale en su tanda.
    await deliverNoticesNow({ pushKeys: [`reservation_service_rejected:${input.requestId}`], emailKeys: [], establishmentIds: [] });
    refresh(input.slug);
    return { ok: true, message: es.reservationsSpace.requests.rejected };
  } catch (error) {
    return failure(error);
  }
}

export async function closeServiceAction(input: { slug: string; establishmentId: string; reason: string }): Promise<SpaceReservationsFeedback> {
  if (!UUID.test(input.establishmentId)) return { ok: false, message: es.reservationsSpace.errors.failed };
  const reason = input.reason.trim();
  if (reason === "") return { ok: false, message: es.reservationsSpace.running.reasonRequired };
  try {
    await closeService(await createClient(), input.establishmentId, reason);
    refresh(input.slug);
    return { ok: true, message: es.reservationsSpace.running.closedDone };
  } catch (error) {
    return failure(error);
  }
}

export async function reactivateClosedAction(input: { slug: string; establishmentId: string }): Promise<SpaceReservationsFeedback> {
  if (!UUID.test(input.establishmentId)) return { ok: false, message: es.reservationsSpace.errors.failed };
  try {
    const subscriptionId = await reactivateClosed(await createClient(), input.establishmentId);
    if (subscriptionId) {
      // Es otro «Aprobado: datos para pagar», con el cobro nuevo: sale al momento como el primero.
      const key = `reservation_service_approved:${subscriptionId}`;
      await deliverNoticesNow({ pushKeys: [key], emailKeys: [key], establishmentIds: [input.establishmentId] });
    }
    refresh(input.slug);
    return { ok: true, message: es.reservationsSpace.running.reactivatedDone };
  } catch (error) {
    return failure(error);
  }
}

/** La baja en nombre del restaurante: la pide Restavor cuando el Propietario se lo dice fuera de la aplicación. */
export async function cancelServiceAction(input: { slug: string; establishmentId: string }): Promise<SpaceReservationsFeedback> {
  if (!UUID.test(input.establishmentId)) return { ok: false, message: es.reservationsSpace.errors.failed };
  try {
    await requestCancellation(await createClient(), input.establishmentId);
    refresh(input.slug);
    return { ok: true, message: es.reservationsSpace.running.cancelDone };
  } catch (error) {
    return failure(error);
  }
}

export async function undoCancelAction(input: { slug: string; establishmentId: string }): Promise<SpaceReservationsFeedback> {
  if (!UUID.test(input.establishmentId)) return { ok: false, message: es.reservationsSpace.errors.failed };
  try {
    await undoCancellation(await createClient(), input.establishmentId);
    refresh(input.slug);
    return { ok: true, message: es.reservationsSpace.running.undoDone };
  } catch (error) {
    return failure(error);
  }
}

/** Los datos de pago de Reservas (decisión 132): solo el propietario del espacio. */
export async function savePaymentDetailsAction(input: {
  slug: string;
  spaceId: string;
  iban: string;
  bizumPhone: string;
  note: string;
}): Promise<SpaceReservationsFeedback> {
  if (!UUID.test(input.spaceId)) return { ok: false, message: es.reservationsSpace.errors.failed };
  try {
    await savePaymentDetails(await createClient(), {
      spaceId: input.spaceId,
      iban: input.iban.trim() === "" ? null : input.iban,
      bizumPhone: input.bizumPhone.trim() === "" ? null : input.bizumPhone,
      note: input.note.trim() === "" ? null : input.note,
    });
    refresh(input.slug);
    return { ok: true, message: es.reservationsSpace.payment.saved };
  } catch (error) {
    return failure(error);
  }
}
