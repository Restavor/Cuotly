import { isMenuState, type MenuState } from "@/core/menu-states";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * La cola de Menú Diario del equipo (Fase 2, Hito 11), leída en un solo
 * sitio del que tiran la pantalla de la cola y el contador del Inicio
 * (decisión 18): así el número de la tarjeta no puede discrepar de las
 * filas de la lista.
 *
 * Es un adaptador, no lógica de negocio. Las filas y su orden los devuelve
 * `team_menu_queue()`, que filtra con las mismas funciones que las
 * políticas de RLS. El corte y la garantía que también devuelve ya no se
 * enseñan: desde la decisión 85 no hay hora de corte (RN-CRE-24).
 */
export interface MenuQueueRow {
  readonly menuId: string;
  readonly establishmentId: string;
  readonly establishmentName: string;
  readonly name: string;
  readonly kind: string;
  readonly targetDate: string;
  readonly state: MenuState;
  readonly requestedAt: string | null;
  readonly isAssigned: boolean;
  /** Solo quien gestiona, o el propio asignado, sabe quién (RN-ASG-17). */
  readonly assignedTo: string | null;
  readonly assignmentMode: string | null;
  readonly publicationId: string | null;
  readonly pendingCorrections: number;
}

export interface MenuQueue {
  /**
   * Si el espacio ofrece Menú Diario: un servicio de ese tipo o un plan que
   * lo incluye (RN-CRE-21). CA-20: sin él no hay cero que enseñar.
   */
  readonly offered: boolean;
  /** `null` cuando la consulta falló: no es lo mismo que una cola vacía. */
  readonly rows: readonly MenuQueueRow[] | null;
}

export async function loadMenuQueue(
  supabase: Supabase,
  spaceId: string,
): Promise<MenuQueue> {
  const [{ data: services }, { data: plans }, { data, error }] = await Promise.all([
    supabase.from("services").select("id").eq("space_id", spaceId).eq("kind", "daily_menu").limit(1),
    supabase.from("plans").select("id").eq("space_id", spaceId).eq("includes_daily_menu", true).limit(1),
    supabase.rpc("team_menu_queue", { p_space_id: spaceId }),
  ]);
  const offered = (services ?? []).length > 0 || (plans ?? []).length > 0;

  if (error) return { offered, rows: null };

  const rows: MenuQueueRow[] = (data ?? [])
    .filter((row) => isMenuState(row.state))
    .map((row) => {
      const state = row.state as MenuState;
      return {
        menuId: row.menu_id,
        establishmentId: row.establishment_id,
        establishmentName: row.establishment_name,
        name: row.name,
        kind: row.kind,
        targetDate: row.target_date,
        state,
        requestedAt: row.requested_at ?? null,
        isAssigned: row.is_assigned,
        assignedTo: row.assigned_to ?? null,
        assignmentMode: row.assignment_mode ?? null,
        publicationId: row.publication_id ?? null,
        pendingCorrections: row.pending_corrections,
      };
    });

  return { offered, rows };
}
