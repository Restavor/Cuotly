import { isRevisionState, type RevisionState } from "@/core/plan-catalogue";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * RN-COM-22 a 24 · la versión nueva pendiente de una suscripción y qué
 * cambia, término a término. Lo leen la ficha del equipo (M56) y el panel
 * del restaurante: las dos funciones comprueban quién pregunta, y al
 * restaurante `revision_diff()` no le devuelve el turno en la cola
 * (RN-COM-03). `null` es que está en la versión vigente.
 */
export interface SubscriptionRevision {
  readonly kind: "plan" | "service";
  readonly currentRevision: number;
  readonly headRevision: number;
  readonly headPublishedAt: string;
  readonly movesAt: string | null;
  readonly harms: boolean;
  readonly accepted: boolean;
  readonly state: RevisionState;
  /** `null` si la comparativa no se pudo leer. */
  readonly changes: readonly {
    readonly field: string;
    readonly oldValue: string | null;
    readonly newValue: string | null;
    readonly better: boolean;
  }[] | null;
}

export async function loadSubscriptionRevision(
  supabase: Supabase,
  subscriptionId: string,
  kind: "plan" | "service",
): Promise<SubscriptionRevision | null> {
  const { data, error } = await supabase.rpc("subscription_revision", { p_subscription_id: subscriptionId });
  const row = data?.[0];
  if (error || !row || !isRevisionState(row.state)) return null;

  const diff = await supabase.rpc("revision_diff", { p_kind: kind, p_from: row.current_id, p_to: row.head_id });
  return {
    kind,
    currentRevision: row.current_revision,
    headRevision: row.head_revision,
    headPublishedAt: row.head_published_at,
    movesAt: row.moves_at,
    harms: row.harms,
    accepted: row.accepted,
    state: row.state,
    changes: diff.error
      ? null
      : (diff.data ?? []).map((d) => ({ field: d.field, oldValue: d.old_value, newValue: d.new_value, better: d.better })),
  };
}
