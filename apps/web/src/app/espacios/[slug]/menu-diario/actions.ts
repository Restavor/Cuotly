"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import type { TeamMenuActionState } from "./action-state";

const t = es.dailyMenuTeam;

/**
 * Las acciones del equipo sobre un menú (Fase 2, Hito 11; RN-MEN-06).
 *
 * **Ninguna autoriza nada.** Cada una llama a la función del servidor
 * (migraciones 77 y 79), que comprueba quién puede —el asignado, el
 * propietario o un administrador; para asignar, `assign_jobs`; para
 * devolver, `manage_requests`— y en qué estado. Si la pantalla enseñó un
 * botón que no tocaba, la función lanza y el error se pinta (CLAUDE.md:
 * ocultar un botón no es un control de acceso). Todas son idempotentes en
 * el servidor (CA-17): dos pulsaciones, un efecto.
 */
async function afterRpc(error: { message: string } | null): Promise<TeamMenuActionState> {
  if (error) return { error: error.message, done: false, notice: null };
  revalidatePath("/espacios", "layout");
  return { error: null, done: true, notice: t.done };
}

export async function assignMenuPublication(
  menuId: string,
  _prev: TeamMenuActionState,
  formData: FormData,
): Promise<TeamMenuActionState> {
  const workerId = String(formData.get("workerId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!workerId) return { error: es.states.errorDescription, done: false, notice: null };

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_menu_publication", {
    p_menu_id: menuId,
    p_worker_id: workerId,
    p_reason: reason || undefined,
  });
  return afterRpc(error);
}

export async function requestMenuInformation(
  menuId: string,
  _prev: TeamMenuActionState,
  formData: FormData,
): Promise<TeamMenuActionState> {
  const reason = String(formData.get("reason") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_menu_information", { p_menu_id: menuId, p_reason: reason });
  return afterRpc(error);
}

export async function markMenuPublished(menuId: string): Promise<TeamMenuActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_menu_published", { p_menu_id: menuId });
  return afterRpc(error);
}

export async function reportMenuPublicationError(
  menuId: string,
  _prev: TeamMenuActionState,
  formData: FormData,
): Promise<TeamMenuActionState> {
  const reason = String(formData.get("reason") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_menu_publication_error", { p_menu_id: menuId, p_reason: reason });
  return afterRpc(error);
}

export async function refundMenuUpdate(
  publicationId: string,
  _prev: TeamMenuActionState,
  formData: FormData,
): Promise<TeamMenuActionState> {
  const reason = String(formData.get("reason") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("refund_menu_update", { p_publication_id: publicationId, p_reason: reason });
  return afterRpc(error);
}

export async function openMenuTeamErrorCorrection(
  menuId: string,
  _prev: TeamMenuActionState,
  formData: FormData,
): Promise<TeamMenuActionState> {
  const description = String(formData.get("description") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("open_menu_team_error_correction", {
    p_menu_id: menuId,
    p_description: description,
  });
  return afterRpc(error);
}

export async function completeMenuCorrection(
  correctionId: string,
  _prev: TeamMenuActionState,
  formData: FormData,
): Promise<TeamMenuActionState> {
  const note = String(formData.get("note") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_menu_correction", {
    p_correction_id: correctionId,
    p_note: note || undefined,
  });
  return afterRpc(error);
}
