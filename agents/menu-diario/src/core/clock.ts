/**
 * `src/core/clock.ts` · RA-08, el agente siempre sabe qué día y hora es (decisión 158 de Bosco, 03/10/2026).
 *
 * Al empezar cada ejecución el robot lee la hora del ordenador en UTC, la pasa a la zona del espacio y la deja escrita
 * en su registro y en cada decisión. La contrasta con la hora que devuelve Supabase en cada respuesta: si difieren
 * más de 5 minutos (cifra propuesta por Claude y aceptada por Bosco) se para y avisa en lugar de decidir con un reloj
 * dudoso. Aquí vive la parte pura; leer la hora del ordenador y de Supabase es de `src/services` (Fase 1.4).
 *
 * El texto que lee Bosco («Hoy es sábado 3 de octubre de 2026, 18:42…») se arma en `src/i18n/es.ts`.
 */
import {
  isoWeekday,
  localDateTimeOf,
  tryLocalDateOf,
  utcOffsetMinutes,
  type LocalDate,
  type LocalTime,
  type TimeInputError,
} from "./local-time.ts";
import { err, ok, type Result } from "./result.ts";

/** Diferencia máxima tolerada entre el reloj del ordenador y el de Supabase (decisión 158). */
export const DEFAULT_MAX_CLOCK_SKEW_MS = 5 * 60_000;

export type LocalClock = {
  timeZone: string;
  date: LocalDate;
  time: LocalTime;
  /** 1 = lunes … 7 = domingo. */
  isoWeekday: number;
  /** Hora local menos UTC, en minutos (120 en horario de verano de Madrid). */
  utcOffsetMinutes: number;
};

/** Qué día y hora es ahora mismo en la zona del espacio. */
export function localClock(now: Date, timeZone: string): Result<LocalClock, TimeInputError> {
  const today = tryLocalDateOf(now, timeZone);
  if (!today.ok) return err(today.error);
  const { date, time } = localDateTimeOf(now, timeZone);
  return ok({ timeZone, date, time, isoWeekday: isoWeekday(date), utcOffsetMinutes: utcOffsetMinutes(now, timeZone) });
}

export type ClockSkewError = { code: "invalid_clock" } | { code: "clock_skew"; skewMs: number };

/**
 * Compara el reloj del ordenador con el del servidor. `skewMs` es positivo si el ordenador va adelantado.
 * Hasta el máximo (incluido) se acepta; por encima, error `clock_skew`.
 */
export function checkClockSkew(
  localNow: Date,
  serverNow: Date,
  maxSkewMs: number = DEFAULT_MAX_CLOCK_SKEW_MS,
): Result<{ skewMs: number }, ClockSkewError> {
  const skewMs = localNow.getTime() - serverNow.getTime();
  if (Number.isNaN(skewMs) || !Number.isFinite(maxSkewMs) || maxSkewMs < 0) return err({ code: "invalid_clock" });
  if (Math.abs(skewMs) > maxSkewMs) return err({ code: "clock_skew", skewMs });
  return ok({ skewMs });
}
