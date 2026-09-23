import { AUDIT_FAMILIES, auditDayWindow } from "@/core/audit";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * M62 · los filtros del registro de auditoría y la consulta que los
 * aplica. La usan la pantalla y la exportación, para que el CSV lleve
 * exactamente las filas que se ven con los mismos filtros.
 *
 * Qué filas llegan lo decide la política de `audit_log` (§21.2, migración
 * 49), no esto: el propietario ve su espacio entero; un administrador, la
 * operativa; un trabajador, sus propias acciones.
 */
export interface AuditFilters {
  readonly family: string | null;
  readonly from: string | null;
  readonly to: string | null;
  /** Quién hizo la acción (`actor_id`). */
  readonly actor: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function readAuditFilters(
  params: { familia?: string | null; desde?: string | null; hasta?: string | null; usuario?: string | null; mias?: string | null },
  userId: string,
): AuditFilters {
  const usuario = params.mias === "1" ? userId : (params.usuario ?? null);
  return {
    family: params.familia && AUDIT_FAMILIES.includes(params.familia) ? params.familia : null,
    from: params.desde && DAY.test(params.desde) ? params.desde : null,
    to: params.hasta && DAY.test(params.hasta) ? params.hasta : null,
    actor: usuario && UUID.test(usuario) ? usuario : null,
  };
}

/** La dirección con los filtros puestos, para paginar y exportar sin perderlos. */
export function auditQueryString(filters: AuditFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  if (filters.family) q.set("familia", filters.family);
  if (filters.from) q.set("desde", filters.from);
  if (filters.to) q.set("hasta", filters.to);
  if (filters.actor) q.set("usuario", filters.actor);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}

export type AuditRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  reason: string | null;
};

export async function loadAuditRows(
  supabase: Supabase,
  spaceId: string,
  timeZone: string,
  filters: AuditFilters,
  range: { readonly from: number; readonly to: number },
): Promise<{ readonly rows: readonly AuditRow[]; readonly count: number; readonly failed: boolean }> {
  const ventana = auditDayWindow(filters.from, filters.to, timeZone);
  let consulta = supabase
    .from("audit_log")
    .select("id, created_at, actor_id, action, entity_type, entity_id, old_value, new_value, reason", { count: "exact" })
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })
    .range(range.from, range.to);

  if (filters.family !== null) consulta = consulta.like("action", `${filters.family}.%`);
  if (ventana.from !== null) consulta = consulta.gte("created_at", ventana.from);
  if (ventana.to !== null) consulta = consulta.lt("created_at", ventana.to);
  if (filters.actor !== null) consulta = consulta.eq("actor_id", filters.actor);

  const { data, count, error } = await consulta;
  return { rows: (data ?? []) as AuditRow[], count: count ?? 0, failed: error !== null };
}

/** Los nombres de quienes aparecen, leídos de `profiles` con columnas enumeradas. */
export async function loadActorNames(
  supabase: Supabase,
  actorIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (actorIds.length === 0) return new Map();
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", [...actorIds]);
  return new Map((data ?? []).map((p) => [p.id, p.full_name?.trim() || p.email] as const));
}
