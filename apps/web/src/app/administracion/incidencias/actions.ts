"use server";

import { revalidatePath } from "next/cache";

import { isIncidentState } from "@/core/support";
import { createClient } from "@/lib/supabase/server";
import { postIncidentMessage, setIncidentStatus } from "@/services/support-gateway";

import type { AdminActionState } from "../action-state";

/**
 * Las acciones de la bandeja de incidencias (Fase 4, Hito 21).
 *
 * Ninguna autoriza nada: `set_incident_status()` y `post_incident_message()`
 * deciden de qué lado habla quien llama con `incident_side_of_caller()`,
 * que exige `is_platform_member()` —con la 2FA dentro— para hablar como
 * Cuotly. Aquí solo se traduce la negativa a un mensaje en pantalla.
 */
function mensaje(fallo: unknown): string {
  return fallo instanceof Error ? fallo.message : String(fallo);
}

function texto(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** RN-SOP-04 · mover una incidencia, desde el lado de Cuotly. */
export async function moveIncident(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const incidentId = texto(formData, "incidentId");
  const status = texto(formData, "status");
  const reason = texto(formData, "reason");
  if (!incidentId || !isIncidentState(status)) return { error: "Estado desconocido", done: false };

  try {
    const supabase = await createClient();
    await setIncidentStatus(supabase, incidentId, status, reason || null);
    revalidatePath("/administracion/incidencias");
    return { error: null, done: true };
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }
}

/** RN-SOP-08 · contestar, como Cuotly. */
export async function replyIncident(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const incidentId = texto(formData, "incidentId");
  const body = texto(formData, "body");
  if (!incidentId || !body) return { error: "Escribe el mensaje", done: false };

  try {
    const supabase = await createClient();
    await postIncidentMessage(supabase, incidentId, body);
    revalidatePath("/administracion/incidencias");
    return { error: null, done: true };
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }
}
