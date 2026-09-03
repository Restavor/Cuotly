/**
 * Lógica pura del calendario del espacio y de la supervisión: rangos de
 * mes, validación de una ausencia y vigencia de una sustitución.
 *
 * Vive en `src/core/` y no dentro de la pantalla porque son reglas
 * (RN-SUP-03, HU-30, HU-32), no presentación, y CLAUDE.md pide la lógica
 * de dominio aquí, sin Supabase, sin Next y sin React.
 *
 * Todo lo que aquí se llama "día" es una fecha civil `YYYY-MM-DD` en la
 * zona del espacio, no un instante. `absences.starts_on` y `ends_on` son
 * `date` y `holidays.holiday_date` también: un festivo dura el día
 * completo en la zona del espacio (RN-CLK-03), así que convertirlos a
 * `Date` para operar con ellos solo serviría para colar el huso del
 * servidor donde no pinta nada.
 */

import { zoneOffsetMinutes } from "./finance";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Un día civil válido `YYYY-MM-DD` que además existe en el calendario. */
export function isCivilDay(value: string): boolean {
  if (!DAY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

export function daysInMonth(year: number, month: number): number {
  // Día 0 del mes siguiente = último día de este. Se usa UTC a propósito:
  // aquí no hay instante que convertir, solo aritmética de calendario.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * El primer y el último día del mes al que pertenece `day`. Es el rango
 * por defecto del calendario: un mes es lo que cabe de un vistazo en un
 * teléfono sin convertirse en una lista infinita.
 */
export function monthBounds(day: string): { from: string; to: string } {
  const [year, month] = day.split("-").map(Number);
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`,
  };
}

/**
 * El mismo día del mes desplazado `delta` meses, saturando al último día
 * cuando el mes destino es más corto (31 de marzo − 1 mes = 28/29 de
 * febrero). Sirve para los botones de mes anterior y mes siguiente.
 */
export function shiftMonth(day: string, delta: number): string {
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  const limit = daysInMonth(newYear, newMonth);
  return `${newYear}-${pad(newMonth)}-${pad(Math.min(dayOfMonth, limit))}`;
}

/** `YYYY-MM` del día, para titular el mes que se está mirando. */
export function monthKey(day: string): string {
  return day.slice(0, 7);
}

export type DayRangeError =
  | "start_invalid"
  | "end_invalid"
  | "end_before_start"
  | "too_long";

export type DayRangeResult =
  | { ok: true; days: number }
  | { ok: false; error: DayRangeError };

/**
 * Cuántos días naturales ocupa un rango inclusivo. Una ausencia de un solo
 * día son 1, no 0: `ends_on` es el último día ausente, no el de vuelta.
 */
export function spanDays(from: string, to: string): number {
  return Math.round((utcMillis(to) - utcMillis(from)) / 86_400_000) + 1;
}

/**
 * El día civil como instante UTC de su medianoche, solo para restar días.
 * El mes se pasa a base 0, que es lo que espera `Date.UTC`: dejarlo en
 * base 1 desplaza cada fecha un mes y, en los cambios de mes, da
 * diferencias negativas (31 de enero "después" del 1 de febrero).
 */
function utcMillis(day: string): number {
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, dayOfMonth);
}

/**
 * HU-30 · las fechas de una ausencia. El servidor vuelve a comprobarlo
 * (`request_absence()` rechaza `ends_on < starts_on`): esto es para poder
 * decírselo a quien rellena el formulario antes de enviarlo, no para
 * autorizar nada (CLAUDE.md MUST — ocultar o validar en el cliente no es
 * un control).
 *
 * El tope de un año no está en el PRD y no lo inventa esta función como
 * regla de negocio: es una defensa contra el dedo resbalado —un "2206" en
 * vez de "2026" pinta cuatrocientos mil días de calendario— y por eso el
 * error se llama `too_long` y no "ausencia demasiado larga".
 */
export const MAX_ABSENCE_DAYS = 366;

export function validateAbsenceRange(from: string, to: string): DayRangeResult {
  if (!isCivilDay(from)) return { ok: false, error: "start_invalid" };
  if (!isCivilDay(to)) return { ok: false, error: "end_invalid" };
  const days = spanDays(from, to);
  if (days < 1) return { ok: false, error: "end_before_start" };
  if (days > MAX_ABSENCE_DAYS) return { ok: false, error: "too_long" };
  return { ok: true, days };
}

/**
 * RN-SUP-03/RN-SUP-04 · una sustitución está vigente si ya empezó y aún no
 * ha terminado, y no se ha retirado. `revokedAt` gana sobre las fechas:
 * retirar antes de tiempo es exactamente lo que RN-SUP-03 permite.
 *
 * El principal no tiene fin (`endsAt` nulo) y esta misma función lo trata
 * bien: sin fecha de fin, sigue vigente.
 */
export function isSupervisionCurrent(
  now: Date,
  supervision: { startsAt: string; endsAt: string | null; revokedAt: string | null },
): boolean {
  if (supervision.revokedAt !== null) return false;
  const t = now.getTime();
  if (t < new Date(supervision.startsAt).getTime()) return false;
  if (supervision.endsAt !== null && t >= new Date(supervision.endsAt).getTime()) return false;
  return true;
}


/** El día civil siguiente. `2026-12-31` → `2027-01-01`. */
export function nextDay(day: string): string {
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  const siguiente = new Date(Date.UTC(year, month - 1, dayOfMonth + 1));
  return siguiente.toISOString().slice(0, 10);
}

/**
 * RN-SUP-03 · la ventana de una sustitución, del día que se elige "desde"
 * al día que se elige "hasta", **ambos incluidos**, en la zona del espacio.
 *
 * Las dos fechas llegan del formulario como días civiles sueltos y
 * `supervisions.starts_at` / `ends_at` son `timestamptz` (CLAUDE.md MUST),
 * así que alguien tiene que ponerles hora y huso. Mandarlas tal cual haría
 * que PostgreSQL las leyera en SU zona de sesión —UTC en Supabase—, con
 * dos consecuencias que se ven en producto: en Madrid la sustitución
 * empezaría a las 02:00 y, peor, terminaría a las 02:00 del día "hasta",
 * de modo que ese día no estaría cubierto pese a haberlo elegido.
 *
 * Aquí se ancla al comienzo del día en la zona del espacio, y el fin al
 * comienzo del día SIGUIENTE al elegido: `isSupervisionCurrent()` trata
 * `endsAt` como límite abierto (`t >= endsAt` ya no está vigente), así que
 * ese instante es exactamente "hasta el final del día elegido".
 *
 * Devuelve `null` si algún día no existe o la zona no es válida, en vez de
 * lanzar: error de negocio como resultado explícito (CLAUDE.md).
 */
export function supervisionWindow(
  startDay: string,
  endDayInclusive: string,
  timeZone: string,
): { startsAt: string; endsAt: string } | null {
  if (!isCivilDay(startDay) || !isCivilDay(endDayInclusive)) return null;
  if (spanDays(startDay, endDayInclusive) < 1) return null;

  const inicio = civilDayStartInZone(startDay, timeZone);
  const fin = civilDayStartInZone(nextDay(endDayInclusive), timeZone);
  if (inicio === null || fin === null) return null;

  return { startsAt: inicio, endsAt: fin };
}

/**
 * El instante en que empieza un día civil en una zona.
 *
 * Se hace en dos pasadas y no en una porque el desplazamiento depende del
 * instante que se está buscando: se estima con el desplazamiento vigente
 * en la medianoche *leída como UTC*, se corrige, y se vuelve a medir sobre
 * el candidato. Los dos días del año en que la zona cambia de horario son
 * justamente aquellos en los que la primera estimación puede caer al otro
 * lado del salto, y sin la segunda pasada la medianoche del 29 de marzo en
 * Madrid salía una hora antes de lo que es. Lo pilló el test.
 *
 * En una zona cuyo salto ocurra a medianoche esa medianoche puede no
 * existir; entonces el resultado es el instante del salto, que es lo más
 * cercano a "el día empieza aquí" que hay.
 */
export function civilDayStartInZone(day: string, timeZone: string): string | null {
  if (!isCivilDay(day)) return null;
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  const medianocheComoUtc = Date.UTC(year, month - 1, dayOfMonth, 0, 0, 0);

  try {
    const estimado = zoneOffsetMinutes(new Date(medianocheComoUtc), timeZone);
    const candidato = medianocheComoUtc - estimado * 60_000;
    const real = zoneOffsetMinutes(new Date(candidato), timeZone);
    const instante = real === estimado ? candidato : medianocheComoUtc - real * 60_000;
    return new Date(instante).toISOString();
  } catch {
    // Una zona inexistente hace lanzar a Intl: dato inválido, no caída.
    return null;
  }
}
