import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Qué trabajos hay en la bandeja del equipo y **en qué orden**, en un solo
 * sitio: del que leen el listado y el paginador "1 de 5" del detalle
 * (maqueta 06).
 *
 * Mismo motivo que su hermana de solicitudes: tener el orden escrito dos
 * veces es la manera de que un día el "siguiente" del detalle lleve a otro
 * sitio que el siguiente de la lista. Con una definición sola no pueden
 * discrepar.
 *
 * **Aquí no hay ni un filtro de permisos.** Los pone RLS: un trabajador ve
 * los de sus establecimientos autorizados y el propietario los del espacio
 * entero. Filtrar aquí duplicaría la regla, y dos copias de una regla
 * acaban discrepando (CLAUDE.md).
 */
export interface JobListRow {
  readonly id: string;
  readonly code: string;
  readonly state: string;
  readonly category: string | null;
  readonly assigned_to: string | null;
  readonly establishment_id: string;
  readonly created_at: string;
}

export async function loadTeamJobs(
  supabase: Supabase,
  spaceId: string,
  establishmentId?: string,
): Promise<readonly JobListRow[]> {
  const { data } = await supabase
    .from("jobs")
    .select("id, code, state, category, assigned_to, establishment_id, created_at")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false });

  const filas = data ?? [];
  return establishmentId === undefined
    ? filas
    : filas.filter((fila) => fila.establishment_id === establishmentId);
}
