import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Un paso del estado del restaurante, del más reciente al más antiguo. */
export interface StatusHistoryEntry {
  readonly state: string;
  readonly at: string;
  /** El motivo que alguien escribió al cambiarlo (RN-EST-08), o `null`. */
  readonly reason: string | null;
  /** El alta, que no es un cambio de estado: el restaurante nace "Configurando". */
  readonly created: boolean;
}

/**
 * M74 · "Historial de estados": los pasos del estado del restaurante.
 *
 * Salen de `state_events`, que escribe `set_establishment_status_internal()`
 * en cada cambio —a mano o del barrido del ciclo de vida—, y del alta, que
 * no deja evento porque el restaurante nace "Configurando" (migración 3).
 *
 * **Aquí no se comprueba ningún permiso.** `state_events_select` se lo deja
 * a quien reparte trabajos. Si la lectura vuelve vacía o falla se devuelve
 * `null` y la ficha no pinta el panel: una línea de tiempo con solo el alta
 * diría que el estado nunca cambió, y no lo sabemos (CA-20).
 */
export async function loadStatusHistory(
  supabase: Supabase,
  spaceId: string,
  establishmentId: string,
): Promise<readonly StatusHistoryEntry[] | null> {
  const [{ data: eventos, error }, { data: alta }] = await Promise.all([
    supabase
      .from("state_events")
      .select("to_state, occurred_at, reason")
      .eq("space_id", spaceId)
      .eq("entity_type", "establishment")
      .eq("entity_id", establishmentId)
      .order("occurred_at", { ascending: false }),
    supabase.from("establishments").select("created_at").eq("id", establishmentId).maybeSingle(),
  ]);

  if (error || !eventos || eventos.length === 0) return null;

  const pasos: StatusHistoryEntry[] = eventos.map((evento) => ({
    state: evento.to_state,
    at: evento.occurred_at,
    reason: evento.reason,
    created: false,
  }));
  if (alta?.created_at) {
    pasos.push({ state: "configuring", at: alta.created_at, reason: null, created: true });
  }
  return pasos;
}
