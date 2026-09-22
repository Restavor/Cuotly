/**
 * R21 y R22 · el calendario del restaurante: la rejilla del mes, los
 * filtros por tipo y la agenda de lo que viene.
 *
 * Los eventos no se guardan en ninguna tabla: se DERIVAN de lo que el
 * restaurante ya puede leer (sus menús, sus solicitudes, sus renovaciones,
 * sus informes enviados y, si puede ver los pagos, sus cobros), igual que
 * `space_calendar()` hace para el equipo (RN-DAT-05). Este módulo solo
 * ordena y agrupa; los días ya llegan en la zona del espacio.
 */
import { daysInMonth } from "./team-calendar";

export const CLIENT_CALENDAR_KINDS = ["menu", "request", "renewal", "report", "charge"] as const;
export type ClientCalendarKind = (typeof CLIENT_CALENDAR_KINDS)[number];

export function isClientCalendarKind(value: string): value is ClientCalendarKind {
  return (CLIENT_CALENDAR_KINDS as readonly string[]).includes(value);
}

export type ClientCalendarEvent = {
  readonly id: string;
  readonly kind: ClientCalendarKind;
  /** "YYYY-MM-DD", ya en la zona del espacio. */
  readonly day: string;
  /** "HH:MM" cuando el evento tiene hora; un día suelto no la tiene. */
  readonly time: string | null;
  readonly title: string;
  readonly detail: string | null;
  readonly stateLabel: string | null;
  readonly href: string;
};

export type CalendarView = "mes" | "agenda";

export type ClientCalendarParams = {
  /** "YYYY-MM". */
  readonly month: string;
  readonly kind: ClientCalendarKind | null;
  readonly view: CalendarView;
  readonly selected: string | null;
};

type Params = Readonly<Record<string, string | string[] | undefined>>;

function uno(valor: string | string[] | undefined): string | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  const limpio = (v ?? "").trim();
  return limpio === "" ? null : limpio;
}

/** Un mes mal escrito es el de hoy; un tipo que no existe, todos. */
export function readClientCalendarParams(params: Params, today: string): ClientCalendarParams {
  const mes = uno(params.mes);
  const tipo = uno(params.tipo);
  return {
    month: mes !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : today.slice(0, 7),
    kind: tipo !== null && isClientCalendarKind(tipo) ? tipo : null,
    view: uno(params.vista) === "agenda" ? "agenda" : "mes",
    selected: uno(params.evento),
  };
}

/** "2026-09" y ±n meses. */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function isoDay(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Las semanas del mes, de lunes a domingo, con los días del mes anterior
 * y del siguiente que completan la primera y la última (como el dibujo).
 * Son días civiles: se calculan en UTC para que ninguna zona los corra.
 */
export function monthGrid(month: string): { day: string; inMonth: boolean }[][] {
  const [y, m] = month.split("-").map(Number);
  const primero = new Date(Date.UTC(y, m - 1, 1));
  const desfase = (primero.getUTCDay() + 6) % 7; // lunes = 0
  const inicio = new Date(Date.UTC(y, m - 1, 1 - desfase));
  const total = Math.ceil((desfase + daysInMonth(y, m)) / 7) * 7;
  const semanas: { day: string; inMonth: boolean }[][] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(inicio.getTime() + i * 86_400_000);
    const dia = isoDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    if (i % 7 === 0) semanas.push([]);
    semanas[semanas.length - 1].push({ day: dia, inMonth: d.getUTCMonth() === m - 1 });
  }
  return semanas;
}

/** El primer y el último día de la rejilla, para pedir solo lo que se pinta. */
export function gridBounds(month: string): { from: string; to: string } {
  const semanas = monthGrid(month);
  return { from: semanas[0][0].day, to: semanas[semanas.length - 1][6].day };
}

function orden(a: ClientCalendarEvent, b: ClientCalendarEvent): number {
  return a.day.localeCompare(b.day) || (a.time ?? "").localeCompare(b.time ?? "") || a.title.localeCompare(b.title);
}

export function filterByKind(
  events: readonly ClientCalendarEvent[],
  kind: ClientCalendarKind | null,
): ClientCalendarEvent[] {
  return events.filter((e) => kind === null || e.kind === kind).sort(orden);
}

export function eventsByDay(events: readonly ClientCalendarEvent[]): Map<string, ClientCalendarEvent[]> {
  const mapa = new Map<string, ClientCalendarEvent[]>();
  for (const e of [...events].sort(orden)) {
    const lista = mapa.get(e.day) ?? [];
    lista.push(e);
    mapa.set(e.day, lista);
  }
  return mapa;
}

/** R21 "Evento próximo" y R22 "Próximos eventos": de hoy en adelante. */
export function upcomingEvents(
  events: readonly ClientCalendarEvent[],
  today: string,
  limit = 50,
): ClientCalendarEvent[] {
  return events.filter((e) => e.day >= today).sort(orden).slice(0, limit);
}
