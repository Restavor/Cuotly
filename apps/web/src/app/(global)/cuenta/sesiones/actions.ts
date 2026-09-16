"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type RevokeSessionState = { error: string | null; closed: boolean };

/**
 * HU-05 · cerrar una sesión propia.
 *
 * La comprobación de que la sesión es tuya la hace `revoke_my_session()` en
 * el servidor, no esta acción: CLAUDE.md es explícito en que ocultar un
 * botón no es un control de acceso. Aquí solo se traduce el error.
 */
export async function revokeSession(
  _prev: RevokeSessionState,
  formData: FormData,
): Promise<RevokeSessionState> {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) {
    return { error: null, closed: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_my_session", { p_session_id: sessionId });

  if (error) {
    return { error: error.message, closed: false };
  }

  revalidatePath("/cuenta/sesiones");
  return { error: null, closed: true };
}
