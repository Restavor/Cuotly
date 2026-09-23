import type { SupabaseClient } from "@supabase/supabase-js";

import { isSupervisionCurrent } from "@/core/team-calendar";
import type { AbsenceSpan } from "@/core/team-roster";
import type { Database } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

/**
 * Lo que leen las cuatro pestañas de Equipo (M69 a M72).
 *
 * Nada de esto decide quién ve qué. Las filas las filtra RLS
 * (`is_space_member` en miembros, supervisiones, restaurantes autorizados,
 * especialidades, disponibilidad y ausencias; `invite_member` en las
 * invitaciones), y un restaurante no es miembro del espacio: todas le
 * devuelven cero filas. La carga en puntos sale de `space_team_load()`,
 * que exige `assign_jobs` por dentro; aquí se pregunta la capacidad solo
 * para distinguir "no puedes verla" de "no hay nadie" (CA-20).
 */

export interface TeamEstablishment {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
}

export interface TeamMember {
  readonly userId: string;
  readonly name: string;
  readonly email: string | null;
  readonly role: string;
  readonly status: string;
  /** Cuándo entró en el espacio (`space_memberships.created_at`). */
  readonly since: string;
  /** La marca de la fila; para saber si puede realizar trabajos, `canPerformJobs()`. */
  readonly adminCanPerformJobs: boolean;
  readonly canApproveReports: boolean;
  readonly specialties: readonly string[];
  readonly establishmentIds: readonly string[];
  /** `null` cuando no se puede calcular (sin `assign_jobs` o error). */
  readonly loadPoints: number | null;
  /** RN-ASG-10 · lo declarado; quien nunca ha declarado nada cuenta como disponible. */
  readonly available: boolean;
  readonly availabilityNote: string | null;
}

export interface CurrentSupervision {
  readonly id: string;
  readonly workerId: string;
  readonly adminId: string;
  readonly kind: "principal" | "substitute";
  readonly endsAt: string | null;
}

export interface TeamData {
  readonly members: readonly TeamMember[];
  readonly establishments: readonly TeamEstablishment[];
  readonly supervisions: readonly CurrentSupervision[];
  readonly caps: {
    readonly manageSpace: boolean;
    readonly invite: boolean;
    readonly assignJobs: boolean;
  };
  /** Si la carga en puntos se ha podido leer. */
  readonly loadState: "ok" | "no_permission" | "failed";
}

function nameOf(profile: { full_name: string | null; email: string | null } | null): string {
  return profile?.full_name?.trim() || profile?.email || "—";
}

export async function loadTeam(supabase: Supabase, spaceId: string, now: Date = new Date()): Promise<TeamData> {
  const [
    { data: memberships },
    { data: establishments },
    { data: assigned },
    { data: specialties },
    { data: availability },
    { data: supervisions },
    { data: manageSpace },
    { data: invite },
    { data: assignJobs },
  ] = await Promise.all([
    supabase
      .from("space_memberships")
      .select("user_id, role, status, created_at, can_perform_jobs, can_approve_reports, profiles (full_name, email)")
      .eq("space_id", spaceId)
      .order("created_at"),
    supabase.from("establishments").select("id, name, status").eq("space_id", spaceId).order("name"),
    supabase
      .from("worker_establishments")
      .select("user_id, establishment_id")
      .eq("space_id", spaceId)
      .is("revoked_at", null),
    supabase
      .from("worker_specialties")
      .select("user_id, specialty")
      .eq("space_id", spaceId)
      .is("revoked_at", null),
    supabase.from("worker_availability").select("user_id, available, note").eq("space_id", spaceId),
    supabase
      .from("supervisions")
      .select("id, worker_id, admin_id, kind, starts_at, ends_at, revoked_at")
      .eq("space_id", spaceId),
    supabase.rpc("has_capability", { p_space_id: spaceId, p_capability: "manage_space" }),
    supabase.rpc("has_capability", { p_space_id: spaceId, p_capability: "invite_member" }),
    supabase.rpc("has_capability", { p_space_id: spaceId, p_capability: "assign_jobs" }),
  ]);

  let loadState: TeamData["loadState"] = "no_permission";
  const load = new Map<string, number>();
  if (assignJobs === true) {
    const { data, error } = await supabase.rpc("space_team_load", { p_space_id: spaceId });
    loadState = error ? "failed" : "ok";
    for (const row of data ?? []) load.set(row.user_id, row.load_points);
  }

  const establishmentsOf = new Map<string, string[]>();
  for (const row of assigned ?? []) {
    establishmentsOf.set(row.user_id, [...(establishmentsOf.get(row.user_id) ?? []), row.establishment_id]);
  }
  const specialtiesOf = new Map<string, string[]>();
  for (const row of specialties ?? []) {
    specialtiesOf.set(row.user_id, [...(specialtiesOf.get(row.user_id) ?? []), row.specialty]);
  }
  const availabilityOf = new Map((availability ?? []).map((a) => [a.user_id, a]));

  return {
    members: (memberships ?? []).map((m) => ({
      userId: m.user_id,
      name: nameOf(m.profiles),
      email: m.profiles?.email ?? null,
      role: m.role,
      status: m.status,
      since: m.created_at,
      adminCanPerformJobs: m.can_perform_jobs,
      canApproveReports: m.can_approve_reports,
      specialties: [...(specialtiesOf.get(m.user_id) ?? [])].sort(),
      establishmentIds: establishmentsOf.get(m.user_id) ?? [],
      loadPoints: loadState === "ok" ? (load.get(m.user_id) ?? 0) : null,
      available: availabilityOf.get(m.user_id)?.available ?? true,
      availabilityNote: availabilityOf.get(m.user_id)?.note ?? null,
    })),
    establishments: (establishments ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      archived: e.status === "archived",
    })),
    // La vigencia, con el criterio de RN-SUP-04 en `src/core/`.
    supervisions: (supervisions ?? [])
      .filter((s) =>
        isSupervisionCurrent(now, { startsAt: s.starts_at, endsAt: s.ends_at, revokedAt: s.revoked_at }),
      )
      .map((s) => ({
        id: s.id,
        workerId: s.worker_id,
        adminId: s.admin_id,
        kind: s.kind === "substitute" ? "substitute" : "principal",
        endsAt: s.ends_at,
      })),
    caps: { manageSpace: manageSpace === true, invite: invite === true, assignJobs: assignJobs === true },
    loadState,
  };
}

export interface PendingInvitation {
  readonly id: string;
  readonly email: string;
  readonly role: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly token: string;
}

/** M71 · las pendientes. La política de `space_invitations` pide `invite_member`. */
export async function loadPendingInvitations(
  supabase: Supabase,
  spaceId: string,
): Promise<readonly PendingInvitation[] | null> {
  const { data, error } = await supabase
    .from("space_invitations")
    .select("id, email, role, created_at, expires_at, token")
    .eq("space_id", spaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) return null;
  return data.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    token: row.token,
  }));
}

export interface HistoryEntry {
  readonly id: string;
  readonly action: string;
  readonly at: string;
  readonly actorId: string | null;
}

/**
 * M70 · "Historial de cambios" de una persona: lo que el servidor auditó
 * sobre su pertenencia (`membership.*`, cuya `entity_id` es la persona) y
 * sobre las supervisiones en las que es el trabajador. `audit_log_select`
 * decide qué filas llegan: el propietario las ve todas.
 */
export async function loadMemberHistory(
  supabase: Supabase,
  spaceId: string,
  userId: string,
): Promise<readonly HistoryEntry[] | null> {
  const [membership, supervision] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id, action, created_at, actor_id")
      .eq("space_id", spaceId)
      .eq("entity_type", "space_membership")
      .eq("entity_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("audit_log")
      .select("id, action, created_at, actor_id")
      .eq("space_id", spaceId)
      .eq("entity_type", "supervision")
      .eq("new_value->>worker_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (membership.error || supervision.error) return null;
  return [...membership.data, ...supervision.data]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20)
    .map((row) => ({ id: row.id, action: row.action, at: row.created_at, actorId: row.actor_id }));
}

export interface AbsenceRow extends AbsenceSpan {
  readonly id: string;
  readonly reason: string | null;
}

/** M72 · las ausencias pedidas o aprobadas que terminan a partir de `from`. */
export async function loadAbsences(
  supabase: Supabase,
  spaceId: string,
  from: string,
): Promise<readonly AbsenceRow[] | null> {
  const { data, error } = await supabase
    .from("absences")
    .select("id, user_id, starts_on, ends_on, state, reason")
    .eq("space_id", spaceId)
    .in("state", ["requested", "approved"])
    .gte("ends_on", from)
    .order("starts_on");
  if (error) return null;
  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    state: row.state,
    reason: row.reason,
  }));
}

export interface PendingReassignment {
  readonly id: string;
  readonly kind: "task" | "job";
  readonly label: string;
  /** Quién la pidió: en un trabajo, a quién está asignado. */
  readonly personId: string | null;
  readonly at: string | null;
  readonly href: string;
}

/**
 * M72 · "Reasignaciones pendientes": las de tarea
 * (`task_reassignment_requests` en `pending`, §37) y los trabajos en
 * `reassignment_requested`. Cada una lleva a donde se resuelve: la tarea
 * dentro de su trabajo, o la ficha del trabajo.
 */
export async function loadPendingReassignments(
  supabase: Supabase,
  spaceId: string,
  slug: string,
): Promise<readonly PendingReassignment[] | null> {
  const [tasks, jobs] = await Promise.all([
    supabase
      .from("task_reassignment_requests")
      .select("id, task_id, requested_by, requested_at, tasks (title, job_id)")
      .eq("space_id", spaceId)
      .eq("state", "pending")
      .order("requested_at"),
    supabase
      .from("jobs")
      .select("id, code, assigned_to")
      .eq("space_id", spaceId)
      .eq("state", "reassignment_requested"),
  ]);
  if (tasks.error || jobs.error) return null;

  // La fecha de un trabajo es la de su paso a `reassignment_requested`.
  const jobIds = jobs.data.map((j) => j.id);
  const since = new Map<string, string>();
  if (jobIds.length > 0) {
    const { data: events } = await supabase
      .from("state_events")
      .select("entity_id, occurred_at")
      .eq("entity_type", "job")
      .eq("to_state", "reassignment_requested")
      .in("entity_id", jobIds)
      .order("occurred_at", { ascending: false });
    for (const e of events ?? []) if (!since.has(e.entity_id)) since.set(e.entity_id, e.occurred_at);
  }

  const base = `/espacios/${slug}`;
  return [
    ...tasks.data.map((r) => ({
      id: r.id,
      kind: "task" as const,
      label: r.tasks?.title ?? "—",
      personId: r.requested_by,
      at: r.requested_at,
      href: r.tasks?.job_id ? `${base}/trabajos/${r.tasks.job_id}/tareas?tarea=${r.task_id}` : `${base}/tareas`,
    })),
    ...jobs.data.map((j) => ({
      id: j.id,
      kind: "job" as const,
      label: j.code,
      personId: j.assigned_to,
      at: since.get(j.id) ?? null,
      href: `${base}/trabajos/${j.id}`,
    })),
  ];
}
