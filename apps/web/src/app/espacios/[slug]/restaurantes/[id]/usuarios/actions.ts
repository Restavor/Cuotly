"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
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

export type ReviewInvitationState = { error: string | null; done: boolean };

/**
 * RN-PAN-14 · el equipo del espacio aprueba o rechaza una invitación al
 * panel. Es lo que Bosco pidió: *"el restaurante invita, tú apruebas"*.
 *
 * **Lo que esta acción NO decide**, y conviene que siga siendo así:
 *
 *   · Quién puede revisar. Lo comprueba `review_establishment_invitation()`:
 *     solo `manage_clients`. Un restaurante que llame a esta acción a mano
 *     recibe la excepción del servidor — la pantalla no le pinta el botón,
 *     pero eso es cortesía, no la barrera (CLAUDE.md).
 *   · Si la transición vale. La tabla de estados la rechaza si ya estaba
 *     resuelta, y aprobar dos veces devuelve lo mismo sin mover la
 *     caducidad ni volver a avisar (CA-17).
 *
 * El motivo del rechazo **sí** se comprueba aquí además de en el servidor,
 * y no es una duplicación inútil: sin esto, quien deja el campo vacío
 * recibe la excepción cruda de la base en vez de una frase que se entiende.
 * La barrera sigue estando abajo.
 */
export async function reviewPanelInvitation(
  _prev: ReviewInvitationState,
  formData: FormData,
): Promise<ReviewInvitationState> {
  const invitationId = String(formData.get("invitationId") ?? "");
  const approve = String(formData.get("decision") ?? "") === "approve";
  const reason = String(formData.get("reason") ?? "").trim();

  if (!invitationId) return { error: null, done: false };
  if (!approve && reason === "") {
    return { error: es.establishmentSheet.invitations.rejectReasonRequired, done: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_establishment_invitation", {
    p_invitation_id: invitationId,
    p_approve: approve,
    p_reason: approve ? undefined : reason,
  });

  if (error) return { error: error.message, done: false };

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/**
 * RN-PAN-14 · cancelar una invitación que todavía no se ha aceptado.
 *
 * De quien la mandó o del equipo, y eso lo decide la función. Cancelar
 * algo ya resuelto devuelve `false` sin decir en qué quedó: la pantalla
 * se limita a recargar, porque contar por esta vía lo que la fila no
 * enseña sería un oráculo.
 */
export async function cancelPanelInvitation(
  _prev: ReviewInvitationState,
  formData: FormData,
): Promise<ReviewInvitationState> {
  const invitationId = String(formData.get("invitationId") ?? "");
  if (!invitationId) return { error: null, done: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_establishment_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) return { error: error.message, done: false };

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}
