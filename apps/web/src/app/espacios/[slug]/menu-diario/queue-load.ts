import { isPublicationOverdue } from "@/core/daily-menu";
import { isMenuState, type MenuState } from "@/core/menu-states";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * La cola de Menú Diario del equipo (Fase 2, Hito 11), leída en un solo
 * sitio del que tiran la pantalla de la cola y el contador del Inicio
 * (decisión 18): así el número de la tarjeta no puede discrepar de las
 * filas de la lista.
 *
 * Es un adaptador, no lógica de negocio. Las filas, su orden, el corte y
 * la garantía los devuelve `team_menu_queue()`, que filtra con las mismas
 * funciones que las políticas de RLS (RN-MEN-07, RN-DAT-05). Lo único que
 * se calcula aquí es "pasada de hora", con `isPublicationOverdue()` de
 * `src/core/daily-menu.ts`, porque depende de la hora en que se mira.
 */
export interface MenuQueueRow {
  readonly menuId: string;
  readonly establishmentId: string;
  readonly establishmentName: string;
  readonly name: string;
  readonly kind: string;
  readonly targetDate: string;
  readonly state: MenuState;
  readonly cutoffAt: string;
  readonly publishByAt: string;
  readonly requestedAt: string | null;
  readonly guaranteed: boolean | null;
  readonly isAssigned: boolean;
  /** Solo quien gestiona, o el propio asignado, sabe quién (RN-ASG-17). */
  readonly assignedTo: string | null;
  readonly assignmentMode: string | null;
  readonly publicationId: string | null;
  readonly pendingCorrections: number;
  /** §62: garantizada antes de las 08:00 y todavía sin publicar. */
  readonly overdue: boolean;
}

export interface MenuQueue {
  /** Si el espacio ofrece algún servicio de tipo Menú Diario (CA-20: sin él no hay cero que enseñar). */
  readonly offered: boolean;
  /** `null` cuando la consulta falló: no es lo mismo que una cola vacía. */
  readonly rows: readonly MenuQueueRow[] | null;
}

export async function loadMenuQueue(
  supabase: Supabase,
  spaceId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<MenuQueue> {
  const [{ data: services }, { data, error }] = await Promise.all([
    supabase.from("services").select("id").eq("space_id", spaceId).eq("kind", "daily_menu").limit(1),
    supabase.rpc("team_menu_queue", { p_space_id: spaceId }),
  ]);

  if (error) return { offered: (services ?? []).length > 0, rows: null };

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
        cutoffAt: row.cutoff_at,
        publishByAt: row.publish_by_at,
        requestedAt: row.requested_at ?? null,
        guaranteed: row.guaranteed ?? null,
        isAssigned: row.is_assigned,
        assignedTo: row.assigned_to ?? null,
        assignmentMode: row.assignment_mode ?? null,
        publicationId: row.publication_id ?? null,
        pendingCorrections: row.pending_corrections,
        overdue: isPublicationOverdue({
          now,
          targetDate: row.target_date,
          timezone,
          guaranteed: row.guaranteed ?? null,
          published: state === "published",
        }),
      };
    });

  return { offered: (services ?? []).length > 0, rows };
}
