/**
 * Lo que enseña la pestaña Horarios de Ajustes (M57): la semana de cada
 * calendario del espacio, día a día, y los festivos que vienen.
 *
 * **No es una configuración**: las ventanas las fijan las reglas
 * (RN-CLK-01, 02 y 09) y el reloj las calcula en `business-clock.ts`. Aquí
 * solo se escriben de forma que se puedan leer, y el test comprueba que lo
 * escrito coincide con lo que el reloj cuenta (RN-CLK-05: 125,5 h).
 *
 * Sin Supabase, sin Next y sin React (CLAUDE.md).
 */

/** 1 = lunes … 7 = domingo. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface DayWindow {
  readonly day: Weekday;
  /** Franjas `HH:MM`–`HH:MM` del día; vacío es cerrado. "24:00" es el final del día. */
  readonly ranges: readonly { readonly from: string; readonly to: string }[];
}

const ALL_DAY = [{ from: "00:00", to: "24:00" }] as const;

/**
 * RN-CLK-01 y RN-CLK-02 · de lunes 09:00 a sábado 14:30, continuo,
 * incluidas las noches entre semana; el domingo, cerrado.
 */
export function contractualWeek(): readonly DayWindow[] {
  return [
    { day: 1, ranges: [{ from: "09:00", to: "24:00" }] },
    { day: 2, ranges: ALL_DAY },
    { day: 3, ranges: ALL_DAY },
    { day: 4, ranges: ALL_DAY },
    { day: 5, ranges: ALL_DAY },
    { day: 6, ranges: [{ from: "00:00", to: "14:30" }] },
    { day: 7, ranges: [] },
  ];
}

/** RN-CLK-09 · Menú Diario, todos los días del año, festivos incluidos. */
export function menuDiarioWeek(): readonly DayWindow[] {
  return ([1, 2, 3, 4, 5, 6, 7] as const).map((day) => ({ day, ranges: ALL_DAY }));
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Horas de una semana sin festivos. */
export function weeklyHours(week: readonly DayWindow[]): number {
  const total = week.reduce(
    (sum, d) => sum + d.ranges.reduce((s, r) => s + (minutes(r.to) - minutes(r.from)), 0),
    0,
  );
  return total / 60;
}

export interface HolidayRow {
  readonly id: string;
  readonly date: string;
  readonly name: string;
}

/**
 * Los festivos de hoy en adelante, del más cercano al más lejano. Los
 * pasados no se enseñan aquí: ya no cierran nada, y el calendario del
 * espacio los conserva.
 */
export function upcomingHolidays<T extends HolidayRow>(holidays: readonly T[], today: string): T[] {
  return holidays.filter((h) => h.date >= today).sort((a, b) => a.date.localeCompare(b.date));
}
