/**
 * Todo el texto que ve una persona (Bosco, el equipo, los emails). El núcleo (`src/core`) devuelve códigos y
 * este archivo los convierte en frases (CLAUDE.md: nunca literales de pantalla fuera de i18n).
 */
import type { LocalClock } from "../core/clock.ts";
import type { OrderReason } from "../core/order-and-filter.ts";
import type { PublishFromError } from "../core/publish-from.ts";
import type { TaskState } from "../core/task-state.ts";

export const es = {
  publishFromError: {
    date_in_past: "La fecha del menú ya ha pasado",
    invalid_date: "La fecha del menú no es válida",
    invalid_hour: "La hora de publicación no es válida",
    invalid_time_zone: "La zona horaria del espacio no es válida",
    invalid_now: "El reloj del agente no es válido",
  } satisfies Record<PublishFromError, string>,

  orderReason: {
    date_in_past: "La fecha del menú ya ha pasado",
    later_day_already_published: "Ya hay publicado un menú de un día posterior",
  } satisfies Record<OrderReason, string>,

  taskState: {
    preparing: "Preparando",
    waiting: "Esperando",
    ready: "Lista",
    publishing: "Publicando",
    verifying: "Verificando",
    published: "Publicada",
    error: "Error",
    session_blocked: "Sesión de LandingSite bloqueada",
    cancelled: "Cancelada",
    returned: "Devuelta al equipo",
  } satisfies Record<TaskState, string>,

  clock: {
    today: "Hoy es",
    weekdays: ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
    months: [
      "enero",
      "febrero",
      "marzo",
      "abril",
      "mayo",
      "junio",
      "julio",
      "agosto",
      "septiembre",
      "octubre",
      "noviembre",
      "diciembre",
    ],
    clockSkew: "El reloj del ordenador y el de Supabase difieren demasiado: el agente se para",
    invalidClock: "No se pudo leer la hora del ordenador o la de Supabase: el agente se para",
  },
} as const;

function utcOffsetLabel(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}

/** «Hoy es sábado 3 de octubre de 2026, 18:42, hora de Madrid (UTC+02:00)». */
export function formatClock(clock: LocalClock): string {
  const [year, month, day] = clock.date.split("-").map(Number) as [number, number, number];
  const weekday = es.clock.weekdays[clock.isoWeekday - 1];
  const monthName = es.clock.months[month - 1];
  const place = clock.timeZone.includes("/")
    ? (clock.timeZone.split("/").pop() ?? clock.timeZone).replaceAll("_", " ")
    : clock.timeZone;
  return `${es.clock.today} ${weekday} ${day} de ${monthName} de ${year}, ${clock.time}, hora de ${place} (${utcOffsetLabel(clock.utcOffsetMinutes)})`;
}
