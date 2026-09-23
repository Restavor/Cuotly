import type { SupabaseClient } from "@supabase/supabase-js";

import { loadSubscriptionRevision } from "@/app/espacios/[slug]/planes/revision-load";
import { loadSubscriptionTerms } from "@/app/espacios/[slug]/planes/terms-load";
import type { Database } from "@/lib/supabase/database.types";

/**
 * R23 y R24 · lo que el restaurante tiene contratado, leído con su sesión.
 *
 * El nombre del plan sale de las condiciones (`subscription_terms()`),
 * porque el restaurante no lee `plans`; lo que incluye y lo que lleva
 * gastado, de la bolsa del ciclo (`establishment_cycle_allowance()`). La
 * permanencia y un cambio programado solo los ve quien puede ver los pagos
 * (sus políticas son `client_can_view_billing()`): para los demás salen
 * vacíos y la pantalla no los enseña.
 */
export async function loadClientPlan(supabase: SupabaseClient<Database>, establishmentId: string) {
  const [{ data: subs }, { data: bolsas }, { data: menu }, { data: compromisos }, { data: cambios }] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select("id, kind")
        .eq("establishment_id", establishmentId)
        .eq("status", "active")
        .order("kind", { ascending: true }),
      supabase.rpc("establishment_cycle_allowance", { p_establishment_id: establishmentId }),
      supabase.rpc("menu_update_balance", { p_establishment_id: establishmentId }),
      supabase
        .from("plan_commitments")
        .select("id, subscription_id, ends_at")
        .eq("establishment_id", establishmentId)
        .order("ends_at", { ascending: false })
        .limit(5),
      supabase
        .from("scheduled_plan_changes")
        .select("id, direction, effective_at, state")
        .eq("establishment_id", establishmentId)
        .eq("state", "pending")
        .order("effective_at", { ascending: true })
        .limit(1),
    ]);

  const condiciones = await Promise.all(
    (subs ?? []).map(async (s) => ({
      subscriptionId: s.id,
      kind: s.kind,
      terms: await loadSubscriptionTerms(supabase, s.id),
      // RN-COM-22 a 24 · si hay versión nueva de lo que tiene, y qué cambia.
      revision: await loadSubscriptionRevision(supabase, s.id, s.kind === "service" ? "service" : "plan"),
    })),
  );
  const plan = condiciones.find((c) => c.kind === "plan") ?? null;
  const compromiso = plan ? ((compromisos ?? []).find((c) => c.subscription_id === plan.subscriptionId) ?? null) : null;

  return {
    conditions: condiciones.map(({ subscriptionId, terms }) => ({ subscriptionId, terms })),
    revisions: condiciones.flatMap(({ subscriptionId, terms, revision }) =>
      revision === null ? [] : [{ subscriptionId, name: terms?.subjectName ?? null, revision }],
    ),
    plan,
    allowance: bolsas ?? [],
    menuBalance: menu?.[0] ?? null,
    commitmentEndsAt: compromiso?.ends_at ?? null,
    scheduledChange: cambios?.[0] ?? null,
  };
}
