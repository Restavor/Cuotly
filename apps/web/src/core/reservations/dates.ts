/**
 * `src/core/reservations/dates.ts` · fechas y horas de una reserva en la zona del
 * restaurante (RN-RES-01; PRD de agents §8.2, §8.4 y §9).
 *
 * Una reserva se guarda con su fecha y su hora LOCALES ("2026-09-26", "21:00") y con
 * `starts_at`, el instante en UTC (`timestamptz`). Lo difícil son los dos domingos del
 * año en los que la hora cambia: en Europe/Madrid el 29/03/2026 las 02:00 saltan a
 * las 03:00 (la hora 02:30 NO existe) y el 25/10/2026 las 03:00 vuelven a las 02:00
 * (la hora 02:30 ocurre DOS veces). Aquí se decide qué se hace en cada caso y se
 * prueba, en vez de dejarlo a lo que haga `Date`.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React. El cálculo de zona
 * reutiliza `zonedTimeToUtc` de `business-clock.ts` (RN-CLK-06): no se duplica.
 */
import { zonedTimeToUtc } from "../business-clock";
import { err, ok, type Result } from "../result";

/** "YYYY-MM-DD", en la zona del restaurante. */
export type LocalDate = string;
/** "HH:MM" (24 horas), en la zona del restaurante. */
export type LocalTime = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type DateError = "invalid_date" | "invalid_time" | "nonexistent_local_time";

/** Una fecha de calendario válida ("2026-02-30" no lo es). */
export function isValidLocalDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

export function isValidLocalTime(value: string): boolean {
  return TIME_RE.test(value);
}

/** Minutos desde las 00:00 de un "HH:MM" válido. */
export function minutesOfDay(time: LocalTime): number {
  const m = TIME_RE.exec(time);
  if (!m) throw new RangeError(`Hora no válida: ${time}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** "HH:MM" de unos minutos desde las 00:00 (0 a 1439). */
export function timeFromMinutes(minutes: number): LocalTime {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) {
    throw new RangeError(`Minutos fuera de un día: ${minutes}`);
  }
  const h = Math.floor(minutes / 60);
  const mi = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/** Suma días de calendario a una fecha local (aritmética pura, sin zona: no hay horas de por medio). */
export function addDays(date: LocalDate, days: number): LocalDate {
  const m = DATE_RE.exec(date);
  if (!m || !isValidLocalDate(date)) throw new RangeError(`Fecha no válida: ${date}`);
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days);
  return new Date(t).toISOString().slice(0, 10);
}

/** Día de la semana de una fecha local: 1 = lunes … 7 = domingo (como `reservation_shifts.weekdays`). */
export function isoWeekday(date: LocalDate): number {
  const m = DATE_RE.exec(date);
  if (!m || !isValidLocalDate(date)) throw new RangeError(`Fecha no válida: ${date}`);
  const dow = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** Fecha y hora locales de un instante, en una zona. "Hoy" de un restaurante sale de aquí. */
export function localDateTimeOf(instant: Date, timeZone: string): { date: LocalDate; time: LocalTime } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour}:${get("minute")}` };
}

/** La fecha de "hoy" en la zona del restaurante: a las 23:30 UTC ya es mañana en Madrid. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  return localDateTimeOf(instant, timeZone).date;
}

/**
 * El instante (UTC) de una fecha y hora locales: `reservations.starts_at`.
 *
 * - Hora que NO existe (el salto de primavera, 02:00 a 03:00): se rechaza con
 *   `nonexistent_local_time`. Ningún turno la ofrece y una reserva no puede apuntarse a
 *   una hora que no pasa; quien llame decide si pide otra.
 * - Hora que ocurre DOS veces (el cambio de otoño): es la PRIMERA, la del horario de
 *   verano. Es la elección que no da sorpresas: la reserva de las 02:30 es la que
 *   llega antes.
 */
export function localToUtc(date: LocalDate, time: LocalTime, timeZone: string): Result<Date, DateError> {
  if (!isValidLocalDate(date)) return err("invalid_date");
  if (!isValidLocalTime(time)) return err("invalid_time");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);

  const guess = zonedTimeToUtc(y, mo, d, h, mi, timeZone);
  // Candidatos: el que da el cálculo y los de una hora antes y después (el desfase
  // cambia como mucho una hora). Valen los que vuelven a la misma hora local.
  const matching = [-60, 0, 60]
    .map((delta) => new Date(guess.getTime() + delta * 60_000))
    .filter((candidate) => {
      const back = localDateTimeOf(candidate, timeZone);
      return back.date === date && back.time === time;
    })
    .sort((a, b) => a.getTime() - b.getTime());
  if (matching.length === 0) return err("nonexistent_local_time");
  return ok(matching[0]);
}
