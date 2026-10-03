/**
 * `src/core/local-time.ts` · fechas y horas locales de un espacio (zona horaria del espacio).
 *
 * Qué viene de Restavor web y qué no:
 *   - `localDateTimeOf`, `localDateOf` y los validadores son copia de `apps/web/src/core/reservations/dates.ts`.
 *   - `utcOffsetMinutes` sale de `apps/web/src/core/business-clock.ts` (RN-CLK-06).
 *   - `zonedTimeToUtc` está REESCRITA. La de `business-clock.ts` coincide con PostgreSQL con las horas normales (como las
 *     07:00 por defecto), pero NO cuando la hora configurada cae en el hueco o en la repetición del cambio de hora en
 *     una zona al oeste de Greenwich (America/New_York, 08/03/2026 02:30: el original da 06:30Z y PostgreSQL 07:30Z).
 *     En Europe/Madrid y demás zonas al este las dos coinciden. Este defecto, en apps/web, queda anotado aparte: aquí no se toca.
 * La copia es a propósito: el robot tiene que poder ejecutarse en cualquier máquina Linux y el despachador podría correr
 * en Deno (PRD §5.2), y los originales importan sin extensión.
 *
 * El árbitro de `zonedTimeToUtc` es PostgreSQL (`(fecha + hora) at time zone zona`), el mismo cálculo que usa
 * `menu_publish_by_at` en la base. Los tests de este archivo fijan sus valores en 15 zonas.
 *
 * Los dos domingos del año en que cambia la hora (en Europe/Madrid: 29/03/2026 y 25/10/2026) son lo difícil: por eso
 * nada aquí suma «24 horas» ni «medianoche más N horas».
 *
 * Lógica de dominio pura: sin Supabase, sin Next, sin React y sin leer el reloj del sistema.
 */
import { err, ok, type Result } from "./result.ts";

/** "YYYY-MM-DD", en la zona del espacio. */
export type LocalDate = string;
/** "HH:MM" (24 horas), en la zona del espacio. */
export type LocalTime = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Una fecha de calendario válida ("2026-02-30" no lo es). */
export function isValidLocalDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

/** Una hora "HH:MM" de 24 horas válida. */
export function isValidLocalTime(value: string): boolean {
  return TIME_RE.test(value);
}

/** Día de la semana de una fecha local: 1 = lunes … 7 = domingo. */
export function isoWeekday(date: LocalDate): number {
  const m = DATE_RE.exec(date);
  if (!m || !isValidLocalDate(date)) throw new RangeError(`Fecha no válida: ${date}`);
  const dow = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return dow === 0 ? 7 : dow;
}

function formatPartsMap(date: Date, timeZone: string): Record<string, string> {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
}

/** Desfase (en minutos, hora local menos UTC) de `timeZone` en el instante `date`. */
export function utcOffsetMinutes(date: Date, timeZone: string): number {
  const parts = formatPartsMap(date, timeZone);
  const hour = Number(parts["hour"]) === 24 ? 0 : Number(parts["hour"]);
  const asUtc = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    hour,
    Number(parts["minute"]),
    Number(parts["second"]),
  );
  // El formateador solo da segundos: se compara con el instante sin milisegundos.
  const seconds = Math.floor(date.getTime() / 1000) * 1000;
  return (asUtc - seconds) / 60_000;
}

/**
 * Instante UTC que corresponde a la hora local dada en `timeZone`, con la regla de PostgreSQL (`at time zone`):
 *   - hora normal: la única que existe;
 *   - hora que NO existe (el salto de primavera): se interpreta con el desfase de ANTES del salto, así que cae
 *     después de él (02:30 en Madrid el 29/03/2026 es 03:30 CEST);
 *   - hora que ocurre DOS veces (el cambio de otoño): es la SEGUNDA aparición (en los cambios de otoño, la de horario estándar).
 * Sirve para cualquier zona, también las que cambian media hora o 45 minutos (Lord_Howe, Chatham) y las de desfase negativo.
 * Supone como mucho UN cambio de hora en las 48 horas alrededor de la hora pedida (cierto en las zonas con las reglas de hoy).
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute, 0); // la hora local leída como si fuera UTC
  const DAY = 86_400_000;
  // Desfases de un día antes y un día después: entre los dos cabe como mucho un cambio de hora.
  const before = utcOffsetMinutes(new Date(wall - DAY), timeZone);
  const after = utcOffsetMinutes(new Date(wall + DAY), timeZone);
  const withBefore = wall - before * 60_000;
  if (before === after) return new Date(withBefore);
  const withAfter = wall - after * 60_000;
  // Un candidato vale si, en su propio instante, el desfase es el que se usó para calcularlo.
  const beforeFits = utcOffsetMinutes(new Date(withBefore), timeZone) === before;
  const afterFits = utcOffsetMinutes(new Date(withAfter), timeZone) === after;
  if (beforeFits && !afterFits) return new Date(withBefore);
  if (afterFits && !beforeFits) return new Date(withAfter);
  // Valen los dos (hora repetida) o ninguno (hueco): en ambos casos PostgreSQL elige el instante posterior.
  return new Date(Math.max(withBefore, withAfter));
}

/** Fecha y hora locales de un instante, en una zona. «Hoy» de un espacio sale de aquí. */
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

/** La fecha de «hoy» en la zona del espacio: a las 23:30 UTC de invierno ya es mañana en Madrid. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  return localDateTimeOf(instant, timeZone).date;
}

export type TimeInputError = "invalid_now" | "invalid_time_zone";

/**
 * `localDateOf` sin excepciones: un instante inválido o una zona que `Intl` no conoce se devuelven como error
 * explícito (`Intl` lanza `RangeError`).
 */
export function tryLocalDateOf(instant: Date, timeZone: string): Result<LocalDate, TimeInputError> {
  if (Number.isNaN(instant.getTime())) return err("invalid_now");
  try {
    const date = localDateOf(instant, timeZone);
    // Un año de menos de 4 cifras o de más de 4 no sale como «AAAA-MM-DD»: no es un reloj real.
    if (!isValidLocalDate(date)) return err("invalid_now");
    return ok(date);
  } catch (e) {
    if (e instanceof RangeError) return err("invalid_time_zone");
    throw e;
  }
}
