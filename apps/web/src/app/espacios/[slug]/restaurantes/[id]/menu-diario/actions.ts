"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { linesToItems, parsePriceToCents } from "@/core/daily-menu";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import type { MenuActionState } from "./action-state";

const t = es.dailyMenuClient;

/**
 * Las acciones del restaurante sobre sus menús (Fase 2, Hito 10).
 *
 * **Ninguna autoriza nada.** Cada una llama a la función del servidor de
 * la migración 77, que comprueba quién puede (`can_write_menus()`), en
 * qué estado se puede y qué consume; si la pantalla enseñó un botón que
 * no tocaba, la función lanza y el error se pinta (CLAUDE.md: ocultar un
 * botón no es un control de acceso).
 *
 * La petición de publicación lleva una clave de idempotencia que genera
 * la pantalla al pintarse: pulsar dos veces, o reenviar el formulario,
 * devuelve la misma publicación y consume una sola actualización
 * (RN-CON-07, CA-17).
 */
export async function createMenu(
  slug: string,
  establishmentId: string,
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "daily");
  const targetDate = String(formData.get("targetDate") ?? "");
  const templateId = String(formData.get("templateId") ?? "");

  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return { error: t.newValidation, done: false, notice: null };
  }

  const supabase = await createClient();
  const { data: menuId, error } = await supabase.rpc("create_menu", {
    p_establishment_id: establishmentId,
    p_name: name,
    p_kind: kind,
    p_target_date: targetDate,
    p_template_id: templateId || undefined,
  });

  if (error || !menuId) {
    return { error: error?.message ?? es.states.errorDescription, done: false, notice: null };
  }

  revalidatePath("/espacios", "layout");
  redirect(`/espacios/${slug}/restaurantes/${establishmentId}/menu-diario/${menuId}`);
}

export async function saveMenuVersion(
  menuId: string,
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const priceCents = parsePriceToCents(String(formData.get("price") ?? ""));
  if (priceCents === undefined) {
    return { error: t.priceInvalid, done: false, notice: null };
  }

  const supabase = await createClient();
  const { data: versionId, error } = await supabase.rpc("save_menu_version", {
    p_menu_id: menuId,
    p_starters: [...linesToItems(String(formData.get("starters") ?? ""))],
    p_mains: [...linesToItems(String(formData.get("mains") ?? ""))],
    p_desserts: [...linesToItems(String(formData.get("desserts") ?? ""))],
    p_drink: String(formData.get("drink") ?? "").trim() || undefined,
    p_price_cents: priceCents ?? undefined,
    p_note: String(formData.get("note") ?? "").trim() || undefined,
  });

  if (error || !versionId) {
    return { error: error?.message ?? es.states.errorDescription, done: false, notice: null };
  }

  // RN-MEN-07: si la versión llegó después del corte, se dice aquí mismo.
  const { data: version } = await supabase
    .from("menu_versions")
    .select("after_cutoff")
    .eq("id", versionId)
    .maybeSingle();

  revalidatePath("/espacios", "layout");
  return {
    error: null,
    done: true,
    notice: version?.after_cutoff ? t.savedAfterCutoff : t.savedVersion,
  };
}

export async function updateMenuDetails(
  menuId: string,
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "daily");
  const targetDate = String(formData.get("targetDate") ?? "");
  const templateId = String(formData.get("templateId") ?? "");

  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return { error: t.newValidation, done: false, notice: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_menu_details", {
    p_menu_id: menuId,
    p_name: name,
    p_kind: kind,
    p_target_date: targetDate,
    // La función admite null ("sin plantilla"); el tipo generado no lo
    // sabe porque el parámetro no tiene valor por omisión en la 77.
    p_template_id: (templateId || null) as unknown as string,
  });

  if (error) return { error: error.message, done: false, notice: null };

  revalidatePath("/espacios", "layout");
  return { error: null, done: true, notice: t.savedDetails };
}

async function afterRpc(error: { message: string } | null): Promise<MenuActionState> {
  if (error) return { error: error.message, done: false, notice: null };
  revalidatePath("/espacios", "layout");
  return { error: null, done: true, notice: t.done };
}

export async function prepareMenu(menuId: string): Promise<MenuActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("prepare_menu", { p_menu_id: menuId });
  return afterRpc(error);
}

export async function requestMenuPublication(
  menuId: string,
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const key = String(formData.get("idempotencyKey") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_menu_publication", {
    p_menu_id: menuId,
    p_idempotency_key: key || undefined,
  });
  if (error) return { error: error.message, done: false, notice: null };
  revalidatePath("/espacios", "layout");
  return { error: null, done: true, notice: t.done };
}

export async function cancelMenu(
  menuId: string,
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const reason = String(formData.get("reason") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_menu", { p_menu_id: menuId, p_reason: reason || undefined });
  return afterRpc(error);
}

export async function provideMenuInformation(
  menuId: string,
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const answer = String(formData.get("answer") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("provide_menu_information", { p_menu_id: menuId, p_answer: answer || undefined });
  return afterRpc(error);
}

export async function copyMenu(
  slug: string,
  establishmentId: string,
  menuId: string,
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const targetDate = String(formData.get("targetDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return { error: t.newValidation, done: false, notice: null };
  }

  const supabase = await createClient();
  const { data: newId, error } = await supabase.rpc("copy_menu", {
    p_menu_id: menuId,
    p_target_date: targetDate,
  });
  if (error || !newId) {
    return { error: error?.message ?? es.states.errorDescription, done: false, notice: null };
  }

  revalidatePath("/espacios", "layout");
  redirect(`/espacios/${slug}/restaurantes/${establishmentId}/menu-diario/${newId}`);
}
