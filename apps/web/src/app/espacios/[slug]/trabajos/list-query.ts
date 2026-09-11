import { compareTeamJobs } from "@/core/priority";
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
 *
 * **El orden lo pone el restaurante** (encargo de Bosco, 11/09/2026).
 * Primero lo que cada restaurante ha marcado como importante, por su
 * puesto; después el resto, lo más reciente arriba. Ordenar en SQL no
 * vale: el orden mira una columna de la solicitud y PostgREST solo ordena
 * el padre por columnas del padre — `order("priority_rank", {
 * referencedTable: "requests" })` ordenaría las solicitudes DENTRO de cada
 * trabajo, que es una sola y por tanto no ordena nada. Así que la lista
 * llega por fecha y la ordena `orderTeamJobs()`, que es lógica pura y
 * tiene sus tests.
 *
 * `select` enumera columnas siempre: `requests` tiene privilegios de
 * columna para que el cliente no vea la identidad del equipo, así que
 * `select *` sobre ella devuelve 403 (CLAUDE.md).
 */
export interface JobListRow {
  readonly id: string;
  readonly code: string;
  readonly state: string;
  readonly category: string | null;
  readonly assigned_to: string | null;
  readonly establishment_id: string;
  readonly created_at: string;
  /**
   * El puesto que le ha dado su restaurante entre sus cambios pendientes,
   * o `null` si no lo ha ordenado o su plan no se lo concede. Se lee para
   * ordenar la bandeja y la tabla lo enseña: un orden que el equipo no
   * pueda explicar es un orden que parece un fallo.
   */
  readonly priority_rank: number | null;
}

export async function loadTeamJobs(
  supabase: Supabase,
  spaceId: string,
  establishmentId?: string,
): Promise<readonly JobListRow[]> {
  const { data } = await supabase
    .from("jobs")
    .select(
      "id, code, state, category, assigned_to, establishment_id, created_at, requests(priority_rank)",
    )
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false });

  const filas = (data ?? []).map(({ requests, ...job }) => ({
    ...job,
    priority_rank: requests?.priority_rank ?? null,
  }));

  const delRestaurante =
    establishmentId === undefined
      ? filas
      : filas.filter((fila) => fila.establishment_id === establishmentId);

  return delRestaurante.sort((a, b) =>
    compareTeamJobs(
      { priorityRank: a.priority_rank, createdAt: a.created_at },
      { priorityRank: b.priority_rank, createdAt: b.created_at },
    ),
  );
}
