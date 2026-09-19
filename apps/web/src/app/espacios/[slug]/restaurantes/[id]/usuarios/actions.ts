"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import { CLIENT_PERMISSIONS } from "./users-load";

export type SavePermissionsState = { error: string | null; saved: boolean };

/**
 * Guardar las siete casillas de un Editor (RN-EST-15, decisiones 51 y 52).
 *
 * **Lo que esta acción NO decide**, y conviene que siga siendo así:
 *
 *   · Quién puede guardar. Lo comprueba `set_establishment_permissions()`:
 *     el equipo con `manage_clients`, o quien tenga "Usuarios y accesos"
 *     dentro del panel. Llamar a esta acción a mano sin permiso recibe la
 *     excepción del servidor, porque ocultar un botón no es un control de
 *     acceso (CLAUDE.md).
 *   · Que al **Propietario** no se le configuran: también lo rechaza la
 *     función, con su mensaje. La pantalla no le pinta el botón, pero eso
 *     es cortesía, no la barrera.
 *
 * Las siete van juntas en una llamada porque juntas se eligen y porque
 * así no hay un instante con la mitad puestas. Una casilla que no llega
 * en el formulario es `false`: eso es lo que significa desmarcarla, y es
 * justo lo que hace un `<input type="checkbox">` — por eso se recorre
 * `CLIENT_PERMISSIONS` entero y no las claves que trae el formulario.
 */
export async function saveClientPermissions(
  _prev: SavePermissionsState,
  formData: FormData,
): Promise<SavePermissionsState> {
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const userId = String(formData.get("userId") ?? "");

  if (!establishmentId || !userId) return { error: null, saved: false };

  const permissions = Object.fromEntries(
    CLIENT_PERMISSIONS.map((name) => [name, formData.get(name) !== null]),
  );

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_establishment_permissions", {
    p_establishment_id: establishmentId,
    p_user_id: userId,
    p_permissions: permissions,
  });

  if (error) return { error: error.message, saved: false };

  revalidatePath(`/espacios`, "layout");
  return { error: null, saved: true };
}
