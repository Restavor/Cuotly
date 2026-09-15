"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import type { SettingsState } from "../action-state";

/**
 * RN-CIC-05 · transferir la propiedad. Quién puede, a quién y qué pasa
 * con cada rol lo decide `transfer_space_ownership()`; aquí se recoge el
 * destinatario, el motivo y la clave de idempotencia (RN-CIC-14).
 *
 * §140 pide "confirmación adicional" para propiedad y eliminación: el
 * formulario obliga a escribir el nombre del espacio, y eso se comprueba
 * **aquí y en el servidor de la pantalla**, nunca solo en el navegador.
 */
export async function transferOwnership(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const spaceId = String(formData.get("spaceId") ?? "").trim();
  const spaceName = String(formData.get("spaceName") ?? "").trim();
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const toUserId = String(formData.get("toUserId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();

  if (!spaceId || !toUserId) {
    return { error: es.spaceOwnership.transferValidation, done: false, unchanged: false };
  }
  if (confirmation !== spaceName) {
    return { error: es.spaceOwnership.confirmationMismatch, done: false, unchanged: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_space_ownership", {
    p_space_id: spaceId,
    p_to_user_id: toUserId,
    p_reason: reason || undefined,
    p_idempotency_key: idempotencyKey || undefined,
  });
  if (error) return { error: error.message, done: false, unchanged: false };

  revalidatePath("/espacios", "layout");
  return { error: null, done: true, unchanged: false };
}

/**
 * RN-CIC-07/08/09 · archivar el espacio. §127: primero se archiva, es
 * recuperable 30 días y después se PROGRAMA la eliminación. Nada se
 * borra: el borrado es del bloque legal (§170.1, pendiente 20).
 */
export async function archiveSpace(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const spaceId = String(formData.get("spaceId") ?? "").trim();
  const spaceName = String(formData.get("spaceName") ?? "").trim();
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();

  if (!spaceId || !reason) {
    return { error: es.spaceOwnership.archiveValidation, done: false, unchanged: false };
  }
  if (confirmation !== spaceName) {
    return { error: es.spaceOwnership.confirmationMismatch, done: false, unchanged: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_space_by_owner", {
    p_space_id: spaceId,
    p_reason: reason,
    p_idempotency_key: idempotencyKey || undefined,
  });
  if (error) return { error: error.message, done: false, unchanged: false };

  revalidatePath("/espacios", "layout");
  return { error: null, done: true, unchanged: false };
}

/** RN-CIC-08 · restaurar, dentro de los 30 días. */
export async function restoreSpace(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const spaceId = String(formData.get("spaceId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();

  if (!spaceId) {
    return { error: es.spaceOwnership.archiveValidation, done: false, unchanged: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_space_by_owner", {
    p_space_id: spaceId,
    p_reason: reason || undefined,
    p_idempotency_key: idempotencyKey || undefined,
  });
  if (error) return { error: error.message, done: false, unchanged: false };

  revalidatePath("/espacios", "layout");
  return { error: null, done: true, unchanged: false };
}
