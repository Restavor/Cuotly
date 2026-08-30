/**
 * `src/core/business-clock.ts` — el reloj contractual y los otros dos
 * calendarios de Cuotly (RN-CLK, PRD §7 y §132 de la especificación
 * maestra). Lógica de dominio pura: sin Supabase, sin Next.js, sin React
 * (CLAUDE.md, regla de estilo de código). Toda la aritmética de fechas
 * pasa por `Intl.DateTimeFormat` para ser correcta con el cambio de
 * horario de verano/invierno de la zona del espacio (RN-CLK-06), sin
 * depender de ninguna librería externa de fechas.
 *
 * "Nunca se mezclan" (PRD §8): los tres calendarios son datos, no ramas de
 * código repetidas — `WorkCalendar.kind` decide qué ventanas se aplican,
 * pero las tres funciones de la interfaz mínima (RN-CLK, "Interfaz mínima
 * del módulo") sirven a los tres por igual.
 */

export type CalendarKind = "contractual" | "support" | "menu_diario";

/**
 * Un calendario laboral versionado (RN-CLK-10): los festivos son los que
 * estaban configurados en el momento del cálculo, no los festivos
 * "actuales" del espacio. Quien llama es responsable de pasar la
 * fotografía correcta — este módulo nunca lee el estado presente de nada.
 */
export type WorkCalendar = {
  readonly kind: CalendarKind;
  /** Zona horaria IANA del espacio (RN-CLK-06, p. ej. "Europe/Madrid"). */
  readonly timezone: string;
  /**
   * Fechas locales "YYYY-MM-DD" cerradas el día completo (RN-CLK-03). El
   * calendario de Menú Diario las ignora siempre (RN-CLK-09).
   */
  readonly holidays: readonly string[];
};

/** RN-CLK-01/02/03: lunes 09:00 a sábado 14:30, continuo, con festivos. */
export function contractualCalendar(
  timezone: string,
  holidays: readonly string[] = [],
): WorkCalendar {
  return { kind: "contractual", timezone, holidays };
}

/** §132 de la especificación maestra: horario humano de soporte. */
export function supportCalendar(
  timezone: string,
  holidays: readonly string[] = [],
): WorkCalendar {
  return { kind: "support", timezone, holidays };
}

/** RN-CLK-09: todos los días del año, festivos incluidos. */
export function menuDiarioCalendar(timezone: string): WorkCalendar {
  return { kind: "menu_diario", timezone, holidays: [] };
}

/**
 * Un festivo tal como se guarda (`holidays.holiday_date`, `holidays.created_at`
 * en el esquema): el día que cierra y el instante en el que se configuró.
 */
export type HolidayRecord = {
  /** Fecha local "YYYY-MM-DD" que cierra el día completo (RN-CLK-03). */
  readonly date: string;
  /** Momento en el que se dio de alta el festivo (`holidays.created_at`). */
  readonly configuredAt: Date;
};

/**
 * RN-CLK-10: construye la lista de festivos "tal como estaban configurados"
 * en `asOf`, para recalcular un contador ya en curso — no los festivos que
 * haya *ahora* en el espacio. Un festivo dado de alta después de `asOf`
 * queda fuera aunque su fecha caiga dentro del rango que se recalcula, así
 * que no cierra retroactivamente un día que el contador ya dio por
 * laborable. `asOf` debe ser el instante en el que arrancó el tramo que se
 * está recalculando (o, para no recalcular nada retroactivamente en
 * absoluto, el instante del cálculo original).
 *
 * Esto es lo que cualquier código que lea la tabla `holidays` (Hito 4 en
 * adelante) debe usar para construir el `WorkCalendar` de un recálculo:
 * nunca `WHERE holiday_date <= ...` a secas, siempre filtrando también por
 * `configured_at`/`created_at`.
 */
export function holidaysKnownAsOf(records: readonly HolidayRecord[], asOf: Date): readonly string[] {
  return records.filter((record) => record.configuredAt.getTime() <= asOf.getTime()).map((record) => record.date);
}

// ---------------------------------------------------------------------
// Zona horaria: leer y construir instantes a partir de hora local, sin
// librería externa. El truco es estándar: formatear el instante en la
// zona de destino y comparar contra la misma hora interpretada como UTC
// para obtener el desfase real en ese instante concreto (RN-CLK-06).
// ---------------------------------------------------------------------

type LocalParts = {
  year: number;
  month: number;
  day: number;
  /** Minutos desde las 00:00 locales de ese día (0–1439). */
  minuteOfDay: number;
  /** 0 = lunes … 6 = domingo (semana ISO, distinta de Date#getDay()). */
  mondayIndex: number;
  /** Fecha local "YYYY-MM-DD", clave de festivo. */
  dateKey: string;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function formatPartsMap(date: Date, timeZone: string, weekday: boolean): Record<string, string> {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    ...(weekday ? ({ weekday: "short" } as const) : {}),
  });
  return Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
}

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = formatPartsMap(date, timeZone, true);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  // Algunos entornos formatean la medianoche como "24:00" con hour12:false.
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  const minute = Number(parts.minute);
  const weekday = WEEKDAY_INDEX[parts.weekday] ?? 0;
  const mondayIndex = (weekday + 6) % 7;
  const dateKey = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, day, minuteOfDay: hour * 60 + minute, mondayIndex, dateKey };
}

/** Desfase (en minutos, hora local menos UTC) de `timeZone` en el instante `date`. */
function offsetMinutes(date: Date, timeZone: string): number {
  const parts = formatPartsMap(date, timeZone, false);
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60_000;
}

/**
 * Instante UTC que corresponde a la hora local dada en `timeZone`.
 * Algoritmo de dos pasadas estándar para resolver el desfase correcto
 * incluso alrededor de un cambio de horario de verano/invierno.
 */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset1 = offsetMinutes(new Date(naiveUtc), timeZone);
  const guess1 = naiveUtc - offset1 * 60_000;
  const offset2 = offsetMinutes(new Date(guess1), timeZone);
  const utc = offset2 === offset1 ? guess1 : naiveUtc - offset2 * 60_000;
  return new Date(utc);
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Instante UTC de la hora local `minuteOfDay` (puede ser 1440 = medianoche siguiente) del día `year-month-day`. */
function dayBoundaryUtc(
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
  timeZone: string,
): Date {
  const extraDays = Math.floor(minuteOfDay / 1440);
  const minute = minuteOfDay - extraDays * 1440;
  const base = extraDays > 0 ? addCalendarDays(year, month, day, extraDays) : { year, month, day };
  return zonedTimeToUtc(base.year, base.month, base.day, Math.floor(minute / 60), minute % 60, timeZone);
}

// ---------------------------------------------------------------------
// Ventanas laborables por calendario.
// ---------------------------------------------------------------------

type Interval = { readonly start: number; readonly end: number };

function isHolidayDate(dateKey: string, calendar: WorkCalendar): boolean {
  return calendar.holidays.includes(dateKey);
}

/**
 * Intervalos abiertos (en minutos desde las 00:00 locales, `end` puede
 * llegar a 1440) del día representado por `parts`, según RN-CLK-01/02/03
 * (contractual), §132 de la especificación maestra (soporte) o RN-CLK-09
 * (Menú Diario).
 */
function openIntervalsFor(parts: LocalParts, calendar: WorkCalendar): readonly Interval[] {
  switch (calendar.kind) {
    case "menu_diario":
      // RN-CLK-09: todos los días del año, festivos incluidos.
      return [{ start: 0, end: 1440 }];

    case "contractual": {
      if (isHolidayDate(parts.dateKey, calendar)) return []; // RN-CLK-03
      if (parts.mondayIndex === 0) return [{ start: 540, end: 1440 }]; // lunes 09:00–24:00
      if (parts.mondayIndex >= 1 && parts.mondayIndex <= 4) return [{ start: 0, end: 1440 }]; // martes–viernes
      if (parts.mondayIndex === 5) return [{ start: 0, end: 870 }]; // sábado 00:00–14:30
      return []; // domingo (RN-CLK-02)
    }

    case "support": {
      // §132: "Festivos: horario de fin de semana" — no es un cierre
      // completo como en el reloj contractual, es un cambio de horario.
      const useWeekendSchedule = parts.mondayIndex >= 5 || isHolidayDate(parts.dateKey, calendar);
      if (useWeekendSchedule) {
        return [
          { start: 540, end: 870 }, // 09:00–14:30
          { start: 990, end: 1290 }, // 16:30–21:30
        ];
      }
      return [{ start: 840, end: 1320 }]; // lunes–viernes 14:00–22:00
    }
  }
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() > b.getTime() ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() < b.getTime() ? a : b;
}

// ---------------------------------------------------------------------
// Interfaz mínima del módulo (PRD §7, "Interfaz mínima del módulo").
// ---------------------------------------------------------------------

/** RN-CLK-04: la unidad de cálculo es el minuto laborable. */
export function isWithinBusinessWindow(at: Date, calendar: WorkCalendar): boolean {
  const parts = localParts(at, calendar.timezone);
  return openIntervalsFor(parts, calendar).some(
    (interval) => parts.minuteOfDay >= interval.start && parts.minuteOfDay < interval.end,
  );
}

/**
 * Minutos laborables entre dos instantes, ambos en el mismo calendario.
 * `to` anterior o igual a `from` da 0. Recorre día local a día local, sin
 * simular minuto a minuto, para ser eficiente en rangos largos.
 */
export function businessMinutesBetween(from: Date, to: Date, calendar: WorkCalendar): number {
  if (to.getTime() <= from.getTime()) return 0;

  let totalMs = 0;
  let cursor = from;

  while (cursor.getTime() < to.getTime()) {
    const parts = localParts(cursor, calendar.timezone);

    for (const interval of openIntervalsFor(parts, calendar)) {
      const startUtc = dayBoundaryUtc(parts.year, parts.month, parts.day, interval.start, calendar.timezone);
      const endUtc = dayBoundaryUtc(parts.year, parts.month, parts.day, interval.end, calendar.timezone);
      const overlapStart = maxDate(startUtc, cursor);
      const overlapEnd = minDate(endUtc, to);
      if (overlapStart.getTime() < overlapEnd.getTime()) {
        totalMs += overlapEnd.getTime() - overlapStart.getTime();
      }
    }

    const nextDay = addCalendarDays(parts.year, parts.month, parts.day, 1);
    const nextDayStart = zonedTimeToUtc(nextDay.year, nextDay.month, nextDay.day, 0, 0, calendar.timezone);
    cursor = nextDayStart;
  }

  return Math.round(totalMs / 60_000);
}

/**
 * Instante que resulta de sumar `minutes` minutos laborables a `from`
 * dentro de `calendar`. Si `from` cae fuera de ventana, esos minutos no
 * cuentan y la suma empieza en la siguiente apertura (RN-CLK-01/02).
 */
export function addBusinessMinutes(from: Date, minutes: number, calendar: WorkCalendar): Date {
  if (minutes < 0) {
    throw new Error("addBusinessMinutes no admite un número negativo de minutos");
  }
  if (minutes === 0) return from;

  let remainingMs = minutes * 60_000;
  let cursor = from;

  // Cota de seguridad: como mucho 10 años de días locales, para que un
  // calendario mal formado (o un festivo infinito) nunca deje el bucle
  // colgado en vez de fallar con un error claro.
  for (let guard = 0; guard < 3650; guard++) {
    const parts = localParts(cursor, calendar.timezone);

    for (const interval of openIntervalsFor(parts, calendar)) {
      const startUtc = dayBoundaryUtc(parts.year, parts.month, parts.day, interval.start, calendar.timezone);
      const endUtc = dayBoundaryUtc(parts.year, parts.month, parts.day, interval.end, calendar.timezone);
      if (endUtc.getTime() <= cursor.getTime()) continue;

      const segmentStart = maxDate(startUtc, cursor);
      const segmentMs = endUtc.getTime() - segmentStart.getTime();
      if (segmentMs <= 0) continue;

      if (segmentMs >= remainingMs) {
        return new Date(segmentStart.getTime() + remainingMs);
      }
      remainingMs -= segmentMs;
      cursor = endUtc;
    }

    const nextDay = addCalendarDays(parts.year, parts.month, parts.day, 1);
    const nextDayStart = zonedTimeToUtc(nextDay.year, nextDay.month, nextDay.day, 0, 0, calendar.timezone);
    cursor = maxDate(nextDayStart, cursor);
  }

  throw new Error("addBusinessMinutes: no se encontró suficiente tiempo laborable en 10 años");
}
