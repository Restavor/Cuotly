import { contractualCalendar, holidaysKnownAsOf, type HolidayRecord } from "@/core/business-clock";
import {
  jobDeadlineRisk,
  OPEN_JOB_STATES,
  PENDING_REQUEST_STATES,
  sortAttentionItems,
  type AttentionItem,
  type DeadlineRisk,
} from "@/core/home";
import { isJobState, type JobState } from "@/core/job-states";
import { loadLevel, type LoadLevel } from "@/core/load-points";
import { t2Status, t3Status, type CounterStatus } from "@/core/sla-timers";
import type { TimerEvent, TimerEventType } from "@/core/timer-events";
import type { ChangeCategory } from "@/core/classification-rules";
import type { createClient } from "@/lib/supabase/server";

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
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

interface CounterRow {
  readonly job_id: string;
  readonly job_code: string;
  readonly job_state: string;
  readonly establishment_id: string;
  readonly counter_kind: string;
  readonly category: string | null;
  readonly start_sla_hours: number | null;
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
      // RN-SLA-02 y RN-COM-12: sin plan, 48 h; con Impulso o Premium, 24 h.
      actual.t2 = t2Status(events, calendar, now, row.start_sla_hours === 24);
    } else if (row.category !== null) {
      actual.t3 = t3Status(events, calendar, now, row.category as ChangeCategory);
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

  for (const job of jobRows) {
    if (!isJobState(job.state)) continue;
    const state: JobState = job.state;
    const establishment = establishmentName.get(job.establishment_id) ?? null;
    const deepLink = `/espacios/${spaceSlug}/trabajos/${job.id}`;
    const { risk, remainingMinutes, counter } = jobDeadlineRisk(state, statuses.get(job.id) ?? {});

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

export async function loadSpaceHome(
  supabase: Supabase,
  spaceId: string,
  spaceSlug: string,
  now: Date = new Date(),
): Promise<SpaceHome> {
  const [
    attention,
    { data: teamLoad, error: teamLoadError },
    { data: canAssignJobs },
    { data: events },
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
    pendingRequests: attention.pendingRequests,
    jobsAtDeadlineRisk: attention.jobsAtDeadlineRisk,
    attention: attention.items,
    team,
    teamLoadAvailable: canAssignJobs === true,
    teamLoadFailed: teamLoadError !== null,
    activity,
  };
}

export type { AttentionItem, DeadlineRisk };
