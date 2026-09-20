import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

/**
 * Las siete casillas de RN-EST-15, con el nombre que tienen en la base.
 *
 * Están escritas UNA vez y de aquí salen la lista, el formulario y la
 * acción. Es la lección de `state-catalogue.test.ts` aplicada a algo más
 * pequeño: tres copias de siete nombres se separan, y la que se separa es
 * la que deja de guardar una casilla sin que nadie se entere.
 */
export const CLIENT_PERMISSIONS = [
  "create_requests",
  "edit_menus",
  "use_messages",
  "upload_files",
  "view_reports",
  "view_billing",
  "manage_users",
] as const;

export type ClientPermission = (typeof CLIENT_PERMISSIONS)[number];

export interface PanelUser {
  readonly userId: string;
  readonly displayName: string | null;
  readonly email: string;
  /** `group` es un acceso del grupo: no se configura desde este panel. */
  readonly source: "establishment" | "group";
  readonly role: string;
  readonly permissions: Readonly<Record<ClientPermission, boolean>>;
}

export interface PanelUsers {
  readonly rows: readonly PanelUser[];
  /**
   * §20.7 · hay que distinguir "no se pudo mirar" de "no hay nadie". Una
   * lista vacía por un error afirmaría que este restaurante no tiene
   * usuarios, y eso, sin haber podido mirar, no lo sabe nadie. Además
   * aquí sería una afirmación imposible: un restaurante con panel tiene
   * al menos a su Propietario (RN-PAN-10).
   */
  readonly failed: boolean;
}

/**
 * Quién entra en este restaurante, para la pantalla "Usuarios y accesos"
 * del panel (páginas 152 y 153 del diseño definitivo móvil).
 *
 * Sale de `establishment_panel_users()` y no de una consulta a
 * `establishment_memberships` con un embed de `profiles`, porque esa
 * consulta **no devuelve nada**: `profiles_select` no deja que un cliente
 * lea el perfil de otro cliente. Sin la función, la pantalla pintaría
 * uuids.
 *
 * No la confundas con `establishment_client_users()`, que es la de la
 * ficha del EQUIPO: aquella exige `is_space_member()` y le devuelve cero
 * filas a un restaurante mirando su propio panel.
 */
export async function loadPanelUsers(
  supabase: Supabase,
  establishmentId: string,
): Promise<PanelUsers> {
  const { data, error } = await supabase.rpc("establishment_panel_users", {
    p_establishment_id: establishmentId,
  });

  if (error !== null) return { rows: [], failed: true };

  return {
    failed: false,
    rows: (data ?? []).map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      email: row.email,
      source: row.source === "group" ? "group" : "establishment",
      role: row.role,
      permissions: {
        create_requests: row.create_requests,
        edit_menus: row.edit_menus,
        use_messages: row.use_messages,
        upload_files: row.upload_files,
        view_reports: row.view_reports,
        view_billing: row.view_billing,
        manage_users: row.manage_users,
      },
    })),
  };
}

/**
 * RN-PAN-14 · una invitación al panel, tal como la pinta la pantalla.
 *
 * **No lleva quién la mandó ni quién la revisó** (RN-PAN-15): esas
 * columnas ni se piden, porque el privilegio de columna las cierra y
 * pedirlas devolvería 403 para la consulta entera. Al cliente le responde
 * "el equipo de mantenimiento", no una persona.
 */
export interface PanelInvitation {
  readonly id: string;
  readonly email: string;
  readonly role: string;
  readonly status: string;
  readonly expiresAt: string | null;
  readonly rejectionReason: string | null;
  readonly createdAt: string;
}

export interface PanelInvitations {
  readonly rows: readonly PanelInvitation[];
  /** §20.7 · "no se pudo mirar" no es "no hay ninguna". */
  readonly failed: boolean;
}

/**
 * Las invitaciones vivas de un restaurante: las que están esperando a que
 * el equipo las mire y las aprobadas que todavía nadie ha aceptado.
 *
 * Las resueltas —aceptadas, canceladas— no se listan: una aceptada ya es
 * una persona de la lista de arriba, y repetirla como invitación haría
 * pensar que hay algo pendiente. Un **rechazo sí se queda**, porque quien
 * invitó tiene que leer el motivo; desaparece cuando vuelve a intentarlo.
 *
 * `select` enumera columnas **a la fuerza**: `establishment_invitations`
 * tiene el select revocado y `select *` devuelve 403 (RN-PAN-15).
 */
export async function loadPanelInvitations(
  supabase: Supabase,
  establishmentId: string,
): Promise<PanelInvitations> {
  const { data, error } = await supabase
    .from("establishment_invitations")
    .select("id, email, role, status, expires_at, rejection_reason, created_at")
    .eq("establishment_id", establishmentId)
    .in("status", ["pending_review", "approved", "rejected"])
    .order("created_at", { ascending: false });

  if (error !== null) return { rows: [], failed: true };

  return {
    failed: false,
    rows: (data ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      // RN-PAN-14 · una aprobada con la fecha pasada ya no vale, aunque la
      // columna siga diciendo `approved`. Se deriva aquí igual que en
      // `establishment_invitation_status()`: enseñar "aprobada" sobre un
      // enlace muerto haría esperar a quien invitó.
      status:
        row.status === "approved" && row.expires_at !== null && new Date(row.expires_at) <= new Date()
          ? "expired"
          : row.status,
      expiresAt: row.expires_at,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at,
    })),
  };
}
