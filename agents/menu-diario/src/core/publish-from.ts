/**
 * `src/core/publish-from.ts` · RA-01, cuándo publica el agente (decisión 154 de Bosco, 03/10/2026).
 * Sustituye a la regla de la víspera de las 17:00 que traía el PRD del agente (§7.1).
 *
 * Todo en la zona horaria del espacio. «Hoy» es la fecha local en ese instante.
 *
 *   - Menú para una fecha PASADA → no se publica (`date_in_past`).
 *   - Menú para HOY             → en cuanto llega: `publicar_desde = ahora`. Cada envío nuevo de hoy se publica al llegar
 *                                  y sustituye al anterior (uno a las 8:00 y otro a las 9:00 → a las 9:00 sale el nuevo).
 *   - Menú para OTRO DÍA        → nunca antes de su día: a las 07:00 del día del menú (configurable), con la última
 *                                  versión enviada hasta entonces. Si llega ya pasada esa hora del día del menú, ese día es
 *                                  «hoy» y se publica al llegar.
 *
 * Pura: el reloj (`now`) lo pone quien llama; la función nunca lee la hora del sistema (decisión 156).
 */
import {
  isValidLocalDate,
  isValidLocalTime,
  tryLocalDateOf,
  zonedTimeToUtc,
  type LocalDate,
  type LocalTime,
  type TimeInputError,
} from "./local-time.ts";
import { err, ok, type Result } from "./result.ts";

/** Hora local a la que se publica un menú de otro día, si no se configura otra (decisión 154). */
export const DEFAULT_OTHER_DAY_HOUR: LocalTime = "07:00";

export type PublishFromInput = {
  /** `menus.target_date`: la fecha para la que es el menú. */
  targetDate: LocalDate;
  /** El instante en que se hace el cálculo (no la hora a la que el cliente pidió publicar). */
  now: Date;
  /** `spaces.timezone`. */
  timeZone: string;
  /** Hora local de publicación de los menús de otro día. Por defecto 07:00. */
  otherDayHour?: LocalTime;
};

export type PublishFromReason = "today" | "other_day";

export type PublishFrom = {
  /** El instante (UTC) desde el que toca publicar: va a una columna `timestamptz`. */
  at: Date;
  reason: PublishFromReason;
};

export type PublishFromError = "date_in_past" | "invalid_date" | "invalid_hour" | TimeInputError;

export function computePublishFrom(input: PublishFromInput): Result<PublishFrom, PublishFromError> {
  const { targetDate, now, timeZone } = input;
  const otherDayHour = input.otherDayHour ?? DEFAULT_OTHER_DAY_HOUR;

  if (Number.isNaN(now.getTime())) return err("invalid_now");
  if (!isValidLocalDate(targetDate)) return err("invalid_date");
  if (!isValidLocalTime(otherDayHour)) return err("invalid_hour");

  const today = tryLocalDateOf(now, timeZone);
  if (!today.ok) return err(today.error);

  // Las fechas "YYYY-MM-DD" se ordenan igual como texto que como calendario.
  if (targetDate < today.value) return err("date_in_past");
  if (targetDate === today.value) return ok({ at: new Date(now.getTime()), reason: "today" });

  const [year, month, day] = targetDate.split("-").map(Number) as [number, number, number];
  const [hour, minute] = otherDayHour.split(":").map(Number) as [number, number];
  return ok({ at: zonedTimeToUtc(year, month, day, hour, minute, timeZone), reason: "other_day" });
}
