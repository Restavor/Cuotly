/**
 * `src/core/reservations/format.ts` · cómo se escriben las fechas de la agenda («Sábado, 26
 * de septiembre», «Sáb 26 sept», «Septiembre 2026»). Salen de `Intl` en español, no de
 * listas escritas a mano, y siempre en UTC: una fecha local de reserva ("2026-09-26") no
 * tiene hora, así que no hay zona que la mueva de día.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */
import { isValidLocalDate } from "./dates";
import type { LocalDate } from "./dates";

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("es-ES", { ...options, timeZone: "UTC" });
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

function asDate(date: LocalDate): Date {
  if (!isValidLocalDate(date)) throw new RangeError(`Fecha no válida: ${date}`);
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** «Sábado, 26 de septiembre». */
export function formatLongDate(date: LocalDate): string {
  return capitalize(formatter({ weekday: "long", day: "numeric", month: "long" }).format(asDate(date)));
}

/** «Sáb 26 sept» (sin los puntos que pone `Intl`). */
export function formatShortDate(date: LocalDate): string {
  const d = asDate(date);
  const weekday = capitalize(formatter({ weekday: "short" }).format(d).replace(".", ""));
  const month = formatter({ month: "short" }).format(d).replace(".", "");
  return `${weekday} ${d.getUTCDate()} ${month}`;
}

/** «Septiembre 2026». */
export function formatMonth(month: string): string {
  const d = asDate(`${month}-01`);
  return `${capitalize(formatter({ month: "long" }).format(d))} ${d.getUTCFullYear()}`;
}

/** El nombre de un día de la semana (1 = lunes … 7 = domingo): «lunes», o su inicial «L» si es `narrow`. */
export function weekdayName(weekday: number, style: "long" | "short" | "narrow" = "long"): string {
  // El 5 de enero de 2026 fue lunes.
  const d = new Date(Date.UTC(2026, 0, 4 + weekday));
  const text = formatter({ weekday: style }).format(d).replace(".", "");
  return style === "narrow" ? text.toUpperCase() : capitalize(text);
}

/** Una duración en minutos como la escribe la pantalla de ajustes: «2 h», «90 min», «1 h 30 min». */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** «24 sept, 18:42»: la fecha y la hora de un instante en la zona del restaurante, para el historial de una reserva. */
export function formatDateTime(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).formatToParts(instant);
  const get = (type: string) => (parts.find((p) => p.type === type)?.value ?? "").replace(".", "");
  return `${get("day")} ${get("month")}, ${get("hour")}:${get("minute")}`;
}

// ---------------------------------------------------------------------------
// Fechas de los avisos a los comensales (`docs/agents/textos-avisos.md`)
// ---------------------------------------------------------------------------

/** Una fecha de aviso se escribe en el idioma de la reserva, no en el de la interfaz. */
export type NoticeDateLanguage = "es" | "en";

function noticeParts(date: LocalDate, language: NoticeDateLanguage, options: Intl.DateTimeFormatOptions): Map<string, string> {
  const parts = new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-GB", { ...options, timeZone: "UTC" }).formatToParts(asDate(date));
  return new Map(parts.map((p) => [p.type, p.value.replace(".", "")]));
}

/**
 * `{fecha_larga}`: «sábado 26 de septiembre» / «Saturday 26 September». Sin coma ni mayúscula inicial en español:
 * va dentro de una frase («el sábado 26 de septiembre a las 21:00»).
 */
export function formatNoticeLongDate(date: LocalDate, language: NoticeDateLanguage): string {
  const p = noticeParts(date, language, { weekday: "long", day: "numeric", month: "long" });
  const [weekday, day, month] = [p.get("weekday"), p.get("day"), p.get("month")];
  return language === "es" ? `${weekday} ${day} de ${month}` : `${weekday} ${day} ${month}`;
}

/** `{fecha_corta}`: «sáb 26/09» / «Sat 26/09» (en inglés, con mayúscula inicial). */
export function formatNoticeShortDate(date: LocalDate, language: NoticeDateLanguage): string {
  const d = asDate(date);
  const weekday = noticeParts(date, language, { weekday: "short" }).get("weekday") ?? "";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${language === "es" ? weekday.toLowerCase() : capitalize(weekday)} ${day}/${month}`;
}
