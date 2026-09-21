import { contractualCalendar, holidaysKnownAsOf, type HolidayRecord } from "@/core/business-clock";
import {
  dayKeyInTimeZone,
  jobDeadlineRisk,
  OPEN_JOB_STATES,
  PENDING_REQUEST_STATES,
  sortAttentionItems,
  type AttentionItem,
  type DeadlineRisk,
} from "@/core/home";
import { isJobState, type JobState } from "@/core/job-states";
import { loadLevel, type LoadLevel } from "@/core/load-points";
import { civilDayStartInZone, shiftMonth } from "@/core/team-calendar";
import { t2Status, t3Status, type CounterStatus } from "@/core/sla-timers";
import type { TimerEvent, TimerEventType } from "@/core/timer-events";
import type { ChangeCategory } from "@/core/classification-rules";
import { cycleAllowance, cycleUsage, type CycleUsage } from "@/core/consumption-ledger";
import type { createClient } from "@/lib/supabase/server";
import { loadEstablishmentPhotos } from "@/services/establishment-photo";

import { loadMenuQueue } from "./menu-diario/queue-load";

/**
 * Lo que enseña el Inicio del espacio (§20.4), leído del servidor.
 *
 * Es un adaptador, no lógica de negocio: consulta, junta y le pasa los
 * números a `src/core/home.ts`, que es quien decide qué está en riesgo y
 * en qué orden se pinta. Aquí no hay ni un umbral ni una regla — si
 * aparece uno, está en el sitio equivocado (CLAUDE.md).
 *
 * **Ningún filtro de permisos escrito a mano.** Lo que se ve sale de RLS y
 * de dos funciones del servidor que comprueban lo suyo: un trabajador ve
 * sus trabajos y los de sus restaurantes autorizados, y quien no puede
 * asignar no recibe la carga de nadie más que la suya. Filtrar aquí
 * duplicaría la regla y sería la copia que se desfasa.
 */
export interface TeamMemberLoad {
  readonly userId: string;
  readonly name: string;
  readonly points: number;
  readonly level: LoadLevel;
}

export interface ActivityEntry {
  readonly id: string;
  readonly entityType: "job" | "task";
  readonly toState: string;
  readonly occurredAt: string;
  readonly establishment: string | null;
  readonly deepLink: string | null;
}

export interface SpaceHome {
  readonly activeEstablishments: number;
  /**
   * Página 22 del diseño · el "de N en total" del primer recuadro. Van los
   * dos números porque son dos cosas: cuántos están activos y cuántos hay,
   * y el segundo incluye pausados, suspendidos y archivados.
   */
  readonly establishmentsTotal: number;
  /**
   * Página 22 · "Estado por restaurante": cada uno con su estado y con
   * **cuánto lleva gastado de su bolsa** en el ciclo vigente, que es lo
   * que mide la barra (decisión de Bosco, 20/09/2026).
   */
  readonly restaurants: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: string;
    readonly usage: CycleUsage;
    /**
     * RN-EST-18 · el enlace firmado de su foto, o `null` si no tiene. Un
     * restaurante sin foto se enseña sin foto, no con un hueco (CA-20).
     */
    readonly photoUrl: string | null;
  }[];
  /** Página 22 · "Trabajos en curso", y de ellos cuántos van en plazo. */
  readonly jobsInProgress: number;
  readonly jobsOnTime: number;
  /**
   * Página 22 · "Actividad de mantenimiento": un punto por día del mes en
   * curso, con las solicitudes creadas y los trabajos completados.
   *
   * Los días **sin nada son cero de verdad**, no un hueco: la consulta
   * abarca el mes entero, así que un día vacío significa que no pasó nada
   * ese día. Es lo contrario de una cifra que no se ha podido leer, y por
   * eso `days` viene siempre completo y `failed` lo dice aparte.
   */
  readonly activityChart: {
    readonly failed: boolean;
    readonly days: readonly {
      readonly day: string;
      readonly requests: number;
      readonly jobs: number;
    }[];
  };
  /**
   * El día de hoy **en la zona del espacio**, `AAAA-MM-DD`. Lo calcula el
   * servidor y viaja hasta la pantalla porque el navegador de quien mira
   * puede estar en otro huso: "Hoy" tiene que ser el hoy del restaurante,
   * no el de quien lo abre desde otro país (CLAUDE.md MUST).
   */
  readonly today: string;
  /**
   * Página 22 · "Próximas tareas": lo que viene por delante en el
   * calendario del espacio, del día de hoy en adelante.
   *
   * Sale de `space_calendar()` —la misma función que pinta el calendario
   * completo— y no de una tabla de tareas propia: los eventos se DERIVAN
   * de `menus`, `jobs`, `charges`, `subscriptions`, `absences`, `holidays`
   * y `supervisions` (RN-DAT-05), así que aquí no puede haber nada que
   * discrepe de lo que se ve en el calendario.
   *
   * `failed` separa "no se ha podido leer" de "no hay nada": un `[]` por
   * un error se leería como una agenda despejada, que es justo lo
   * contrario de lo que pasa (CA-20).
   */
  readonly upcoming: {
    readonly failed: boolean;
    readonly items: readonly {
      readonly key: string;
      readonly day: string;
      readonly title: string;
      readonly kind: string;
      readonly entityType: string;
      readonly entityId: string;
      readonly establishmentId: string | null;
      readonly establishmentName: string | null;
    }[];
  };
  /**
   * Página 22 · "Resumen financiero": cobrado y pendiente de cobro **del
   * mes en curso**, en céntimos enteros (CLAUDE.md: ni un importe en coma
   * flotante).
   *
   * Sale de `financial_dashboard()`, que es `SECURITY DEFINER` y exige la
   * capacidad `manage_finance` por su cuenta: quien no la tiene recibe un
   * error, no unos ceros. Por eso el estado es uno de tres y no un par de
   * números sueltos — "no puedes verlo", "no se ha podido leer" y "esto
   * es" se leen distinto, y confundirlos manda a alguien a pedir un
   * permiso que ya tiene (§20.7, CA-20).
   */
  readonly finance:
    | { readonly kind: "ok"; readonly collectedCents: number; readonly pendingCents: number }
    | { readonly kind: "no_permission" }
    | { readonly kind: "failed" };
  readonly pendingRequests: number;
  /**
   * `null` cuando NO se ha podido calcular (la consulta de contadores
   * falló). No es lo mismo que cero, y la pantalla no los pinta igual:
   * un cero afirma que no hay ninguno en riesgo, y eso, cuando la
   * consulta ha fallado, es una afirmación que nadie puede hacer (CA-20).
   */
  readonly jobsAtDeadlineRisk: number | null;
  readonly attention: readonly AttentionItem[];
  readonly team: readonly TeamMemberLoad[];
  /** `false` cuando quien mira no puede ver la carga de nadie más (RN-ASG-17). */
  readonly teamLoadAvailable: boolean;
  /**
   * `true` cuando la consulta de la carga falló. §20.7 pide distinguir
   * "sin permiso" de "error": decirle "no tienes permiso" a quien sí lo
   * tiene le manda a pedirle a alguien algo que ya tiene.
   */
  readonly teamLoadFailed: boolean;
  readonly activity: readonly ActivityEntry[];
  /**
   * Decisión 18 · el contador de Menú Diario, en la tarjeta que ya
   * existía. `pending` es `null` si la consulta falló (CA-20: no es un
   * cero) y `offered` dice si el espacio tiene un servicio de ese tipo,
   * porque sin él no hay nada que contar y se dice el motivo.
   */
  readonly dailyMenu: {
    readonly offered: boolean;
    readonly pending: number | null;
    readonly unassigned: number;
    readonly overdue: number;
  };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * El instante en que empieza el mes en curso **en la zona del espacio**,
 * en ISO, para dárselo a la consulta tal cual.
 *
 * No es "el día 1 a las 00:00 UTC", que era lo que decía la primera
 * versión: en Madrid el mes empieza a las 22:00 del último día del mes
 * anterior, así que ese corte metía en la gráfica dos horas de solicitudes
 * que son del mes pasado. `civilDayStartInZone()` ya sabe convertir un día
 * civil en instante y sortear los dos días del año en que la zona cambia
 * de horario.
 */
function inicioDeMes(mes: string, timeZone: string): string {
  // El `??` solo se alcanzaría con una zona que `Intl` no conoce, y la
  // zona sale de `spaces.timezone`: si fuera inválida, `dayKeyInTimeZone`
  // habría lanzado antes de llegar aquí.
  return civilDayStartInZone(`${mes}-01`, timeZone) ?? `${mes}-01T00:00:00.000Z`;
}

interface CounterRow {
  readonly job_id: string;
  readonly job_code: string;
  readonly job_state: string;
  readonly establishment_id: string;
  readonly counter_kind: string;
  readonly category: string | null;
  readonly start_sla_hours: number | null;
  /** RN-SLA-18 (migración 118) · el plazo de realización congelado. */
  readonly execution_sla_hours: number | null;
  readonly timezone: string;
  readonly events: unknown;
}

function toTimerEvents(raw: unknown): readonly TimerEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is { event_type: TimerEventType; occurred_at: string } =>
      typeof e === "object" && e !== null && "event_type" in e && "occurred_at" in e,
    )
    .map((e) => ({ type: e.event_type, occurredAt: new Date(e.occurred_at) }));
}

/**
 * El estado de los dos contadores de un trabajo, recalculado desde sus
 * eventos (CA-10: nunca se lee un contador mutable).
 *
 * RN-CLK-10: el calendario se construye con los festivos que se conocían
 * cuando arrancó el contador, no con los de hoy. Es el mismo criterio que
 * usa el barrido de la cola, y por la misma razón: cambiar un festivo hoy
 * no puede mover hacia atrás un plazo que ya corría.
 */
function counterStatuses(
  rows: readonly CounterRow[],
  holidays: readonly HolidayRecord[],
  now: Date,
): Map<string, { t2?: CounterStatus; t3?: CounterStatus }> {
  const porTrabajo = new Map<string, { t2?: CounterStatus; t3?: CounterStatus }>();

  for (const row of rows) {
    const events = toTimerEvents(row.events);
    if (events.length === 0) continue;

    const startedAt = events.map((e) => e.occurredAt).reduce((a, b) => (a < b ? a : b));
    const calendar = contractualCalendar(row.timezone, holidaysKnownAsOf(holidays, startedAt));

    const actual = porTrabajo.get(row.job_id) ?? {};
    if (row.counter_kind === "t2") {
      // RN-SLA-02 y RN-COM-12: sin plan, Básico o Impulso, 48 h; con Impulso+, Premium o Premium+, 24 h.
      actual.t2 = t2Status(events, calendar, now, row.start_sla_hours === 24);
    } else if (row.category !== null) {
      // RN-SLA-18 · el plazo congelado del trabajo (migración 118).
      actual.t3 = t3Status(
        events,
        calendar,
        now,
        row.category as ChangeCategory,
        row.execution_sla_hours,
      );
    }
    porTrabajo.set(row.job_id, actual);
  }

  return porTrabajo;
}

/**
 * Lo que necesita atención en un espacio, y los trabajos, solicitudes y
 * restaurantes de los que sale.
 *
 * Está separado de `loadSpaceHome()` porque lo usan dos pantallas: el
 * Inicio (§20.4) y el listado de restaurantes (§20.2), cuya columna
 * "Necesita atención" tiene que decir exactamente lo mismo que la lista
 * del Inicio. Calcularlo dos veces sería tener dos definiciones de
 * "urgente" y verlas discrepar en la misma sesión.
 */
export interface SpaceAttention {
  readonly items: readonly AttentionItem[];
  /** `null` cuando los contadores no se han podido leer (ver `SpaceHome`). */
  readonly jobsAtDeadlineRisk: number | null;
  readonly jobsInProgress: number;
  readonly jobsOnTime: number;
  readonly pendingRequests: number;
  readonly establishments: readonly EstablishmentRow[];
  readonly openJobs: readonly JobRow[];
}

interface EstablishmentRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

interface JobRow {
  readonly id: string;
  readonly code: string;
  readonly state: string;
  readonly establishment_id: string;
}

export async function loadSpaceAttention(
  supabase: Supabase,
  spaceId: string,
  spaceSlug: string,
  now: Date = new Date(),
): Promise<SpaceAttention> {
  const [
    { data: establishments },
    { data: requests },
    { data: jobs },
    { data: counters, error: countersError },
    { data: holidayRows },
  ] = await Promise.all([
    supabase.from("establishments").select("id, name, status").eq("space_id", spaceId),
    // `requests` tiene privilegios de columna (CLAUDE.md): se enumeran
    // siempre, `select *` devuelve 403.
    supabase
      .from("requests")
      .select("id, code, description, state, establishment_id, created_at")
      .eq("space_id", spaceId)
      .in("state", [...PENDING_REQUEST_STATES, "correction_requested"]),
    supabase
      .from("jobs")
      .select("id, code, state, establishment_id, created_at")
      .eq("space_id", spaceId)
      .in("state", [...OPEN_JOB_STATES]),
    supabase.rpc("space_job_counters", { p_space_id: spaceId }),
    supabase.from("holidays").select("holiday_date, created_at").eq("space_id", spaceId),
  ]);

  const establishmentName = new Map((establishments ?? []).map((e) => [e.id, e.name]));
  const jobRows = jobs ?? [];
  const requestRows = requests ?? [];

  const holidays: readonly HolidayRecord[] = (holidayRows ?? []).map((row) => ({
    date: row.holiday_date,
    configuredAt: new Date(row.created_at),
  }));

  const statuses = counterStatuses((counters ?? []) as readonly CounterRow[], holidays, now);

  // ------------------------------------------------------------------
  // Trabajos: plazo en riesgo, sin asignar, bloqueados.
  // ------------------------------------------------------------------
  const jobItems: AttentionItem[] = [];
  let atRisk = 0;
  let enCurso = 0;
  let enPlazo = 0;

  for (const job of jobRows) {
    if (!isJobState(job.state)) continue;
    const state: JobState = job.state;
    const establishment = establishmentName.get(job.establishment_id) ?? null;
    const deepLink = `/espacios/${spaceSlug}/trabajos/${job.id}`;
    const { risk, remainingMinutes, counter } = jobDeadlineRisk(state, statuses.get(job.id) ?? {});

    if (state === "in_progress") {
      enCurso += 1;
      if (risk === "none") enPlazo += 1;
    }

    if (risk !== "none") {
      atRisk += 1;
      jobItems.push({
        kind: risk === "out_of_deadline" ? "job_out_of_deadline" : "job_about_to_expire",
        id: job.id,
        title: job.code,
        establishment,
        establishmentId: job.establishment_id,
        deepLink,
        remainingMinutes,
        counter,
        createdAt: job.created_at,
      });
      continue;
    }

    // RN-ASG-05: un trabajo que nadie ha asumido necesita atención aunque
    // su reloj de inicio ni siquiera haya arrancado.
    if (state === "pending_assignment") {
      jobItems.push({
        kind: "job_pending_assignment",
        id: job.id,
        title: job.code,
        establishment,
        establishmentId: job.establishment_id,
        deepLink,
        remainingMinutes: null,
        counter: null,
        createdAt: job.created_at,
      });
    } else if (state === "blocked_by_client") {
      jobItems.push({
        kind: "job_blocked_by_client",
        id: job.id,
        title: job.code,
        establishment,
        establishmentId: job.establishment_id,
        deepLink,
        remainingMinutes: null,
        counter: null,
        createdAt: job.created_at,
      });
    }
  }

  // ------------------------------------------------------------------
  // Solicitudes: pendientes de validar y correcciones pedidas.
  // ------------------------------------------------------------------
  const requestItems: AttentionItem[] = requestRows
    .filter((r) => r.state === "pending_internal_validation" || r.state === "correction_requested")
    .map((r) => ({
      kind:
        r.state === "pending_internal_validation"
          ? ("request_pending_validation" as const)
          : ("request_correction_requested" as const),
      id: r.id,
      title: r.description,
      establishment: establishmentName.get(r.establishment_id) ?? null,
      establishmentId: r.establishment_id,
      deepLink: `/espacios/${spaceSlug}/solicitudes/${r.id}`,
      remainingMinutes: null,
      counter: null,
      createdAt: r.created_at,
    }));

  return {
    items: sortAttentionItems([...jobItems, ...requestItems]),
    // Página 22 del diseño · "Trabajos en curso · N en tiempo". Los dos
    // números salen del mismo recorrido de arriba: `enCurso` son los que
    // están en marcha y `enPlazo`, los que de esos no tienen el plazo en
    // riesgo. Contarlos en otro sitio daría dos cuentas que se separan.
    jobsInProgress: enCurso,
    jobsOnTime: enPlazo,
    // Sin contadores no hay número que dar: decir "0 trabajos próximos a
    // vencer" sería tranquilizar sin haber mirado (CA-20).
    jobsAtDeadlineRisk: countersError === null ? atRisk : null,
    pendingRequests: requestRows.filter((r) =>
      (PENDING_REQUEST_STATES as readonly string[]).includes(r.state),
    ).length,
    establishments: establishments ?? [],
    openJobs: jobRows,
  };
}

/**
 * Cuál de los tres estados del "Resumen financiero" es (página 22).
 *
 * El orden importa: primero el permiso, porque sin `manage_finance` la
 * función SIEMPRE devuelve error y tratarlo como fallo de lectura diría
 * "vuelve a cargar" a quien nunca va a poder verlo.
 */
export function resumenFinanciero(
  canManageFinance: boolean | null,
  error: unknown,
  fila: { collected_cents: number; pending_cents: number } | undefined,
): SpaceHome["finance"] {
  if (canManageFinance !== true) return { kind: "no_permission" };
  if (error !== null || fila === undefined) return { kind: "failed" };
  return {
    kind: "ok",
    collectedCents: fila.collected_cents,
    pendingCents: fila.pending_cents,
  };
}

export async function loadSpaceHome(
  supabase: Supabase,
  spaceId: string,
  spaceSlug: string,
  now: Date = new Date(),
): Promise<SpaceHome> {
  const { data: spaceRow } = await supabase.from("spaces").select("timezone").eq("id", spaceId).maybeSingle();
  const timeZone = spaceRow?.timezone ?? "Europe/Madrid";

  /** Hoy y el mes en curso, **en la zona del espacio** (CLAUDE.md). */
  const hoy = dayKeyInTimeZone(now, timeZone);
  const mesEnCurso = hoy.slice(0, 7);

  const [
    attention,
    { data: teamLoad, error: teamLoadError },
    { data: canAssignJobs },
    { data: events },
    menuQueue,
    { data: ciclos },
    { data: solicitudesDelMes, error: errorSolicitudes },
    { data: trabajosDelMes, error: errorTrabajos },
    { data: proximas, error: errorProximas },
    { data: canManageFinance },
    { data: finanzas, error: errorFinanzas },
  ] = await Promise.all([
    loadSpaceAttention(supabase, spaceId, spaceSlug, now),
    supabase.rpc("space_team_load", { p_space_id: spaceId }),
    // La misma capacidad que comprueba `space_team_load()` por dentro. Se
    // pregunta aquí para poder distinguir dos cosas que se parecen y no lo
    // son: "no puedes ver la carga del equipo" y "no hay equipo". CA-20
    // exige decir cuál de las dos es.
    supabase.rpc("has_capability", { p_space_id: spaceId, p_capability: "assign_jobs" }),
    supabase
      .from("state_events")
      .select("id, entity_type, entity_id, to_state, occurred_at")
      .eq("space_id", spaceId)
      .order("occurred_at", { ascending: false })
      .limit(8),
    loadMenuQueue(supabase, spaceId, timeZone, now),
    /*
      Página 22 · el ciclo de consumo **vigente** de cada restaurante del
      espacio, en una consulta. `cycle_start <= ahora < cycle_end` es lo
      que define "vigente"; los cerrados no se miran porque la bolsa no se
      acumula (RN-COM-06) y la barra dice lo que todavía puede gastar.
    */
    supabase
      .from("consumption_cycles")
      .select(
        "id, establishment_id, cycle_start, cycle_end, included_small, included_photo, included_medium, included_large",
      )
      .eq("space_id", spaceId)
      .lte("cycle_start", now.toISOString())
      .gt("cycle_end", now.toISOString()),
    /*
      Página 22 · "Actividad de mantenimiento", el mes en curso.

      Dos consultas y no una: son dos tablas y dos fechas distintas —cuándo
      se creó la solicitud y cuándo se completó el trabajo—, y juntarlas en
      SQL obligaría a una vista o a un `union` que después habría que
      desentrañar aquí de todos modos.

      Se piden **solo las fechas**: nada de `select *` sobre `requests`,
      que tiene privilegios de columna y devolvería 403 (CLAUDE.md).
    */
    supabase
      .from("requests")
      .select("created_at")
      .eq("space_id", spaceId)
      .gte("created_at", inicioDeMes(mesEnCurso, timeZone))
      .lte("created_at", now.toISOString()),
    supabase
      .from("jobs")
      .select("completed_at")
      .eq("space_id", spaceId)
      .not("completed_at", "is", null)
      .gte("completed_at", inicioDeMes(mesEnCurso, timeZone))
      .lte("completed_at", now.toISOString()),
    /*
      Página 22 · "Próximas tareas". La misma función que pinta el
      calendario completo, sin ninguno de sus tres filtros: de hoy al mismo
      día del mes que viene.

      Es `SECURITY INVOKER`, así que lo que devuelve ya viene filtrado por
      las políticas de RLS de cada tabla con la identidad de quien mira —
      esta pantalla no autoriza nada y no tiene que hacerlo.
    */
    supabase.rpc("space_calendar", {
      p_space_id: spaceId,
      p_from: hoy,
      p_to: shiftMonth(hoy, 1),
      p_establishment_id: undefined,
      p_worker_id: undefined,
      p_kind: undefined,
    }),
    /*
      Página 22 · "Resumen financiero". Se pregunta la capacidad **además**
      de llamar a la función, y no para decidir si llamarla: la función la
      vuelve a comprobar por dentro y es ella quien manda (CLAUDE.md MUST:
      "toda operación se valida en el servidor"). Se pregunta para poder
      distinguir sus dos fracasos, que desde fuera son el mismo error:
      "no tienes permiso" y "no se ha podido leer". Decirle lo primero a
      quien sí lo tiene le manda a pedir algo que ya tiene (§20.7).
    */
    supabase.rpc("has_capability", { p_space_id: spaceId, p_capability: "manage_finance" }),
    supabase.rpc("financial_dashboard", {
      p_space_id: spaceId,
      // Del principio del mes en la zona del espacio hasta ahora: el
      // mismo corte que usa la gráfica de arriba, para que las dos
      // tarjetas hablen del mismo "este mes".
      p_from: inicioDeMes(mesEnCurso, timeZone),
      p_to: now.toISOString(),
    }),
  ]);

  // ------------------------------------------------------------------
  // Carga del equipo. Sin `assign_jobs`, la función solo devuelve la fila
  // de quien pregunta: eso no es "la carga del equipo", así que la
  // pantalla lo dice en vez de enseñar una lista de uno (RN-ASG-17).
  // ------------------------------------------------------------------
  const loadRows = canAssignJobs === true ? (teamLoad ?? []) : [];
  const names = new Map<string, string>();
  if (loadRows.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", loadRows.map((row) => row.user_id));
    for (const p of profiles ?? []) {
      names.set(p.id, p.full_name?.trim() || p.email);
    }
  }

  /*
    Página 22 · la barra de cada restaurante. Los apuntes del ciclo se
    piden en UNA consulta para todos los ciclos vivos del espacio, no una
    por restaurante: en un espacio con veinte locales serían veinte
    vueltas en la pantalla que más se abre.

    Un restaurante sin ciclo vigente **no entra en el mapa**, y abajo se
    lee como `no_cycle`: no es un cero, es que no hay nada que medir.
  */
  const cicloRows = ciclos ?? [];
  const usoPorRestaurante = new Map<string, CycleUsage>();
  if (cicloRows.length > 0) {
    const { data: apuntes } = await supabase
      .from("consumption_entries")
      .select("consumption_cycle_id, category, amount")
      .in(
        "consumption_cycle_id",
        cicloRows.map((c) => c.id),
      );

    for (const ciclo of cicloRows) {
      const suyos = (apuntes ?? []).filter((a) => a.consumption_cycle_id === ciclo.id);
      usoPorRestaurante.set(
        ciclo.establishment_id,
        cycleUsage(
          cycleAllowance(
            {
              includedSmall: ciclo.included_small,
              includedPhoto: ciclo.included_photo,
              includedMedium: ciclo.included_medium,
              includedLarge: ciclo.included_large,
              renewsAt: new Date(ciclo.cycle_end),
            },
            suyos.map((a) => ({
              amount: a.amount,
              category: a.category as ChangeCategory,
            })),
          ),
        ),
      );
    }
  }

  /*
    Página 22 · la serie del mes, día a día y en la zona del espacio
    (CLAUDE.md: las fechas se calculan en la zona horaria del espacio, no
    en la del servidor ni en la del navegador).

    El array se rellena entero desde el día 1 hasta hoy **antes** de contar
    nada, así que un día sin actividad vale 0 y no desaparece de la
    gráfica: una línea que se salta los días vacíos dibuja una pendiente
    que no existió.
  */
  const porDia = new Map<string, { requests: number; jobs: number }>();
  /*
    Los días se cuentan **por su número**, del 1 a hoy, y no sumando 24
    horas a un instante: los dos días del año en que la zona cambia de
    horario, ese salto de 24 h cae una hora antes o después de medianoche
    y repite un día o se salta otro. Aquí todos los días son del mismo mes,
    así que contar es suficiente y no puede desfasarse.
  */
  const ultimoDia = Number(dayKeyInTimeZone(now, timeZone).slice(8, 10));
  for (let dia = 1; dia <= ultimoDia; dia += 1) {
    porDia.set(`${mesEnCurso}-${String(dia).padStart(2, "0")}`, { requests: 0, jobs: 0 });
  }

  for (const fila of solicitudesDelMes ?? []) {
    const clave = dayKeyInTimeZone(new Date(fila.created_at), timeZone);
    const punto = porDia.get(clave);
    if (punto !== undefined) punto.requests += 1;
  }
  for (const fila of trabajosDelMes ?? []) {
    if (fila.completed_at === null) continue;
    const clave = dayKeyInTimeZone(new Date(fila.completed_at), timeZone);
    const punto = porDia.get(clave);
    if (punto !== undefined) punto.jobs += 1;
  }

  const team: TeamMemberLoad[] = loadRows.map((row) => ({
    userId: row.user_id,
    name: names.get(row.user_id) ?? "",
    points: row.load_points,
    level: loadLevel(row.load_points),
  }));

  // ------------------------------------------------------------------
  // Actividad reciente. Sale de `state_events`, el libro inmutable de
  // cambios de estado (RN-DAT-05): no hay ningún resumen guardado aparte
  // que pudiera contar otra cosa.
  //
  // Sin identidad de nadie: la actividad dice QUÉ ha pasado y dónde, no
  // quién lo hizo (CLAUDE.md MUST NOT). Quién hizo qué sale de la
  // auditoría, que tiene su propia pantalla y su propio permiso.
  // ------------------------------------------------------------------
  /*
    RN-EST-18 · las fotos del "Estado por restaurante", en UNA llamada para
    todas: una por fila serían tantos viajes como restaurantes tenga el
    espacio solo para pintar la columna de la izquierda.
  */
  const fotos = await loadEstablishmentPhotos(
    supabase,
    supabase.storage,
    attention.establishments.map((e) => e.id),
  );

  const establishmentName = new Map(attention.establishments.map((e) => [e.id, e.name]));
  const jobById = new Map(attention.openJobs.map((j) => [j.id, j]));
  const activity: ActivityEntry[] = (events ?? []).map((event) => {
    const job = event.entity_type === "job" ? jobById.get(event.entity_id) : undefined;
    return {
      id: event.id,
      entityType: event.entity_type as "job" | "task",
      toState: event.to_state,
      occurredAt: event.occurred_at,
      establishment: job ? establishmentName.get(job.establishment_id) ?? null : null,
      deepLink: job ? `/espacios/${spaceSlug}/trabajos/${job.id}` : null,
    };
  });

  return {
    activeEstablishments: attention.establishments.filter((e) => e.status === "active").length,
    establishmentsTotal: attention.establishments.length,
    restaurants: attention.establishments.map((e) => ({
      id: e.id,
      name: e.name,
      status: e.status,
      usage: usoPorRestaurante.get(e.id) ?? { kind: "no_cycle" as const },
      photoUrl: fotos.get(e.id) ?? null,
    })),
    jobsInProgress: attention.jobsInProgress,
    jobsOnTime: attention.jobsOnTime,
    activityChart: {
      // Si una de las dos consultas falló, la gráfica **no se dibuja a
      // medias**: una línea plana en cero se leería como "no pasó nada".
      failed: errorSolicitudes !== null || errorTrabajos !== null,
      days: [...porDia.entries()].map(([day, punto]) => ({
        day,
        requests: punto.requests,
        jobs: punto.jobs,
      })),
    },
    today: hoy,
    finance: resumenFinanciero(canManageFinance, errorFinanzas, finanzas?.[0]),
    upcoming: {
      failed: errorProximas !== null,
      /*
        Cinco: las que caben en la tarjeta de un teléfono sin convertirla
        en una lista. El resto está en el calendario, que es a donde
        lleva el enlace de la cabecera — recortar aquí no esconde nada.

        `space_calendar()` ya devuelve ordenado por fecha, pero el corte a
        cinco depende de ese orden, así que se vuelve a ordenar aquí en
        vez de confiar en que nadie lo cambie nunca.
      */
      items: [...(proximas ?? [])]
        .sort((a, b) => a.event_date.localeCompare(b.event_date))
        .slice(0, 5)
        .map((evento, indice) => ({
          // Dos eventos distintos pueden compartir entidad y día (una
          // suscripción que renueva y vence a la vez), así que la clave
          // lleva también el tipo y la posición.
          key: `${evento.entity_id}-${evento.kind}-${evento.event_date}-${indice}`,
          day: evento.event_date,
          title: evento.title,
          kind: evento.kind,
          entityType: evento.entity_type,
          entityId: evento.entity_id,
          establishmentId: evento.establishment_id,
          // Un festivo o una ausencia no son de ningún restaurante: ahí
          // va `null` y la fila no escribe una línea vacía debajo.
          establishmentName:
            evento.establishment_id === null
              ? null
              : establishmentName.get(evento.establishment_id) ?? null,
        })),
    },
    pendingRequests: attention.pendingRequests,
    jobsAtDeadlineRisk: attention.jobsAtDeadlineRisk,
    attention: attention.items,
    team,
    teamLoadAvailable: canAssignJobs === true,
    teamLoadFailed: teamLoadError !== null,
    activity,
    dailyMenu: {
      offered: menuQueue.offered,
      pending: menuQueue.rows === null ? null : menuQueue.rows.length,
      unassigned: (menuQueue.rows ?? []).filter((r) => r.state === "pending_assignment").length,
      overdue: (menuQueue.rows ?? []).filter((r) => r.overdue).length,
    },
  };
}

export type { AttentionItem, DeadlineRisk };
