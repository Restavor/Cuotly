import type { createClient } from "@/lib/supabase/server";
import { loadEstablishmentPhotos } from "@/services/establishment-photo";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * M84 · un restaurante archivado, con lo que la tabla y el panel enseñan.
 */
export interface ArchivedEstablishment {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly city: string | null;
  /**
   * Cuándo se archivó y con qué motivo, del último paso a `archived` en
   * `state_events` (lo escribe `set_establishment_status()`). `null` si
   * quien mira no puede leer ese evento —`state_events_select` se lo deja
   * a quien reparte trabajos— o si no hay ninguno: la pantalla lo dice, no
   * pone una fecha supuesta (CA-20).
   */
  readonly archivedAt: string | null;
  readonly archiveReason: string | null;
  /** El plan de su última suscripción de plan, esté como esté. */
  readonly lastPlanName: string | null;
  readonly photoUrl: string | null;
}

export async function loadArchivedEstablishments(
  supabase: Supabase,
  spaceId: string,
): Promise<readonly ArchivedEstablishment[]> {
  // Qué restaurantes se ven lo decide RLS sobre `establishments`. Los que
  // Cuotly eliminó definitivamente desde su panel ya no salen (RN-ADM-24):
  // siguen en la base, pero aquí no hay nada que hacer con ellos.
  const { data: establishments } = await supabase
    .from("establishments")
    .select("id, name, code, city")
    .eq("space_id", spaceId)
    .eq("status", "archived")
    .is("permanently_deleted_at", null)
    .order("name");

  const filas = establishments ?? [];
  if (filas.length === 0) return [];
  const ids = filas.map((row) => row.id);

  const [{ data: events }, { data: subscriptions }, fotos] = await Promise.all([
    supabase
      .from("state_events")
      .select("entity_id, occurred_at, reason")
      .eq("space_id", spaceId)
      .eq("entity_type", "establishment")
      .eq("to_state", "archived")
      .in("entity_id", ids)
      .order("occurred_at", { ascending: false }),
    // `subscriptions` tiene privilegios de columna (migración 27): se
    // enumeran, `select *` devolvería 403.
    supabase
      .from("subscriptions")
      .select("establishment_id, started_at, plans (name)")
      .eq("space_id", spaceId)
      .eq("kind", "plan")
      .in("establishment_id", ids)
      .order("started_at", { ascending: false }),
    loadEstablishmentPhotos(supabase, supabase.storage, ids),
  ]);

  // La primera de cada restaurante es la más reciente: las dos consultas
  // van ordenadas de la última a la primera.
  const archivo = new Map<string, { at: string; reason: string | null }>();
  for (const event of events ?? []) {
    if (!archivo.has(event.entity_id)) {
      archivo.set(event.entity_id, { at: event.occurred_at, reason: event.reason });
    }
  }
  const plan = new Map<string, string | null>();
  for (const subscription of subscriptions ?? []) {
    if (!plan.has(subscription.establishment_id)) {
      plan.set(subscription.establishment_id, subscription.plans?.name ?? null);
    }
  }

  return filas.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    city: row.city,
    archivedAt: archivo.get(row.id)?.at ?? null,
    archiveReason: archivo.get(row.id)?.reason ?? null,
    lastPlanName: plan.get(row.id) ?? null,
    photoUrl: fotos.get(row.id) ?? null,
  }));
}
