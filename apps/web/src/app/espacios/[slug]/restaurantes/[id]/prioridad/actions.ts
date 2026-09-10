"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { moveInOrder } from "@/core/priority";

import type { PriorityState } from "./action-state";

/**
 * Mover un cambio arriba o abajo en el orden del restaurante.
 *
 * Se manda la lista ENTERA y la posición que se mueve, no "pon esta la
 * 3": `set_request_priority_order()` recibe el orden completo y reescribe
 * 1..N, así que dos personas ordenando a la vez no pueden dejar dos
 * segundos ni un hueco — la última que guarda gana, entera.
 *
 * **No autoriza nada.** Quién puede ordenar lo decide
 * `client_can_set_priority()`: escribir en el restaurante Y tener un plan
 * que lo conceda. Ni el propietario del espacio ni un administrador pueden,
 * y eso lo hace cumplir el servidor, no esta acción (CLAUDE.md).
 */
export async function moveRequestPriority(
  establishmentId: string,
  _prev: PriorityState,
  formData: FormData,
): Promise<PriorityState> {
  const ids = String(formData.get("orden") ?? "")
    .split(",")
    .filter((id) => id.length > 0);
  const from = Number(formData.get("desde"));
  const direction = String(formData.get("hacia"));

  const movido = moveInOrder(ids, from, direction === "arriba" ? -1 : 1);
  if (movido === null) return { error: null, done: false };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_request_priority_order", {
    p_establishment_id: establishmentId,
    p_request_ids: movido,
  });

  if (error) return { error: error.message, done: false };

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}
