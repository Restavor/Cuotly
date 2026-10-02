/**
 * `src/services/reservations-gateway.ts` — la mitad de Supabase de la agenda de Reservas
 * (Fase C de Restavor agents; PRD §6 y §11.1; migración 169).
 *
 * Aquí no se decide nada: si una reserva cabe, si "No vino" ya se puede, si un horario se
 * puede guardar, lo dicen las funciones `book_reservation`, `mark_no_show`,
 * `save_reservation_shifts`… (que repiten en SQL lo que `src/core/reservations/` prueba).
 * Esto solo traduce lo que devuelven a tipos de dominio, y los resultados de negocio
 * siguen siendo resultados —`accepted`, `needs_confirmation`, `rejected`— y no excepciones.
 *
 * Toda lectura enumera sus columnas: `reservations` y las demás tablas de Reservas tienen
 * privilegios de columna, y `select *` devuelve 403 (CLAUDE.md).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BookingRejectionReason } from "@/core/reservations/booking";
import type { LocalDate, LocalTime } from "@/core/reservations/dates";
import type { Shift, SlotInterval } from "@/core/reservations/shifts";
import {
  RESERVATION_ORIGINS,
  RESERVATION_STATUSES,
  type ReservationOrigin,
  type ReservationStatus,
} from "@/core/reservations/types";
import type { Database, Json } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;
type Functions = Database["public"]["Functions"];

async function rpc<F extends keyof Functions>(
  client: Client,
  fn: F,
  args: Functions[F]["Args"],
): Promise<Functions[F]["Returns"]> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as Functions[F]["Returns"];
}

/** "21:00:00" de PostgreSQL → "21:00". */
function hhmm(time: string): LocalTime {
  return time.slice(0, 5);
}

function isOrigin(value: string): value is ReservationOrigin {
  return (RESERVATION_ORIGINS as readonly string[]).includes(value);
}

function isStatus(value: string): value is ReservationStatus {
  return (RESERVATION_STATUSES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// La reserva tal como se enseña
// ---------------------------------------------------------------------------

export interface ReservationRecord {
  readonly id: string;
  readonly shiftId: string | null;
  readonly date: LocalDate;
  readonly time: LocalTime;
  readonly startsAt: Date;
  readonly partySize: number;
  readonly customerName: string;
  readonly phoneE164: string | null;
  readonly email: string | null;
  readonly notes: string | null;
  readonly language: "es" | "en";
  readonly status: ReservationStatus;
  readonly source: ReservationOrigin;
  readonly platformName: string | null;
  readonly isNew: boolean;
  readonly duplicate: boolean;
  readonly cancelReason: string | null;
  readonly cancelledAt: Date | null;
  readonly pendingPlatformCancel: boolean;
}

/** Las columnas con privilegio de `reservations` que usa la agenda. Sin `cancel_token` ni `created_by_user_id`. */
const RESERVATION_COLUMNS =
  "id, shift_id, date, time, starts_at, party_size, customer_name, phone_e164, email, notes, language, status, source, platform_name, is_new, duplicate_flag, cancel_reason, cancelled_at, pending_platform_cancel";

type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];

function toRecord(row: Pick<ReservationRow, "id" | "shift_id" | "date" | "time" | "starts_at" | "party_size" | "customer_name" | "phone_e164" | "email" | "notes" | "language" | "status" | "source" | "platform_name" | "is_new" | "duplicate_flag" | "cancel_reason" | "cancelled_at" | "pending_platform_cancel">): ReservationRecord | null {
  // Un estado u origen que el dominio no conoce no se inventa: la fila no se enseña.
  if (!isStatus(row.status) || !isOrigin(row.source)) return null;
  return {
    id: row.id,
    shiftId: row.shift_id,
    date: row.date,
    time: hhmm(row.time),
    startsAt: new Date(row.starts_at),
    partySize: row.party_size,
    customerName: row.customer_name,
    phoneE164: row.phone_e164,
    email: row.email,
    notes: row.notes,
    language: row.language === "en" ? "en" : "es",
    status: row.status,
    source: row.source,
    platformName: row.platform_name,
    isNew: row.is_new,
    duplicate: row.duplicate_flag === "possible",
    cancelReason: row.cancel_reason,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
    pendingPlatformCancel: row.pending_platform_cancel,
  };
}

function records(rows: readonly Parameters<typeof toRecord>[0][] | null): readonly ReservationRecord[] {
  return (rows ?? []).map(toRecord).filter((r): r is ReservationRecord => r !== null);
}

/** Las reservas de un día, por hora (RES-01). Un restaurante no pasa de unos cientos por día. */
export async function loadDayReservations(client: Client, establishmentId: string, date: LocalDate): Promise<readonly ReservationRecord[]> {
  const { data, error } = await client
    .from("reservations")
    .select(RESERVATION_COLUMNS)
    .eq("establishment_id", establishmentId)
    .eq("date", date)
    .order("time", { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  return records(data);
}

export async function loadReservation(client: Client, establishmentId: string, reservationId: string): Promise<ReservationRecord | null> {
  const { data, error } = await client
    .from("reservations")
    .select(RESERVATION_COLUMNS)
    .eq("establishment_id", establishmentId)
    .eq("id", reservationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toRecord(data) : null;
}

/** Los grupos pendientes de hoy en adelante: cuántos y cuál es el primero (RES-01, «Revisar»). */
export async function loadPendingGroups(
  client: Client,
  establishmentId: string,
  fromDate: LocalDate,
): Promise<{ readonly count: number; readonly first: { readonly id: string; readonly date: LocalDate; readonly time: LocalTime } | null }> {
  const { data, count, error } = await client
    .from("reservations")
    .select("id, date, time", { count: "exact" })
    .eq("establishment_id", establishmentId)
    .eq("status", "pending")
    .gte("date", fromDate)
    .order("date", { ascending: true })
    .order("time", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  const first = data?.[0];
  return { count: count ?? 0, first: first ? { id: first.id, date: first.date, time: hhmm(first.time) } : null };
}

/** Lo que hay en la base de datos del restaurante para pintar su agenda: ajustes, turnos y días cerrados. */
export interface RestaurantSchedule {
  readonly timeZone: string;
  readonly slotInterval: SlotInterval;
  readonly largeGroupThreshold: number;
  readonly minNoticeMinutes: number;
  readonly maxAdvanceDays: number;
  readonly customerCancelLimitMinutes: number;
  readonly serviceStatus: string;
  readonly endingAt: string | null;
  readonly onboardingCompletedAt: string | null;
  readonly localPhone: string | null;
  readonly shifts: readonly Shift[];
  readonly closedDates: readonly { readonly date: LocalDate; readonly reason: string }[];
}

export async function loadSchedule(client: Client, establishmentId: string): Promise<RestaurantSchedule | null> {
  const [settings, shifts, closed] = await Promise.all([
    client
      .from("reservation_settings")
      .select(
        "timezone, slot_interval_minutes, large_group_threshold, min_notice_minutes, max_advance_days, customer_cancel_limit_minutes, service_status, ending_at, onboarding_completed_at, local_phone_e164",
      )
      .eq("establishment_id", establishmentId)
      .maybeSingle(),
    client
      .from("reservation_shifts")
      .select("id, name, weekdays, start_time, end_time, last_booking_time, capacity, active, sort_order")
      .eq("establishment_id", establishmentId)
      .order("sort_order", { ascending: true })
      .order("start_time", { ascending: true }),
    client
      .from("reservation_closed_dates")
      .select("date, reason")
      .eq("establishment_id", establishmentId)
      // Reabrir un día no borra su fila: la marca como quitada (CLAUDE.md: nunca se borra un registro de negocio).
      .is("removed_at", null)
      .order("date", { ascending: true }),
  ]);
  if (settings.error) throw new Error(settings.error.message);
  if (shifts.error) throw new Error(shifts.error.message);
  if (closed.error) throw new Error(closed.error.message);
  const s = settings.data;
  if (!s) return null;
  return {
    timeZone: s.timezone,
    slotInterval: s.slot_interval_minutes === 15 ? 15 : 30,
    largeGroupThreshold: s.large_group_threshold,
    minNoticeMinutes: s.min_notice_minutes,
    maxAdvanceDays: s.max_advance_days,
    customerCancelLimitMinutes: s.customer_cancel_limit_minutes,
    serviceStatus: s.service_status,
    endingAt: s.ending_at,
    onboardingCompletedAt: s.onboarding_completed_at,
    localPhone: s.local_phone_e164,
    shifts: (shifts.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      weekdays: row.weekdays,
      startTime: hhmm(row.start_time),
      endTime: hhmm(row.end_time),
      lastBookingTime: hhmm(row.last_booking_time),
      capacity: row.capacity,
      active: row.active,
    })),
    closedDates: (closed.data ?? []).map((row) => ({ date: row.date, reason: row.reason ?? "" })),
  };
}

/** El estado del agente para el indicador de Hoy: lo lee, no lo cambia (encender y apagar es de la Fase G). */
export type AgentIndicator =
  | { readonly state: "none" }
  | { readonly state: "on" }
  | { readonly state: "off"; readonly until: Date | null };

export async function loadAgentIndicator(client: Client, establishmentId: string): Promise<AgentIndicator> {
  const { data, error } = await client
    .from("agent_state")
    .select("manual_state, off_until")
    .eq("establishment_id", establishmentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { state: "none" };
  if (data.manual_state === "off") {
    // Un apagado con hora que ya pasó es un encendido: lo enciende la tarea de la Fase G, pero no se enseña el pasado.
    const until = data.off_until ? new Date(data.off_until) : null;
    if (until !== null && until.getTime() <= Date.now()) return { state: "on" };
    return { state: "off", until };
  }
  return { state: "on" };
}

// ---------------------------------------------------------------------------
// Ficha: historial, visitas y posibles duplicadas
// ---------------------------------------------------------------------------

export interface HistoryEvent {
  readonly id: string;
  readonly type: string;
  readonly actorType: string;
  readonly actorName: string | null;
  readonly data: Record<string, Json | undefined>;
  readonly createdAt: Date;
}

export async function loadHistory(client: Client, establishmentId: string, reservationId: string): Promise<readonly HistoryEvent[]> {
  const rows = await rpc(client, "reservation_history", { p_establishment_id: establishmentId, p_reservation_id: reservationId });
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    actorType: row.actor_type,
    actorName: row.actor_name,
    data: row.data !== null && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {},
    createdAt: new Date(row.created_at),
  }));
}

/** El historial de un teléfono en este restaurante, para «Ha venido N veces · ha fallado M veces» (RN-RES-09). */
export async function loadVisitHistory(
  client: Client,
  establishmentId: string,
  phoneE164: string,
  since: Date,
): Promise<readonly { readonly id: string; readonly status: ReservationStatus; readonly startsAt: Date }[]> {
  const { data, error } = await client
    .from("reservations")
    .select("id, status, starts_at")
    .eq("establishment_id", establishmentId)
    .eq("phone_e164", phoneE164)
    .gte("starts_at", since.toISOString())
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row): row is typeof row & { status: ReservationStatus } => isStatus(row.status))
    .map((row) => ({ id: row.id, status: row.status, startsAt: new Date(row.starts_at) }));
}

/** Con quién forma pareja una reserva marcada como posible duplicada (mismo día y mismo teléfono, sin descartar). */
export async function loadDuplicatePartners(client: Client, establishmentId: string, reservation: ReservationRecord): Promise<readonly ReservationRecord[]> {
  if (!reservation.duplicate || reservation.phoneE164 === null) return [];
  const { data, error } = await client
    .from("reservations")
    .select(RESERVATION_COLUMNS)
    .eq("establishment_id", establishmentId)
    .eq("date", reservation.date)
    .eq("phone_e164", reservation.phoneE164)
    .in("status", ["pending", "confirmed"])
    .neq("id", reservation.id)
    .limit(20);
  if (error) throw new Error(error.message);
  return records(data).filter((r) => r.duplicate);
}

// ---------------------------------------------------------------------------
// Buscar y calendario
// ---------------------------------------------------------------------------

export async function searchReservationRows(client: Client, establishmentId: string, query: string): Promise<readonly ReservationRecordLite[]> {
  const rows = await rpc(client, "reservations_search", { p_establishment_id: establishmentId, p_query: query });
  return rows
    .filter((row) => isStatus(row.status) && isOrigin(row.source))
    .map((row) => ({
      id: row.id,
      date: row.date,
      time: hhmm(row.time),
      customerName: row.customer_name,
      phoneE164: row.phone_e164,
      partySize: row.party_size,
      status: row.status as ReservationStatus,
      source: row.source as ReservationOrigin,
      platformName: row.platform_name,
      duplicate: row.duplicate_flag === "possible",
    }));
}

/** Lo que devuelve la búsqueda: lo justo para una fila de resultados. */
export interface ReservationRecordLite {
  readonly id: string;
  readonly date: LocalDate;
  readonly time: LocalTime;
  readonly customerName: string;
  readonly phoneE164: string | null;
  readonly partySize: number;
  readonly status: ReservationStatus;
  readonly source: ReservationOrigin;
  readonly platformName: string | null;
  readonly duplicate: boolean;
}

export async function loadCalendarRows(client: Client, establishmentId: string, month: string) {
  const rows = await rpc(client, "reservations_calendar", { p_establishment_id: establishmentId, p_month: `${month}-01` });
  return rows
    .filter((row) => isStatus(row.status) && isOrigin(row.source))
    .map((row) => ({
      date: row.date,
      status: row.status as ReservationStatus,
      source: row.source as ReservationOrigin,
      reservations: row.reservations,
      people: row.people,
    }));
}

// ---------------------------------------------------------------------------
// Escribir: resultados de negocio como resultados
// ---------------------------------------------------------------------------

export interface BookInput {
  readonly establishmentId: string;
  /** `null` = alta; con id, edición. */
  readonly reservationId: string | null;
  readonly date: LocalDate;
  readonly time: LocalTime;
  readonly partySize: number;
  readonly customerName: string;
  readonly phoneE164: string | null;
  readonly email: string | null;
  readonly notes: string | null;
  readonly language: "es" | "en";
  /** El usuario ha aceptado el aviso de aforo. */
  readonly force?: boolean;
  readonly idempotencyKey?: string | null;
}

export type BookResult =
  | {
      readonly outcome: "accepted";
      readonly reservationId: string;
      readonly status: ReservationStatus;
      readonly shiftId: string | null;
      readonly outOfShift: boolean;
      readonly overCapacityBy: number;
      readonly replayed: boolean;
      readonly unchanged: boolean;
    }
  | {
      readonly outcome: "needs_confirmation";
      readonly shiftId: string;
      readonly overflowBy: number;
      readonly occupiedAfter: number;
      readonly capacity: number;
    }
  | { readonly outcome: "rejected"; readonly reason: BookingRejectionReason };

type JsonObject = { [key: string]: Json | undefined };

function asObject(value: Json): JsonObject {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) return value;
  throw new Error("Respuesta inesperada del servidor");
}

function str(o: JsonObject, key: string): string | null {
  const v = o[key];
  return typeof v === "string" ? v : null;
}

function num(o: JsonObject, key: string): number {
  const v = o[key];
  return typeof v === "number" ? v : 0;
}

function bool(o: JsonObject, key: string): boolean {
  return o[key] === true;
}

export async function bookReservation(client: Client, input: BookInput): Promise<BookResult> {
  const raw = asObject(
    await rpc(client, "book_reservation", {
      p_establishment_id: input.establishmentId,
      p_reservation_id: input.reservationId,
      p_date: input.date,
      p_time: input.time,
      p_party_size: input.partySize,
      p_customer_name: input.customerName,
      p_phone_e164: input.phoneE164,
      p_email: input.email,
      p_notes: input.notes,
      p_language: input.language,
      p_force: input.force ?? false,
      p_idempotency_key: input.idempotencyKey ?? null,
    }),
  );
  const outcome = str(raw, "outcome");
  if (outcome === "accepted") {
    const status = str(raw, "status");
    return {
      outcome,
      reservationId: str(raw, "reservation_id") ?? "",
      status: status !== null && isStatus(status) ? status : "confirmed",
      shiftId: str(raw, "shift_id"),
      outOfShift: bool(raw, "out_of_shift"),
      overCapacityBy: num(raw, "over_capacity_by"),
      replayed: bool(raw, "replayed"),
      unchanged: bool(raw, "unchanged"),
    };
  }
  if (outcome === "needs_confirmation") {
    return {
      outcome,
      shiftId: str(raw, "shift_id") ?? "",
      overflowBy: num(raw, "overflow_by"),
      occupiedAfter: num(raw, "occupied_after"),
      capacity: num(raw, "capacity"),
    };
  }
  return { outcome: "rejected", reason: (str(raw, "reason") ?? "not_a_slot") as BookingRejectionReason };
}

export type CommandResult =
  | { readonly outcome: "done" | "unchanged"; readonly pendingPlatformCancel?: boolean }
  | { readonly outcome: "rejected"; readonly reason: string; readonly availableFrom?: LocalTime };

function toCommandResult(value: Json): CommandResult {
  const raw = asObject(value);
  const outcome = str(raw, "outcome");
  if (outcome === "done" || outcome === "unchanged") {
    return { outcome, ...(raw.pending_platform_cancel === true ? { pendingPlatformCancel: true } : {}) };
  }
  const from = str(raw, "available_from");
  return { outcome: "rejected", reason: str(raw, "reason") ?? "invalid_transition", ...(from ? { availableFrom: from } : {}) };
}

export type ReservationCommand = "confirm" | "reject" | "no_show" | "undo_no_show" | "platform_cancel_done" | "open";

/** Las órdenes de una reserva que no llevan más datos que el restaurante y la reserva. */
export async function reservationCommand(
  client: Client,
  command: ReservationCommand,
  establishmentId: string,
  reservationId: string,
): Promise<CommandResult> {
  const args = { p_establishment_id: establishmentId, p_reservation_id: reservationId };
  switch (command) {
    case "confirm":
      return toCommandResult(await rpc(client, "confirm_reservation", args));
    case "reject":
      return toCommandResult(await rpc(client, "reject_reservation", args));
    case "no_show":
      return toCommandResult(await rpc(client, "mark_no_show", args));
    case "undo_no_show":
      return toCommandResult(await rpc(client, "undo_no_show", args));
    case "platform_cancel_done":
      return toCommandResult(await rpc(client, "mark_platform_cancel_done", args));
    case "open":
      return toCommandResult(await rpc(client, "open_reservation", args));
  }
}

export async function cancelReservation(
  client: Client,
  establishmentId: string,
  reservationId: string,
  reason: "customer" | "error" | "other",
): Promise<CommandResult> {
  return toCommandResult(
    await rpc(client, "cancel_reservation", { p_establishment_id: establishmentId, p_reservation_id: reservationId, p_reason: reason }),
  );
}

export async function dismissDuplicate(client: Client, establishmentId: string, a: string, b: string): Promise<CommandResult> {
  return toCommandResult(await rpc(client, "dismiss_duplicate", { p_establishment_id: establishmentId, p_reservation_a: a, p_reservation_b: b }));
}

// --- Horarios -------------------------------------------------------------

export type ScheduleSaveResult =
  | { readonly outcome: "saved" | "unchanged"; readonly shiftIds?: readonly string[] }
  | { readonly outcome: "blocked"; readonly affected: number }
  | { readonly outcome: "invalid"; readonly issue: string }
  | { readonly outcome: "rejected"; readonly reason: string };

function toScheduleResult(value: Json): ScheduleSaveResult {
  const raw = asObject(value);
  const outcome = str(raw, "outcome");
  if (outcome === "saved" || outcome === "unchanged") {
    // Al guardar horarios la base de datos devuelve los identificadores de los turnos, en el orden enviado.
    const ids = Array.isArray(raw.shift_ids) ? raw.shift_ids.filter((id): id is string => typeof id === "string") : undefined;
    return ids ? { outcome, shiftIds: ids } : { outcome };
  }
  if (outcome === "blocked") return { outcome, affected: num(raw, "affected") };
  if (outcome === "invalid") return { outcome, issue: str(raw, "issue") ?? "invalid" };
  return { outcome: "rejected", reason: str(raw, "reason") ?? "rejected" };
}

export interface ShiftInput {
  readonly id?: string;
  readonly name: string;
  readonly weekdays: readonly number[];
  readonly startTime: LocalTime;
  readonly lastBookingTime: LocalTime;
  readonly endTime: LocalTime;
  readonly capacity: number;
  readonly active: boolean;
}

export async function saveShifts(client: Client, establishmentId: string, shifts: readonly ShiftInput[]): Promise<ScheduleSaveResult> {
  const payload: Json = shifts.map((s) => ({
    ...(s.id ? { id: s.id } : {}),
    name: s.name,
    weekdays: [...s.weekdays],
    start_time: s.startTime,
    last_booking_time: s.lastBookingTime,
    end_time: s.endTime,
    capacity: s.capacity,
    active: s.active,
  }));
  return toScheduleResult(await rpc(client, "save_reservation_shifts", { p_establishment_id: establishmentId, p_shifts: payload }));
}

export async function setClosedDate(
  client: Client,
  establishmentId: string,
  date: LocalDate,
  reason: string | null,
  closed: boolean,
): Promise<ScheduleSaveResult> {
  return toScheduleResult(await rpc(client, "set_reservation_closed_date", { p_establishment_id: establishmentId, p_date: date, p_reason: reason, p_closed: closed }));
}

export interface SettingsInput {
  readonly slotInterval: number;
  readonly largeGroupThreshold: number;
  readonly minNoticeMinutes: number;
  readonly maxAdvanceDays: number;
  readonly customerCancelLimitMinutes: number;
}

export async function saveSettings(client: Client, establishmentId: string, input: SettingsInput): Promise<ScheduleSaveResult> {
  return toScheduleResult(
    await rpc(client, "save_reservation_settings", {
      p_establishment_id: establishmentId,
      p_slot_interval_minutes: input.slotInterval,
      p_large_group_threshold: input.largeGroupThreshold,
      p_min_notice_minutes: input.minNoticeMinutes,
      p_max_advance_days: input.maxAdvanceDays,
      p_customer_cancel_limit_minutes: input.customerCancelLimitMinutes,
    }),
  );
}

export async function completeOnboarding(client: Client, establishmentId: string): Promise<ScheduleSaveResult> {
  return toScheduleResult(await rpc(client, "complete_reservations_onboarding", { p_establishment_id: establishmentId }));
}
