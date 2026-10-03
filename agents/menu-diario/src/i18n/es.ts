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
    invalid_task_data: "Los datos de la tarea no son válidos",
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

  /** Estados de un menú (`menus.state`) tal como se los explicamos a Bosco. Un estado que no esté aquí se escribe con su código. */
  menuState: {
    draft: "borrador",
    prepared: "preparado",
    publication_requested: "publicación pedida",
    pending_assignment: "sin asignar",
    assigned: "asignado a una persona",
    reviewing: "en revisión",
    ready_to_publish: "listo para publicar",
    published: "publicado",
    needs_information: "necesita información",
    publication_error: "error de publicación",
    cancelled: "cancelado",
  } as Readonly<Record<string, string>>,

  dryRun: {
    title: "AGENTE MENÚ DIARIO · PRUEBA EN SECO · no escribe nada",
    simulatedClock: "RELOJ SIMULADO (--ahora): esto NO es la hora de verdad",
    environment: "Entorno",
    skewOk: (seconds: number, maxMinutes: number) =>
      `Reloj del ordenador frente al de Supabase: diferencia de ${seconds} s (máximo ${maxMinutes} min). Correcto.`,
    restaurantsTitle: "RESTAURANTES",
    noRestaurants: "El agente no tiene ningún restaurante autorizado. No hay nada que mirar.",
    restaurantActivated: (running: boolean) =>
      `activado a efectos de la prueba (autorizado, su web es de LandingSite${running ? ", servicio en marcha" : ", pero el SERVICIO ESTÁ DETENIDO"})`,
    restaurantNotActivated: {
      not_landing_site: "autorizado pero NO activado: su web no es de LandingSite",
      deleted: "autorizado pero NO activado: está borrado",
      filtered_out: "no entra en esta prueba por el filtro --restaurante",
    } as Readonly<Record<string, string>>,
    queueTitle: "COLA (menús con la publicación pedida)",
    queueEmpty: "No hay ningún menú con la publicación pedida en los restaurantes activados.",
    requested: "Pedida",
    objective: "Plazo objetivo",
    assignmentLabel: "Asignación (la haría el despachador de la Fase 2)",
    assignment: {
      own: "ya es del agente",
      would_take: "sin asignar: la tomaría",
      would_reassign: "asignada automáticamente a una persona y sin empezar: la reasignaría al agente",
      hands_off: "la ha cogido una persona a propósito o ya está empezada: no la toca",
      no_rule: "estado sin regla en el PRD (decisión pendiente): no actúa",
    } as Readonly<Record<string, string>>,
    whatItWouldDo: "Qué haría",
    actions: {
      publishNow: (order: number, of: number) => `publicar ya (orden ${order} de ${of} en esta ejecución).`,
      waitUntil: (when: string, place: string) => `esperar hasta el ${when} (hora de ${place}) y entonces publicarlo.`,
      reportError: (reason: string) => `no publicar y avisar con el error «${reason}».`,
      handsOff: "nada.",
      noRule: "nada (el PRD no tiene regla para este estado).",
      notDaily: "nada: el agente solo se ocupa de los menús del día (daily).",
      serviceStopped: "si fuera suyo, lo cancelaría y lo devolvería al equipo sin tocar la web, porque el servicio del restaurante está detenido.",
    },
    draftsTitle: "SIN PUBLICACIÓN PEDIDA (borradores y preparados)",
    draftLine: (state: string) => `${state}: no actúa hasta que el restaurante pida publicarlo.`,
    warningsTitle: "AVISOS",
    warningLaterDay: (restaurant: string, menuDate: string, laterDate: string) =>
      `${restaurant}: el menú del ${menuDate} se publicaría, pero el del ${laterDate} ya está publicado a mano por una persona. La regla de orden solo mira tareas del agente, así que no lo bloquea (sin regla: lo decide Bosco).`,
    summaryTitle: "RESUMEN",
    summary: {
      publish_now: "publicaría ya",
      wait_until: "esperaría",
      report_error: "reportaría un error",
      hands_off: "no tocaría (lo tiene una persona)",
      no_rule: "sin regla",
      not_a_daily_menu: "no son menús del día",
      service_stopped: "con el servicio detenido",
    } as Readonly<Record<string, string>>,
    writes: (reads: number, auth: number) =>
      `Escrituras en la base de datos: 0 (se hicieron ${reads} lecturas y ${auth} peticiones de inicio y cierre de sesión; ninguna otra).`,
    day: {
      today: "hoy",
      tomorrow: "mañana",
      dayAfterTomorrow: "pasado mañana",
      yesterday: "ayer",
      inDays: (n: number) => `dentro de ${n} días`,
      daysAgo: (n: number) => `hace ${n} días`,
    },
    at: "a las",
    errors: {
      missingEnv: (names: readonly string[]) =>
        `Faltan variables de entorno: ${names.join(", ")}. Solo se dicen los nombres, nunca los valores.`,
      badArgument: (arg: string) =>
        `Argumento no reconocido: ${arg}. Se admite --ahora=<fecha y hora con zona, p. ej. 2026-10-04T08:00:00+02:00> y --restaurante=<código o id>.`,
      badNow: (value: string) => `--ahora no es una fecha y hora válidas con zona (Z o +02:00): ${value}`,
      project: {
        invalid_url: "RESTAVOR_SUPABASE_URL no es una dirección válida. No se hace nada.",
        production_project:
          "RESTAVOR_SUPABASE_URL apunta a PRODUCCIÓN. Hasta la Fase 7 el agente solo trabaja contra «Restavor pruebas». No se hace nada.",
        not_pruebas_project: "RESTAVOR_SUPABASE_URL no es la de «Restavor pruebas». No se hace nada.",
      } as Readonly<Record<string, string>>,
      signIn: (message: string) => `No se pudo iniciar sesión como el agente: ${message}`,
      read: (what: string, message: string) => `No se pudo leer ${what}: ${message}. Esto es un ERROR DE LECTURA, no una cola vacía.`,
      clockSkew: (seconds: number, maxMinutes: number) =>
        `El reloj del ordenador y el de Supabase difieren ${Math.abs(seconds)} s (el máximo es ${maxMinutes} min): el agente se para y no decide nada con un reloj dudoso.`,
      clockUnreadable:
        "No se pudo contrastar la hora del ordenador con la de Supabase (la respuesta no trae su hora): el agente se para y no decide nada con un reloj dudoso.",
    },
  },
} as const;

function utcOffsetLabel(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}

/** «Madrid» para `Europe/Madrid`; «Buenos Aires» para `America/Argentina/Buenos_Aires`. */
export function placeOf(timeZone: string): string {
  return timeZone.includes("/") ? (timeZone.split("/").pop() ?? timeZone).replaceAll("_", " ") : timeZone;
}

/** «Hoy es sábado 3 de octubre de 2026, 18:42, hora de Madrid (UTC+02:00)». */
export function formatClock(clock: LocalClock): string {
  const [year, month, day] = clock.date.split("-").map(Number) as [number, number, number];
  const weekday = es.clock.weekdays[clock.isoWeekday - 1];
  const monthName = es.clock.months[month - 1];
  return `${es.clock.today} ${weekday} ${day} de ${monthName} de ${year}, ${clock.time}, hora de ${placeOf(clock.timeZone)} (${utcOffsetLabel(clock.utcOffsetMinutes)})`;
}
