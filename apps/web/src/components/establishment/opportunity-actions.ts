"use server";

/**
 * Las acciones de Oportunidades (Fase 3, Hito 15; §97, §98, §100).
 *
 * Ninguna decide nada: cada una llama a su función de la migración 84, que
 * es quien comprueba el permiso, la transición y la visibilidad. Si aquí
 * se colara un botón de más, el servidor seguiría diciendo que no
 * (CLAUDE.md: ocultar un botón no es un control de acceso). Lo que estas
 * funciones hacen es traducir el error y refrescar la pantalla.
 */

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import type { OpportunityFormState } from "./opportunity-action-state";

export type { OpportunityFormState } from "./opportunity-action-state";

/* eslint-disable @typescript-eslint/no-explicit-any --
   Mismo motivo que en `opportunities-load.ts`: las funciones de la
   migración 84 no están todavía en `database.types.ts`, que se regenera
   contra el proyecto real cuando la migración se aplica. */
async function llamar(fn: string, args: Record<string, unknown>): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await (supabase as any).rpc(fn, args);
  return error ? error.message : null;
}

function refrescar(path: string | null): void {
  if (path) revalidatePath(path);
}

/** §98 · mover una oportunidad de estado: recomendar, aprobar, descartar… */
export async function changeOpportunityStatus(
  _prev: OpportunityFormState,
  formData: FormData,
): Promise<OpportunityFormState> {
  const reason = String(formData.get("reason") ?? "").trim();
  const status = String(formData.get("status") ?? "");

  if (status === "discarded" && reason === "") {
    return { error: es.opportunities.discardReasonRequired, done: false };
  }

  const error = await llamar("set_opportunity_status", {
    p_opportunity_id: String(formData.get("opportunityId") ?? ""),
    p_status: status,
    p_reason: reason || null,
  });
  if (error) return { error, done: false };

  refrescar(String(formData.get("path") ?? "") || null);
  return { error: null, done: true };
}

/** §96 · la propuesta es editable: impacto, prioridad, esfuerzo y "Incluir en informe". */
export async function editOpportunityProposal(
  _prev: OpportunityFormState,
  formData: FormData,
): Promise<OpportunityFormState> {
  const texto = (campo: string) => {
    const valor = String(formData.get(campo) ?? "").trim();
    return valor === "" ? null : valor;
  };
  const prioridad = texto("priority");

  const error = await llamar("update_opportunity_proposal", {
    p_opportunity_id: String(formData.get("opportunityId") ?? ""),
    p_impact: texto("impact"),
    p_priority: prioridad === null ? null : Number(prioridad),
    p_effort_category: texto("effortCategory"),
    p_include_in_report: formData.get("includeInReport") === null ? null : formData.get("includeInReport") === "on",
    p_recommended_action: texto("recommendedAction"),
    p_potential_service_id: null,
    p_title: texto("title"),
    p_description: texto("description"),
  });
  if (error) return { error, done: false };

  refrescar(String(formData.get("path") ?? "") || null);
  return { error: null, done: true };
}

/** §97 · "Existe Añadir oportunidad". */
export async function addManualOpportunity(
  _prev: OpportunityFormState,
  formData: FormData,
): Promise<OpportunityFormState> {
  const title = String(formData.get("title") ?? "").trim();
  if (title === "") return { error: es.opportunities.titleRequired, done: false };

  const efuerzo = String(formData.get("effortCategory") ?? "").trim();
  const error = await llamar("add_manual_opportunity", {
    p_establishment_id: String(formData.get("establishmentId") ?? ""),
    p_title: title,
    p_category: String(formData.get("category") ?? "traffic"),
    p_impact: String(formData.get("impact") ?? "medium"),
    p_description: String(formData.get("description") ?? "").trim() || null,
    p_effort_category: efuerzo || null,
    p_recommended_action: String(formData.get("recommendedAction") ?? "").trim() || null,
    p_potential_service_id: null,
  });
  if (error) return { error, done: false };

  refrescar(String(formData.get("path") ?? "") || null);
  return { error: null, done: true };
}

/** §97 · aportar evidencia y añadir observaciones. */
export async function addOpportunityNote(
  _prev: OpportunityFormState,
  formData: FormData,
): Promise<OpportunityFormState> {
  const body = String(formData.get("body") ?? "").trim();
  if (body === "") return { error: es.opportunities.noteRequired, done: false };

  const error = await llamar("add_opportunity_note", {
    p_opportunity_id: String(formData.get("opportunityId") ?? ""),
    p_kind: String(formData.get("kind") ?? "observation"),
    p_body: body,
  });
  if (error) return { error, done: false };

  refrescar(String(formData.get("path") ?? "") || null);
  return { error: null, done: true };
}

/**
 * §100 · la acción del restaurante. Crea un BORRADOR de solicitud con la
 * oportunidad enganchada; enviarlo es el paso siguiente, en la pantalla de
 * solicitudes, como cualquier otra.
 */
export async function actOnOpportunity(
  _prev: OpportunityFormState,
  formData: FormData,
): Promise<OpportunityFormState> {
  const message = String(formData.get("message") ?? "").trim();
  if (message === "") return { error: es.opportunities.messageRequired, done: false };

  const error = await llamar("act_on_opportunity", {
    p_opportunity_id: String(formData.get("opportunityId") ?? ""),
    p_action: String(formData.get("action") ?? "request_change"),
    p_message: message,
  });
  if (error) return { error, done: false };

  refrescar(String(formData.get("path") ?? "") || null);
  return { error: null, done: true };
}
