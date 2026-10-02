"use server";

import { revalidatePath } from "next/cache";

import { validateReservationInput } from "@/core/reservations/booking-input";
import type { ChangeReason, ReservationsChange } from "@/core/reservations/realtime";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import {
  bookReservation,
  cancelReservation,
  completeOnboarding,
  dismissDuplicate,
  loadDayReservations,
  loadSchedule,
  reservationCommand,
  saveSettings,
  saveShifts,
  setClosedDate,
  type CommandResult,
  type ReservationCommand,
  type ScheduleSaveResult,
  type SettingsInput,
  type ShiftInput,
} from "@/services/reservations-gateway";
import { broadcastChange } from "@/services/reservations-realtime";

import type { ActionFeedback, SaveReservationInput, SaveReservationResult, ScheduleFeedback } from "./action-state";

/**
 * Las acciones de la agenda de Reservas (Fase C). Ninguna autoriza nada: quién puede cada
 * cosa y si el estado lo permite lo deciden `book_reservation`, `cancel_reservation`,
 * `save_reservation_shifts`… (CLAUDE.md: ocultar un botón no es un control de acceso, y
 * llamar a esto directamente por URL tampoco le da permiso a nadie). Aquí se traduce lo
 * que contesta el servidor a un mensaje, y se avisa a las demás pantallas abiertas.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Los mensajes que escribe el propio servidor para una persona; el resto de errores técnicos no se enseñan. */
const BUSINESS_MESSAGE = /^(No tienes|Reserva no encontrada|Restaurante no encontrado|Este restaurante|Reservas no está|Hace falta|Falta |Las personas|Teléfono|Idioma|La nota|Turno no encontrado|Motivo de cancelación)/;

function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message.trim() : "";
  return BUSINESS_MESSAGE.test(text) ? text : es.agents.agenda.common.failed;
}

function rejectedMessage(reason: string, availableFrom?: string, platformName?: string): string {
  const t = es.agents.agenda.rejected;
  switch (reason) {
    case "not_yet_started":
      return t.not_yet_started(availableFrom ?? "");
    case "platform_locked":
      return t.platform_locked(platformName ?? "la plataforma");
    case "full":
    case "too_soon":
    case "too_far":
    case "closed_day":
    case "not_a_slot":
    case "service_paused":
    case "past_date":
    case "not_editable":
    case "invalid_time":
    case "invalid_transition":
    case "not_same_day":
      return t[reason];
    default:
      return es.agents.agenda.common.failed;
  }
}

/** Avisa a los dispositivos abiertos de que cambió una fecha (sin datos personales) y refresca las pantallas del servidor. */
async function announce(establishmentId: string, dates: readonly string[], reason: ChangeReason): Promise<void> {
  revalidatePath(`/agents/${establishmentId}`, "layout");
  const unique = [...new Set(dates.filter((d) => DATE.test(d)))];
  const changes: ReservationsChange[] = unique.map((date) => ({ kind: "date", date, reason }));
  await Promise.all(changes.map((change) => broadcastChange(establishmentId, change)));
}

/** Nueva reserva y Editar reserva (RES-02, RES-04). Valida, llama a `book_reservation` y traduce su resultado. */
export async function saveReservationAction(input: SaveReservationInput): Promise<SaveReservationResult> {
  const t = es.agents.agenda;
  if (!UUID.test(input.establishmentId) || (input.reservationId !== null && !UUID.test(input.reservationId))) {
    return { status: "error", message: t.common.failed, fields: {} };
  }
  const checked = validateReservationInput(input);
  if (!checked.ok) {
    const first = (["name", "contact", "phone", "email", "party", "date", "time", "notes"] as const).find((f) => checked.errors[f]);
    return { status: "error", message: first ? t.newReservation.errors[first] : t.common.failed, fields: checked.errors };
  }
  const v = checked.value;

  const supabase = await createClient();
  let result;
  try {
    result = await bookReservation(supabase, {
      establishmentId: input.establishmentId,
      reservationId: input.reservationId,
      date: v.date,
      time: v.time,
      partySize: v.partySize,
      customerName: v.name,
      phoneE164: v.phoneE164,
      email: v.email,
      notes: v.notes,
      language: v.language,
      force: input.force,
      idempotencyKey: input.reservationId === null && /^[\w-]{8,100}$/.test(input.idempotencyKey) ? input.idempotencyKey : null,
    });
  } catch (error) {
    return { status: "error", message: messageOf(error), fields: {} };
  }

  if (result.outcome === "needs_confirmation") {
    const schedule = await loadSchedule(supabase, input.establishmentId).catch(() => null);
    const shiftName = schedule?.shifts.find((s) => s.id === result.shiftId)?.name ?? "";
    return { status: "needs_confirmation", overflowBy: result.overflowBy, occupiedAfter: result.occupiedAfter, capacity: result.capacity, shiftName };
  }
  if (result.outcome === "rejected") {
    // El motivo va en el aviso de arriba: los campos marcados son solo los de la validación del formulario.
    return { status: "error", message: rejectedMessage(result.reason), fields: {} };
  }
  if (!result.unchanged && !result.replayed) {
    await announce(input.establishmentId, [v.date], input.reservationId === null ? "new" : "changed");
  }
  return { status: "done", reservationId: result.reservationId, date: v.date };
}

function feedback(result: CommandResult, okMessage: string | null = null, platformName?: string): ActionFeedback {
  if (result.outcome === "rejected") return { ok: false, message: rejectedMessage(result.reason, result.availableFrom, platformName) };
  return { ok: true, message: okMessage };
}

/** Confirmar, rechazar, «No vino», deshacer, «Hecho» de la plataforma y abrir la ficha. */
export async function reservationCommandAction(input: {
  establishmentId: string;
  reservationId: string;
  command: ReservationCommand;
  /** La fecha de la reserva, para avisar a las demás pantallas. */
  date: string;
}): Promise<ActionFeedback> {
  if (!UUID.test(input.establishmentId) || !UUID.test(input.reservationId)) {
    return { ok: false, message: es.agents.agenda.common.failed };
  }
  const supabase = await createClient();
  try {
    const result = await reservationCommand(supabase, input.command, input.establishmentId, input.reservationId);
    // Abrir la ficha no cambia nada que las demás pantallas tengan que volver a pedir.
    if (result.outcome === "done" && input.command !== "open") await announce(input.establishmentId, [input.date], "changed");
    return feedback(result);
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

/** Cancelar con motivo (RES-05). */
export async function cancelReservationAction(input: {
  establishmentId: string;
  reservationId: string;
  reason: string;
  date: string;
}): Promise<ActionFeedback> {
  if (!UUID.test(input.establishmentId) || !UUID.test(input.reservationId)) {
    return { ok: false, message: es.agents.agenda.common.failed };
  }
  const reason = input.reason === "customer" || input.reason === "error" ? input.reason : "other";
  const supabase = await createClient();
  try {
    const result = await cancelReservation(supabase, input.establishmentId, input.reservationId, reason);
    if (result.outcome === "done") await announce(input.establishmentId, [input.date], "changed");
    return feedback(result);
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

/** «No es duplicada» (RES-08). */
export async function dismissDuplicateAction(input: {
  establishmentId: string;
  reservationA: string;
  reservationB: string;
  date: string;
}): Promise<ActionFeedback> {
  if (![input.establishmentId, input.reservationA, input.reservationB].every((id) => UUID.test(id))) {
    return { ok: false, message: es.agents.agenda.common.failed };
  }
  const supabase = await createClient();
  try {
    const result = await dismissDuplicate(supabase, input.establishmentId, input.reservationA, input.reservationB);
    if (result.outcome === "done") await announce(input.establishmentId, [input.date], "changed");
    return feedback(result);
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

// ---------------------------------------------------------------------------
// Horarios y primer uso (RES-12, RES-13)
// ---------------------------------------------------------------------------

function scheduleFeedback(result: ScheduleSaveResult, closedDay = false): ScheduleFeedback {
  const t = es.agents.agenda;
  switch (result.outcome) {
    case "saved":
    case "unchanged":
      return { ok: true, message: t.hours.saved };
    case "blocked":
      return { ok: false, affected: result.affected, message: closedDay ? t.hours.blockedDay(result.affected) : t.hours.blocked(result.affected) };
    case "invalid": {
      const issues = t.hours.issues as Record<string, string>;
      return { ok: false, message: issues[result.issue] ?? t.common.failed };
    }
    case "rejected": {
      const issues = t.hours.issues as Record<string, string>;
      return { ok: false, message: issues[result.reason] ?? t.common.failed };
    }
  }
}

export async function saveShiftsAction(input: { establishmentId: string; shifts: readonly ShiftInput[] }): Promise<ScheduleFeedback> {
  if (!UUID.test(input.establishmentId)) return { ok: false, message: es.agents.agenda.common.failed };
  const supabase = await createClient();
  try {
    const result = await saveShifts(supabase, input.establishmentId, input.shifts);
    if (result.outcome === "saved") revalidatePath(`/agents/${input.establishmentId}`, "layout");
    return scheduleFeedback(result);
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

export async function setClosedDateAction(input: { establishmentId: string; date: string; reason: string; closed: boolean }): Promise<ScheduleFeedback> {
  if (!UUID.test(input.establishmentId) || !DATE.test(input.date)) return { ok: false, message: es.agents.agenda.common.failed };
  const supabase = await createClient();
  try {
    const result = await setClosedDate(supabase, input.establishmentId, input.date, input.closed ? input.reason.trim() : null, input.closed);
    if (result.outcome === "saved") revalidatePath(`/agents/${input.establishmentId}`, "layout");
    return scheduleFeedback(result, true);
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

export async function saveSettingsAction(input: { establishmentId: string; settings: SettingsInput }): Promise<ScheduleFeedback> {
  if (!UUID.test(input.establishmentId)) return { ok: false, message: es.agents.agenda.common.failed };
  const supabase = await createClient();
  try {
    const result = await saveSettings(supabase, input.establishmentId, input.settings);
    if (result.outcome === "saved") revalidatePath(`/agents/${input.establishmentId}`, "layout");
    return scheduleFeedback(result);
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

export async function completeOnboardingAction(input: { establishmentId: string }): Promise<ScheduleFeedback> {
  if (!UUID.test(input.establishmentId)) return { ok: false, message: es.agents.agenda.common.failed };
  const supabase = await createClient();
  try {
    const result = await completeOnboarding(supabase, input.establishmentId);
    if (result.outcome === "saved" || result.outcome === "unchanged") revalidatePath(`/agents/${input.establishmentId}`, "layout");
    return scheduleFeedback(result);
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

/**
 * Las plazas ocupadas de cada turno un día, para «Quedan X de Y plazas» de Nueva reserva
 * y Editar. Solo cuentas, nunca datos de comensales; la lectura la limita la RLS como
 * cualquier otra. `excludeReservationId` es la reserva que se está editando: no cuenta
 * contra sí misma.
 */
export async function dayOccupancyAction(input: {
  establishmentId: string;
  date: string;
  excludeReservationId: string | null;
}): Promise<{ readonly ok: true; readonly occupied: Readonly<Record<string, number>> } | { readonly ok: false }> {
  if (!UUID.test(input.establishmentId) || !DATE.test(input.date)) return { ok: false };
  const supabase = await createClient();
  try {
    const records = await loadDayReservations(supabase, input.establishmentId, input.date);
    const occupied: Record<string, number> = {};
    for (const r of records) {
      if (r.shiftId === null || r.id === input.excludeReservationId) continue;
      if (r.status !== "pending" && r.status !== "confirmed") continue;
      occupied[r.shiftId] = (occupied[r.shiftId] ?? 0) + r.partySize;
    }
    return { ok: true, occupied };
  } catch {
    return { ok: false };
  }
}
