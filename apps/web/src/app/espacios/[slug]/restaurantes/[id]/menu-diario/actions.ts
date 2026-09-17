"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { linesToItems, parsePriceToCents } from "@/core/daily-menu";
import { parseSimultaneousEditVersion } from "@/core/menu-diff";
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

  // A17 · contra qué versión se empezó a escribir. Viaja en el formulario
  // porque es lo que la pantalla tenía delante cuando se pintó; el servidor
  // lo compara con la que hay ahora y rechaza si no coinciden. Sin esto, dos
  // personas guardando a la vez producían dos versiones y la segunda se
  // llevaba el menú sin que la primera se enterara.
  const esperada = Number(formData.get("expectedVersion") ?? "");

  const supabase = await createClient();
  const { data: versionId, error } = await supabase.rpc("save_menu_version", {
    p_menu_id: menuId,
    p_starters: [...linesToItems(String(formData.get("starters") ?? ""))],
    p_mains: [...linesToItems(String(formData.get("mains") ?? ""))],
    p_desserts: [...linesToItems(String(formData.get("desserts") ?? ""))],
    p_drink: String(formData.get("drink") ?? "").trim() || undefined,
    p_price_cents: priceCents ?? undefined,
    p_note: String(formData.get("note") ?? "").trim() || undefined,
    p_expected_version: Number.isFinite(esperada) && esperada > 0 ? esperada : undefined,
  });

  if (error || !versionId) {
    // A17 · si el rechazo es porque alguien se adelantó, la pantalla puede
    // enseñar QUÉ cambió en vez de un mensaje seco. Para eso hace falta la
    // versión nueva, que se creó después de pintarse esta pantalla y el
    // navegador no tiene. Lo escrito no se pierde: sigue en el formulario.
    const conflicto = error ? parseSimultaneousEditVersion(error.message) : null;
    if (conflicto !== null) {
      const { data: nueva } = await supabase
        .from("menu_versions")
        .select("starters, mains, desserts, drink, price_cents, note")
        .eq("menu_id", menuId)
        .eq("version", conflicto)
        .maybeSingle();

      if (nueva) {
        return {
          error: error?.message ?? es.states.errorDescription,
          done: false,
          notice: null,
          conflict: {
            version: conflicto,
            content: {
              starters: nueva.starters ?? [],
              mains: nueva.mains ?? [],
              desserts: nueva.desserts ?? [],
              drink: nueva.drink,
              priceCents: nueva.price_cents,
              note: nueva.note,
            },
          },
        };
      }
    }

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

/**
 * RN-COR-10 · la corrección mínima de un menú publicado. Una por
 * publicación (RN-COR-01), dentro de la ventana (RN-COR-02), y garantizada
 * solo si llega antes de las 21:00 del día anterior: todo lo decide
 * `request_menu_correction()`.
 */
export async function requestMenuCorrection(
  menuId: string,
  _prev: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const description = String(formData.get("description") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_menu_correction", { p_menu_id: menuId, p_description: description });
  return afterRpc(error);
}
