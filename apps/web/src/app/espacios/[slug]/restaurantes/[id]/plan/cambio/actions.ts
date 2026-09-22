"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import type { PlanChangeState } from "./action-state";

/**
 * R24 · pedir un cambio de plan.
 *
 * No hay una operación "pedir cambio de plan" para el restaurante: el
 * cambio lo programa el equipo (`schedule_plan_change()` y
 * `change_plan_immediately()`, con `manage_clients`). Lo que el
 * restaurante puede hacer es decirlo, y el sitio para decirlo es su
 * conversación general con el equipo. Esta acción escribe ahí, con
 * `post_message()`, que es quien decide si puede escribir (el rol Consulta
 * no puede, RN-MSG-05) y con qué rol firma el mensaje.
 */
export async function requestPlanChange(_prev: PlanChangeState, formData: FormData): Promise<PlanChangeState> {
  const establishmentId = String(formData.get("establishmentId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: es.clientArea.newValidationRequired, sent: false, text };

  const supabase = await createClient();
  const { data: conversationId, error: sinConversacion } = await supabase.rpc(
    "get_or_create_establishment_conversation",
    { p_establishment_id: establishmentId },
  );
  if (sinConversacion || typeof conversationId !== "string") {
    return { error: es.panelPlan.changeNoConversation, sent: false, text };
  }

  const body = `${es.panelPlan.changeMessagePrefix} ${text}`;
  const minute = new Date().toISOString().slice(0, 16);
  const { error } = await supabase.rpc("post_message", {
    p_conversation_id: conversationId,
    p_body: body,
    p_idempotency_key: `plan:${minute}:${body.slice(0, 64)}`,
  });
  if (error) return { error: error.message, sent: false, text };

  revalidatePath("/espacios", "layout");
  return { error: null, sent: true, text: "" };
}
