/**
 * `src/core/reservations/lifecycle.ts` · las condiciones de cada transición de una
 * reserva (RN-RES-08, RN-RES-09; PRD de agents §6.1, §6.9, §6.10, §6.12).
 *
 * `types.ts` dice qué transiciones existen; aquí está cuándo se pueden hacer: "No vino"
 * solo cuando ya pasó la hora, deshacerlo solo el mismo día, el cliente cancela hasta
 * `hora − plazo`, y con las reservas en pausa se cancela, se confirma o rechaza y se
 * marca "No vino", pero no se cambia fecha, hora ni personas.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */
import { localDateTimeOf, localToUtc } from "./dates";
import type { LocalDate, LocalTime } from "./dates";
import { err, ok, type Result } from "../result";
import { isValidTransition } from "./types";
import type { ReservationStatus } from "./types";

export const CANCEL_REASONS = ["customer", "error", "other"] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export type TransitionError =
  | "invalid_transition"
  | "not_yet_started"
  | "not_same_day"
  | "invalid_time";

export interface LifecycleReservation {
  readonly status: ReservationStatus;
  readonly date: LocalDate;
  readonly time: LocalTime;
}

/** El instante en que empieza la reserva, o `undefined` si la hora local no existe. */
function startOf(r: LifecycleReservation, timeZone: string): Date | undefined {
  const start = localToUtc(r.date, r.time, timeZone);
  return start.ok ? start.value : undefined;
}

/**
 * "No vino" (RN-RES-09): solo una confirmada y solo cuando ya pasó la hora. Si todavía
 * no, el error lleva la hora desde la que se puede ("desde las 21:00").
 */
export function canMarkNoShow(
  r: LifecycleReservation,
  now: Date,
  timeZone: string,
): Result<true, { readonly error: TransitionError; readonly availableFrom?: LocalTime }> {
  if (!isValidTransition(r.status, "no_show") || r.status !== "confirmed") return err({ error: "invalid_transition" });
  const start = startOf(r, timeZone);
  if (!start) return err({ error: "invalid_time" });
  if (now.getTime() < start.getTime()) return err({ error: "not_yet_started", availableFrom: r.time });
  return ok(true);
}

/** Deshacer "No vino" (RN-RES-09): solo el mismo día, en la zona del restaurante. */
export function canUndoNoShow(r: LifecycleReservation, now: Date, timeZone: string): Result<true, { readonly error: TransitionError }> {
  if (r.status !== "no_show") return err({ error: "invalid_transition" });
  if (localDateTimeOf(now, timeZone).date !== r.date) return err({ error: "not_same_day" });
  return ok(true);
}

/** Cancelar o rechazar: desde pendiente o confirmada (RN-RES-08). Una cancelada es final. */
export function canCancel(status: ReservationStatus): boolean {
  return isValidTransition(status, "cancelled");
}

/** Confirmar un grupo pendiente (RN-RES-05). */
export function canConfirm(status: ReservationStatus): boolean {
  return status === "pending";
}

export type ServicePauseState = "paused" | "other";

/** ¿Se puede cambiar fecha, hora o personas? No con las reservas en pausa (§6.12). */
export function canChangeScheduling(serviceStatus: string): boolean {
  return serviceStatus !== "paused" && serviceStatus !== "closed";
}

/** ¿Se puede crear una reserva ahora? No en pausa ni cerrada (§6.12). Las plataformas son otra vía. */
export function canCreateReservations(serviceStatus: string): boolean {
  return serviceStatus !== "paused" && serviceStatus !== "closed";
}

/**
 * El cliente cancela desde su enlace hasta `hora − plazo` (RN-RES-08; plazo por
 * defecto 120 minutos). Devuelve el último instante en que puede hacerlo.
 */
export function customerCancelDeadline(r: LifecycleReservation, limitMinutes: number, timeZone: string): Date | undefined {
  const start = startOf(r, timeZone);
  return start ? new Date(start.getTime() - limitMinutes * 60_000) : undefined;
}

export function canCustomerCancel(r: LifecycleReservation, limitMinutes: number, now: Date, timeZone: string): boolean {
  if (!canCancel(r.status)) return false;
  const deadline = customerCancelDeadline(r, limitMinutes, timeZone);
  return deadline !== undefined && now.getTime() <= deadline.getTime();
}

// ---------------------------------------------------------------------------
// "Ha venido N veces · ha fallado M veces" (RN-RES-09, §6.10)
// ---------------------------------------------------------------------------

export interface VisitRecord {
  readonly id: string;
  readonly status: ReservationStatus;
  readonly startsAt: Date;
}

export const VISIT_HISTORY_MONTHS = 24;

/**
 * Por teléfono y en ese restaurante, últimos 24 meses y sin contar la reserva abierta:
 * `came` = confirmadas cuya hora ya pasó (se entiende que vinieron: nadie marcó "No
 * vino"); `failed` = marcadas "No vino". Las canceladas y las pendientes no cuentan.
 */
export function visitStats(history: readonly VisitRecord[], currentId: string, now: Date): { readonly came: number; readonly failed: number } {
  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - VISIT_HISTORY_MONTHS);
  let came = 0;
  let failed = 0;
  for (const h of history) {
    if (h.id === currentId || h.startsAt < since) continue;
    if (h.status === "no_show") failed += 1;
    else if (h.status === "confirmed" && h.startsAt <= now) came += 1;
  }
  return { came, failed };
}
