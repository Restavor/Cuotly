import { contractualCalendar, holidaysKnownAsOf, type HolidayRecord } from "@/core/business-clock";
import { counterIsRunning, consumptionEstimate, type ConsumptionEstimate } from "@/core/requests";
import { t1Status, type CounterStatus } from "@/core/sla-timers";
import type { ChangeCategory } from "@/core/consumption-ledger";
import type { CycleBag } from "@/core/establishments";
import type { TimerEvent, TimerEventType } from "@/core/timer-events";
import type { createClient } from "@/lib/supabase/server";

/**
 * Lo que la pantalla de una solicitud enseña al equipo (§20.4, HU-11 a
 * HU-14), leído del servidor.
 *
 * Es un adaptador: consulta, junta y le pasa los números a
 * `src/core/requests.ts` y a `src/core/sla-timers.ts`, que son quienes
 * deciden. Aquí no hay ni un umbral ni una regla de negocio — si aparece
 * una, está en el sitio equivocado (CLAUDE.md).
 *
 * **Ningún filtro de permisos escrito a mano.** Lo que vuelve lo decide
 * RLS: `classifications` solo la lee el equipo del espacio (RN-CLS-04),
 * `timer_events` igual, y `audit_log` se filtra sola por la visibilidad de
 * la fila a la que apunta (migración 49). Si un cliente forzara esta
 * dirección no vería nada de esto, y no porque la pantalla lo esconda.
 *
 * Las columnas se enumeran SIEMPRE: `requests`, `files` y `file_versions`
 * tienen privilegios de columna para que el cliente no vea la identidad
 * del equipo, así que `select *` devuelve 403 (CLAUDE.md).
 */
type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface RequestDetailRow {
  readonly id: string;
  readonly code: string;
  readonly description: string;
  readonly context: string | null;
  readonly state: string;
  readonly created_at: string;
  readonly validated_category: string | null;
  readonly validated_summary: string | null;
  readonly validated_at: string | null;
  readonly rejected_reason: string | null;
  /** El plazo congelado al aceptar (RN-COM-15/17). `null` hasta entonces. */
  readonly accepted_start_sla_hours: number | null;
  readonly establishment_id: string;
  readonly space_id: string;
}

/** La propuesta del clasificador (RN-CLS-01/02/04), tal y como se guardó. */
export interface RequestProposal {
  readonly category: ChangeCategory;
  readonly summary: string;
  /** 'ai' o 'rules'. RN-CLS-02 obliga a decir cuál de los dos fue. */
  readonly source: string;
  readonly fallbackReason: string | null;
  readonly createdAt: string;
}

/** Un adjunto de la solicitud, con su versión vigente (RN-ARC-03). */
export interface RequestAttachment {
  readonly fileId: string;
  readonly name: string;
  readonly fileName: string | null;
  readonly mimeType: string | null;
  readonly sizeBytes: number | null;
}

/** Una línea del historial, salida del libro de auditoría (§21.2, CA-15). */
export interface RequestHistoryEntry {
  readonly id: string;
  readonly action: string;
  readonly occurredAt: string;
  readonly actor: string | null;
  readonly reason: string | null;
}

/**
 * El reloj de primera atención (T1, RN-SLA-01/02/03) de esta solicitud.
 *
 * `status` es `null` cuando T1 no ha arrancado todavía —una solicitud en
 * borrador no tiene reloj— y eso no se pinta como "quedan 0": se dice que
 * no ha empezado.
 */
export interface RequestCounter {
  readonly status: CounterStatus | null;
  readonly running: boolean;
  /** 24 h con Impulso o Premium, 48 h sin plan o con Básico (RN-SLA-02, RN-COM-12). */
  readonly acceleratedSla: boolean;
}

export interface RequestDetail {
  readonly request: RequestDetailRow;
  readonly establishment: { readonly id: string; readonly name: string; readonly code: string } | null;
  readonly proposal: RequestProposal | null;
  readonly attachments: readonly RequestAttachment[];
  /**
   * `true` cuando la consulta de adjuntos falló. No es lo mismo que "no
   * lleva ninguno", y la pantalla no lo dice igual (CA-20).
   */
  readonly attachmentsFailed: boolean;
  readonly history: readonly RequestHistoryEntry[];
  readonly counter: RequestCounter;
  readonly estimate: ConsumptionEstimate | null;
  readonly job: { readonly id: string; readonly code: string; readonly state: string } | null;
  readonly canManage: boolean;
}

function toTimerEvents(
  rows: readonly { readonly event_type: string; readonly occurred_at: string }[],
): readonly TimerEvent[] {
  return rows.map((row) => ({
    type: row.event_type as TimerEventType,
    occurredAt: new Date(row.occurred_at),
  }));
}

/**
 * El estado de T1 recalculado desde sus eventos (CA-10: nunca se lee un
 * contador mutable).
 *
 * RN-CLK-10 · el calendario se construye con los festivos que se conocían
 * cuando arrancó el contador, no con los de hoy: cambiar un festivo hoy no
 * puede mover hacia atrás un plazo que ya corría.
 */
function counterFromEvents(
  events: readonly TimerEvent[],
  timezone: string,
  holidays: readonly HolidayRecord[],
  acceleratedSla: boolean,
  now: Date,
): RequestCounter {
  if (events.length === 0) return { status: null, running: false, acceleratedSla };

  const startedAt = events.map((e) => e.occurredAt).reduce((a, b) => (a < b ? a : b));
  const calendar = contractualCalendar(timezone, holidaysKnownAsOf(holidays, startedAt));

  return {
    status: t1Status(events, calendar, now, acceleratedSla),
    running: counterIsRunning(events),
    acceleratedSla,
  };
}

export async function loadRequestDetail(
  supabase: Supabase,
  requestId: string,
  now: Date = new Date(),
): Promise<RequestDetail | null> {
  const { data: request } = await supabase
    .from("requests")
    .select(
      "id, code, description, context, state, created_at, validated_category, validated_summary, validated_at, rejected_reason, accepted_start_sla_hours, establishment_id, space_id",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return null;

  const [
    { data: establishment },
    { data: space },
    { data: classification },
    { data: links, error: linksError },
    { data: timerRows },
    { data: holidayRows },
    { data: auditRows },
    { data: job },
    { data: canManage },
    { data: allowance },
    { data: subscriptions },
  ] = await Promise.all([
    supabase
      .from("establishments")
      .select("id, name, code")
      .eq("id", request.establishment_id)
      .maybeSingle(),
    supabase.from("spaces").select("id, timezone").eq("id", request.space_id).maybeSingle(),
    // RN-CLS-04 · lo que propuso el clasificador y lo que decidió la
    // persona se guardan los dos. El último intento es el que se valida.
    supabase
      .from("classifications")
      .select("proposed_category, proposed_summary, source, fallback_reason, created_at")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Los adjuntos viven en el catálogo desde el Hito 7: `request_attachments`
    // se vuelca a `files` con un enlace de tipo 'request' (migración 25),
    // así que preguntar por el catálogo los trae todos —los de HU-10 y los
    // que arrastró una conversión (RN-MSG-10)— y no la mitad.
    supabase.from("file_links").select("file_id").eq("entity_type", "request").eq("entity_id", requestId),
    supabase
      .from("timer_events")
      .select("event_type, occurred_at")
      .eq("entity_type", "request")
      .eq("entity_id", requestId)
      .eq("counter_kind", "t1")
      .order("occurred_at", { ascending: true }),
    supabase.from("holidays").select("holiday_date, created_at").eq("space_id", request.space_id),
    // §21.2 · el historial de una solicitud no es una tabla propia: es su
    // rastro en el libro de auditoría, que es el que ya guarda actor,
    // fecha, valor anterior, valor nuevo y motivo (CA-15).
    supabase
      .from("audit_log")
      .select("id, action, created_at, actor_id, reason")
      .eq("entity_type", "request")
      .eq("entity_id", requestId)
      .order("created_at", { ascending: true }),
    supabase.from("jobs").select("id, code, state").eq("request_id", requestId).maybeSingle(),
    supabase.rpc("has_capability", {
      p_space_id: request.space_id,
      p_capability: "manage_requests",
    }),
    supabase.rpc("establishment_cycle_allowance", {
      p_establishment_id: request.establishment_id,
    }),
    supabase
      .from("subscriptions")
      .select("kind, status, plans (start_sla_hours)")
      .eq("establishment_id", request.establishment_id)
      .eq("status", "active"),
  ]);

  // --------------------------------------------------------------
  // Adjuntos. `files` y `file_versions` tienen columnas revocadas
  // (quién lo subió es identidad del equipo): se enumeran las que sí.
  // --------------------------------------------------------------
  const fileIds = [...new Set((links ?? []).map((link) => link.file_id))];

  const { data: files } = fileIds.length
    ? await supabase.from("files").select("id, name, created_at").in("id", fileIds).order("created_at")
    : { data: [] as { id: string; name: string; created_at: string }[] };

  const { data: versions } = fileIds.length
    ? await supabase
        .from("file_versions")
        .select("file_id, version_number, file_name, mime_type, size_bytes")
        .in("file_id", fileIds)
        .order("version_number", { ascending: false })
    : { data: [] as { file_id: string; version_number: number; file_name: string; mime_type: string; size_bytes: number }[] };

  const vigente = new Map<string, { file_name: string; mime_type: string; size_bytes: number }>();
  for (const version of versions ?? []) {
    if (!vigente.has(version.file_id)) {
      vigente.set(version.file_id, {
        file_name: version.file_name,
        mime_type: version.mime_type,
        size_bytes: version.size_bytes,
      });
    }
  }

  const attachments: RequestAttachment[] = (files ?? []).map((file) => ({
    fileId: file.id,
    name: file.name,
    fileName: vigente.get(file.id)?.file_name ?? null,
    mimeType: vigente.get(file.id)?.mime_type ?? null,
    sizeBytes: vigente.get(file.id)?.size_bytes ?? null,
  }));

  // --------------------------------------------------------------
  // Historial. Quién hizo qué sale de `audit_log` y de `profiles`,
  // nunca de una columna de la solicitud (CLAUDE.md, CA-04).
  // --------------------------------------------------------------
  const actorIds = [...new Set((auditRows ?? []).map((row) => row.actor_id).filter(Boolean))] as string[];

  const { data: people } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };

  const nombre = new Map((people ?? []).map((p) => [p.id, p.full_name?.trim() || p.email] as const));

  const history: RequestHistoryEntry[] = (auditRows ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    occurredAt: row.created_at,
    actor: row.actor_id === null ? null : (nombre.get(row.actor_id) ?? null),
    reason: row.reason,
  }));

  // --------------------------------------------------------------
  // T1 y consumo estimado.
  // --------------------------------------------------------------
  const holidays: readonly HolidayRecord[] = (holidayRows ?? []).map((row) => ({
    date: row.holiday_date,
    configuredAt: new Date(row.created_at),
  }));

  // RN-SLA-02 · la duración la decide el plan vigente del establecimiento,
  // leído de su suscripción, nunca supuesta aquí. Sin plan activo son 48 h
  // (RN-COM-12: se comporta como Básico).
  //
  // El `coalesce` con el plazo congelado al aceptar es el mismo que hace
  // `sla_sweep_counters()` (migración 41) para T2 y T3, y por la misma
  // razón (RN-COM-15/17): cambiar de plan no mueve un plazo que ya corría.
  // En T1 casi siempre gana el plan —el plazo se congela al aceptar, y
  // para entonces T1 ya paró—, pero si algún día deja de ser así, esta
  // pantalla y el barrido seguirán diciendo el mismo número.
  const planSubscription = (subscriptions ?? []).find((s) => s.kind === "plan") ?? null;
  const slaHours =
    request.accepted_start_sla_hours ?? planSubscription?.plans?.start_sla_hours ?? null;
  const acceleratedSla = slaHours === 24;

  const counter = counterFromEvents(
    toTimerEvents(timerRows ?? []),
    space?.timezone ?? "Europe/Madrid",
    holidays,
    acceleratedSla,
    now,
  );

  const bags: readonly CycleBag[] = (allowance ?? []).map((line) => ({
    category: line.category as ChangeCategory,
    included: line.included,
    remaining: line.remaining,
  }));

  // La categoría que se va a consumir es la validada si ya la hay, y si no
  // la propuesta: antes de validar, lo que costará depende de lo que se
  // valide (RN-CLS-03).
  const categoria = (request.validated_category ??
    classification?.proposed_category ??
    null) as ChangeCategory | null;

  return {
    request: request as RequestDetailRow,
    establishment: establishment ?? null,
    proposal:
      classification === null
        ? null
        : {
            category: classification.proposed_category as ChangeCategory,
            summary: classification.proposed_summary,
            source: classification.source,
            fallbackReason: classification.fallback_reason,
            createdAt: classification.created_at,
          },
    attachments,
    attachmentsFailed: Boolean(linksError),
    history,
    counter,
    estimate: categoria === null ? null : consumptionEstimate(categoria, bags),
    job: job ?? null,
    canManage: Boolean(canManage),
  };
}
