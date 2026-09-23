import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface GroupRow {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly created_at: string;
}

/**
 * Los grupos del espacio, con su descripción (migración 135).
 *
 * **Por qué hay un segundo intento.** La web se publica al subir la rama y
 * la migración se aplica aparte, así que durante un rato puede haber código
 * que pide `groups.description` contra una base que todavía no la tiene.
 * Entonces PostgREST contesta con error de columna, y sin este segundo
 * intento la pantalla de Grupos se quedaría en "no se pudo leer" para todo
 * el mundo. Se vuelve a pedir sin la columna y se dice que la 135 no está
 * (`rn20Available: false`), para que la pantalla no pinte los formularios
 * de crear, editar y asignar, que llamarían a funciones que aún no existen.
 *
 * Cualquier otro fallo se devuelve como fallo: "no se pudo leer" no es "no
 * hay ninguno" (CA-20).
 */
export async function loadGroups(
  supabase: Supabase,
  spaceId: string,
): Promise<{ rows: readonly GroupRow[]; failed: boolean; rn20Available: boolean }> {
  const conDescripcion = await supabase
    .from("groups")
    .select("id, name, description, created_at")
    .eq("space_id", spaceId)
    .order("name");

  if (conDescripcion.error === null) {
    return { rows: conDescripcion.data ?? [], failed: false, rn20Available: true };
  }

  const sinDescripcion = await supabase
    .from("groups")
    .select("id, name, created_at")
    .eq("space_id", spaceId)
    .order("name");

  if (sinDescripcion.error !== null) return { rows: [], failed: true, rn20Available: false };

  return {
    rows: (sinDescripcion.data ?? []).map((row) => ({ ...row, description: null })),
    failed: false,
    rn20Available: false,
  };
}
