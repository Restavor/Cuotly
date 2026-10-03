"use server";

import { revalidatePath } from "next/cache";

import { restaurantBase } from "@/core/reservations/agents-routes";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadDevice } from "@/services/agents/device";
import {
  acceptReservationTerms,
  loadServiceDates,
  requestCancellation,
  undoCancellation,
} from "@/services/agents/billing-gateway";

import type { BillingFeedback } from "./action-state";

/**
 * Las acciones del Propietario sobre su contrato de Reservas (Fase E; PRD de agents §4.4 y §6.12): aceptar
 * las condiciones, darse de baja y anular la baja. Ninguna autoriza nada: quién puede lo deciden
 * `accept_reservation_terms()`, `request_reservations_cancellation()` y `undo_reservations_cancellation()`.
 * Aquí se traduce lo que contestan a un mensaje.
 *
 * Son de una cuenta, nunca de la tablet del local (PRD §3.2: «Plan, pagos, darse de baja» no es del
 * Equipo ni de la tablet): se comprueba aquí aunque en ese navegador quede una sesión personal.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(error: unknown, accepting = false): BillingFeedback {
  const text = error instanceof Error ? error.message : "";
  if (/^(Solo el propietario|No tienes permiso|Solo el propietario del restaurante o Restavor)/i.test(text)) {
    return {
      ok: false,
      message: accepting ? es.agents.billing.conditions.noPermission : es.agents.billing.plan.noPermission,
    };
  }
  if (/no se puede dar de baja|no tiene la baja pedida/i.test(text)) return { ok: false, message: es.agents.billing.plan.notPossible };
  if (/periodo pagado ya acabó/i.test(text)) return { ok: false, message: es.agents.billing.plan.periodOver };
  return { ok: false, message: accepting ? es.agents.billing.conditions.failed : es.agents.billing.plan.failed };
}

async function refusedOnDevice(accepting = false): Promise<BillingFeedback | null> {
  if ((await loadDevice()).kind !== "active") return null;
  return { ok: false, message: accepting ? es.agents.billing.conditions.noPermission : es.agents.billing.plan.noPermission };
}

function refresh(establishmentId: string) {
  revalidatePath(restaurantBase(establishmentId), "layout");
}

/** El Propietario acepta las condiciones de Reservas (cuando la solicitud la creó el equipo en su nombre). */
export async function acceptConditionsAction(input: { establishmentId: string }): Promise<BillingFeedback> {
  if (!UUID.test(input.establishmentId)) return { ok: false, message: es.agents.billing.conditions.failed };
  const refused = await refusedOnDevice(true);
  if (refused) return refused;
  try {
    await acceptReservationTerms(await createClient(), input.establishmentId);
    refresh(input.establishmentId);
    return { ok: true, message: null };
  } catch (error) {
    return failure(error, true);
  }
}

/** Darse de baja: sigue hasta el final del periodo pagado. Repetirlo no cambia nada. */
export async function requestCancellationAction(input: { establishmentId: string }): Promise<BillingFeedback> {
  if (!UUID.test(input.establishmentId)) return { ok: false, message: es.agents.billing.plan.failed };
  const refused = await refusedOnDevice();
  if (refused) return refused;
  try {
    const client = await createClient();
    const endingAt = await requestCancellation(client, input.establishmentId);
    const dates = await loadServiceDates(client, input.establishmentId);
    refresh(input.establishmentId);
    // Sin la zona del restaurante no se pinta una fecha inventada: el mensaje lo dice sin ella.
    const date = dates
      ? enZona(endingAt, dates.timeZone, { day: "numeric", month: "long", year: "numeric" })
      : null;
    return { ok: true, message: date ? es.agents.billing.plan.cancelDone(date) : es.agents.billing.plan.statusEnding("el final del periodo pagado") };
  } catch (error) {
    return failure(error);
  }
}

/** Anular la baja, antes de que acabe el periodo pagado. */
export async function undoCancellationAction(input: { establishmentId: string }): Promise<BillingFeedback> {
  if (!UUID.test(input.establishmentId)) return { ok: false, message: es.agents.billing.plan.failed };
  const refused = await refusedOnDevice();
  if (refused) return refused;
  try {
    await undoCancellation(await createClient(), input.establishmentId);
    refresh(input.establishmentId);
    return { ok: true, message: es.agents.billing.plan.undoDone };
  } catch (error) {
    return failure(error);
  }
}
