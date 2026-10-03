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

// ---------------------------------------------------------------------------
// El ciclo de vida del servicio Reservas (RN-RES-11, D-D; PRD de agents §6.12)
//
// Los mismos números que `reservations_lifecycle_sweep()` (migración 174): 7 días de
// margen desde el vencimiento más antiguo, pausa, baja hasta el final del periodo
// pagado, 30 días de descarga y anonimización. La base de datos es la autoridad; esto
// es lo que las pantallas enseñan («quedan N días») y lo que el test compara con ella.
// ---------------------------------------------------------------------------

/** Días de margen entre el vencimiento más antiguo sin pagar y la pausa (`reservation_settings.grace_days`). */
export const RESERVATIONS_GRACE_DAYS = 7;
/** Días que Reservas cerrada se conserva para descargar antes de anonimizar. */
export const RESERVATIONS_PURGE_AFTER_DAYS = 30;
/** El recordatorio de descarga sale esta cantidad de días antes del borrado. */
export const RESERVATIONS_PURGE_REMINDER_DAYS = 7;
/** El aviso de «vence el <fecha>» sale esta cantidad de días antes del vencimiento (decisión 133). */
export const RESERVATIONS_PAYMENT_NOTICE_DAYS = 5;
/** El segundo aviso de «Pago pendiente» sale esta cantidad de días antes de acabar el margen. */
export const RESERVATIONS_GRACE_NOTICE_DAYS = 2;

const DAY_MS = 86_400_000;

/** El instante en que acaba el margen y Reservas pasa a pausa. */
export function graceDeadline(overdueSince: Date, graceDays: number = RESERVATIONS_GRACE_DAYS): Date {
  return new Date(overdueSince.getTime() + graceDays * DAY_MS);
}

/** «Pago pendiente, quedan N días»: días enteros que quedan de margen, nunca menos de 0. */
export function daysLeftOfGrace(overdueSince: Date, now: Date, graceDays: number = RESERVATIONS_GRACE_DAYS): number {
  const left = graceDeadline(overdueSince, graceDays).getTime() - now.getTime();
  return left <= 0 ? 0 : Math.ceil(left / DAY_MS);
}

/** El día en que se anonimizan los datos de una Reservas cerrada. */
export function purgeDate(closedAt: Date): Date {
  return new Date(closedAt.getTime() + RESERVATIONS_PURGE_AFTER_DAYS * DAY_MS);
}

/** Días enteros que quedan para descargar las reservas de una Reservas cerrada, nunca menos de 0. */
export function daysLeftToDownload(closedAt: Date, now: Date): number {
  const left = purgeDate(closedAt).getTime() - now.getTime();
  return left <= 0 ? 0 : Math.ceil(left / DAY_MS);
}

export interface ServiceLifecycleState {
  readonly status: string;
  /** Desde cuándo está vencido el cobro de Reservas más antiguo con deuda, o `null`. */
  readonly overdueSince: Date | null;
  readonly endingAt: Date | null;
  readonly closedAt: Date | null;
  readonly dataPurged: boolean;
  readonly graceDays?: number;
}

export type SweepOutcome =
  | { readonly status: "active" | "past_due" | "paused" | "ending" | "closed" | "approved_pending_payment"; readonly purge: boolean };

/**
 * Lo que decide el barrido diario para un restaurante, en una pasada y en el mismo orden
 * que en SQL (`active → past_due`, `past_due → paused`, `ending → closed`, y a los 30 días
 * del cierre, anonimizar). `approved_pending_payment` no se barre: espera su primer pago.
 */
export function sweepOutcome(s: ServiceLifecycleState, now: Date): SweepOutcome {
  let status = s.status as SweepOutcome["status"];
  if (status === "approved_pending_payment") return { status, purge: false };

  if (status === "active" && s.overdueSince !== null) status = "past_due";
  if (status === "past_due" && s.overdueSince === null) status = "active";
  if (status === "past_due" && s.overdueSince !== null) {
    if (now.getTime() >= graceDeadline(s.overdueSince, s.graceDays).getTime()) status = "paused";
  }
  if (status === "ending" && s.endingAt !== null && now.getTime() >= s.endingAt.getTime()) status = "closed";

  const closedAt = status === "closed" && s.status !== "closed" ? now : s.closedAt;
  const purge =
    status === "closed" && !s.dataPurged && closedAt !== null && now.getTime() >= purgeDate(closedAt).getTime();
  return { status, purge };
}

/** Darse de baja: desde activa, con pago pendiente o en pausa (§6.12). */
export function canRequestCancellation(status: string): boolean {
  return status === "active" || status === "past_due" || status === "paused";
}

/** «Anular la baja»: solo en `ending` y antes de que acabe el periodo pagado. */
export function canUndoCancellation(status: string, endingAt: Date | null, now: Date): boolean {
  return status === "ending" && (endingAt === null || endingAt.getTime() > now.getTime());
}

/** Restavor cierra a mano solo desde la pausa. */
export function canCloseByHand(status: string): boolean {
  return status === "paused";
}

/** Restavor reactiva una Reservas cerrada solo durante los 30 días y antes del borrado. */
export function canReactivateClosed(status: string, closedAt: Date | null, dataPurged: boolean, now: Date): boolean {
  return status === "closed" && !dataPurged && closedAt !== null && now.getTime() < purgeDate(closedAt).getTime();
}

/** «Pago pendiente, quedan N días» se enseña solo en `past_due` y solo al Propietario (§6.12). */
export function showsPaymentBar(status: string): boolean {
  return status === "past_due";
}

/** El texto de Hoy «Reservas en pausa»: solo con el servicio en pausa. */
export function showsPausedBar(status: string): boolean {
  return status === "paused";
}

/** La hora (de Madrid) a la que corre el barrido diario del ciclo de vida (PRD §10.6: 08:00). */
export const LIFECYCLE_SWEEP_HOUR = 8;

/**
 * `pg_cron` va en UTC y lanza la tarea cada hora; solo a las 08:00 de Madrid (con el cambio de hora de verano e
 * invierno) la ruta hace el barrido. La zona la pone quien llama (la de Restavor como plataforma, `CUOTLY_TIMEZONE`):
 * el dominio no escribe ninguna. Idempotente: lanzarla de más no daña.
 */
export function isLifecycleSweepHour(now: Date, timeZone: string): boolean {
  return localDateTimeOf(now, timeZone).time.startsWith(`${String(LIFECYCLE_SWEEP_HOUR).padStart(2, "0")}:`);
}
