"use server";

/**
 * RN-EST-20 · las acciones de grupos: crear, editar y mover un restaurante
 * de grupo.
 *
 * Ninguna decide nada. `create_group()` y `update_group()` exigen
 * `manage_clients`; `move_establishment_to_group()` deja al equipo moverlo
 * a cualquier grupo y al propietario del restaurante solo a uno del que
 * también sea propietario global. Aquí se leen los campos, se llama y se
 * refresca la pantalla.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { isPreviousAccessChoice, type GroupActionState } from "./group-action-state";

function texto(formData: FormData, nombre: string): string {
  return String(formData.get(nombre) ?? "").trim();
}

export async function createGroup(
  _prev: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const spaceId = texto(formData, "spaceId");
  const slug = texto(formData, "slug");
  const name = texto(formData, "name");
  if (name === "") return { error: es.teamArea.groups.nameRequired, done: false };

  let groupId: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_group", {
      p_space_id: spaceId,
      p_name: name,
      p_description: texto(formData, "description"),
      p_idempotency_key: texto(formData, "idempotencyKey") || undefined,
    });
    if (error) return { error: error.message, done: false };
    groupId = data;
  } catch (fallo) {
    console.error("[grupos] no se pudo crear", { message: String(fallo) });
    return { error: es.states.errorDescription, done: false };
  }

  revalidatePath("/espacios", "layout");
  // Fuera del `try`: `redirect()` se hace lanzando, y un `catch` se lo
  // tragaría como si fuera un fallo.
  redirect(`/espacios/${slug}/restaurantes/grupos?grupo=${groupId}`);
}

export async function updateGroup(
  _prev: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const name = texto(formData, "name");
  if (name === "") return { error: es.teamArea.groups.nameRequired, done: false };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("update_group", {
      p_group_id: texto(formData, "groupId"),
      p_name: name,
      p_description: texto(formData, "description"),
    });
    if (error) return { error: error.message, done: false };
  } catch (fallo) {
    console.error("[grupos] no se pudo editar", { message: String(fallo) });
    return { error: es.states.errorDescription, done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

export async function moveEstablishmentToGroup(
  _prev: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const establishmentId = texto(formData, "establishmentId");
  const groupId = texto(formData, "groupId");
  const previousAccess = texto(formData, "previousAccess");

  if (establishmentId === "" || groupId === "") {
    return { error: es.teamArea.groups.moveMissing, done: false };
  }
  // Sin elegir no se mueve: qué pasa con quien entraba por el grupo de
  // origen lo decide una persona, no un valor por defecto (RN-EST-20).
  if (!isPreviousAccessChoice(previousAccess)) {
    return { error: es.teamArea.groups.previousAccessRequired, done: false };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("move_establishment_to_group", {
      p_establishment_id: establishmentId,
      p_group_id: groupId,
      p_previous_access: previousAccess,
    });
    if (error) return { error: error.message, done: false };
    const resultado = (data ?? {}) as { moved?: boolean; kept_as_editor?: number; lost_access?: number };
    revalidatePath("/espacios", "layout");
    return {
      error: null,
      done: true,
      moved: resultado.moved === true,
      keptAsEditor: resultado.kept_as_editor ?? 0,
      lostAccess: resultado.lost_access ?? 0,
    };
  } catch (fallo) {
    console.error("[grupos] no se pudo mover", { message: String(fallo) });
    return { error: es.states.errorDescription, done: false };
  }
}
