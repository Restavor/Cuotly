import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Qué solicitudes hay en la bandeja del equipo y **en qué orden**, en un
 * solo sitio.
 *
 * Existe por el paginador "1 de 3" del detalle (maqueta 05). Ese paginador
 * se quedó sin hacer porque exige que el detalle y el listado estén de
 * acuerdo en dos cosas —qué filas entran y cómo se ordenan—, y tenerlo
 * escrito dos veces es la manera de que un día el "siguiente" del detalle
 * lleve a otro sitio que el siguiente de la lista. Con una sola definición
 * no pueden discrepar: si mañana la bandeja se ordena por vencimiento, el
 * paginador se entera solo.
 *
 * **Aquí no hay ni un filtro de permisos.** Los pone RLS: un trabajador ve
 * las de sus establecimientos autorizados y el propietario las del espacio
 * entero (CLAUDE.md: filtrar aquí duplicaría la regla, y dos copias de una
 * regla acaban discrepando).
 *
 * `select` enumera columnas siempre: `requests` tiene privilegios de
 * columna para que el cliente no vea la identidad del equipo, así que
 * `select *` devuelve 403.
 */
export interface RequestListRow {
  readonly id: string;
  readonly code: string;
  readonly description: string;
  readonly state: string;
  readonly created_at: string;
  readonly validated_category: string | null;
  readonly establishment_id: string;
}

/**
 * El borrador NO entra: es del cliente y todavía no se ha enviado, así que
 * no hay nada que el equipo tenga que atender (RN-SLA-01: T1 arranca al
 * enviar).
 */
export async function loadTeamRequests(
  supabase: Supabase,
  spaceId: string,
  establishmentId?: string,
): Promise<readonly RequestListRow[]> {
  const { data } = await supabase
    .from("requests")
    .select("id, code, description, state, created_at, validated_category, establishment_id")
    .eq("space_id", spaceId)
    .neq("state", "draft")
    .order("created_at", { ascending: false });

  const filas = data ?? [];
  return establishmentId === undefined
    ? filas
    : filas.filter((fila) => fila.establishment_id === establishmentId);
}
