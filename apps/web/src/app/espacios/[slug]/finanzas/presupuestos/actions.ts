"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import type { QuoteActionState } from "./action-state";

const t = es.quotesTeam;

/**
 * Las acciones del equipo sobre un presupuesto (§84, Fase 2, Hito 12).
 *
 * **Ninguna autoriza nada.** Cada una llama a la función de la migración
 * 80, que comprueba quién puede —`manage_requests` para crear, corregir y
 * enviar; `manage_finance` para autorizar el inicio sin pago— y en qué
 * estado. Si la pantalla enseñó un botón que no tocaba, la función lanza
 * y el error se pinta (CLAUDE.md: ocultar un botón no es un control de
 * acceso). Enviar y autorizar son idempotentes en el servidor (CA-17).
 *
 * El importe llega en euros y se convierte a céntimos aquí: todo el
 * esquema trabaja en enteros. El IVA no se calcula en ningún sitio de la
 * pantalla: lo congela `create_quote()` con el tipo del espacio (P4).
 */
function centsFrom(formData: FormData, field: string): number | null {
  const euros = Number(String(formData.get(field) ?? "").replace(",", "."));
  if (!Number.isFinite(euros) || euros < 0) return null;
  return Math.round(euros * 100);
}

function textOrUndefined(formData: FormData, field: string): string | undefined {
  const value = String(formData.get(field) ?? "").trim();
  return value === "" ? undefined : value;
}

async function afterRpc(error: { message: string } | null, notice: string): Promise<QuoteActionState> {
  if (error) return { error: error.message, done: false, notice: null };
  revalidatePath("/espacios", "layout");
  return { error: null, done: true, notice };
}

/** §84 · crear el borrador. Al guardarlo se abre su ficha. */
export async function createQuote(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const slug = String(formData.get("slug") ?? "");
  const establishmentId = String(formData.get("establishmentId") ?? "").trim();
  const concept = String(formData.get("concept") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "job");
  const cents = centsFrom(formData, "base");

  if (!establishmentId) return { error: t.establishmentRequired, done: false, notice: null };
  if (!concept) return { error: t.conceptRequired, done: false, notice: null };
  if (cents === null) return { error: t.baseInvalid, done: false, notice: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_quote", {
    p_establishment_id: establishmentId,
    p_concept: concept,
    p_base_cents: cents,
    p_outcome: outcome,
    p_category: textOrUndefined(formData, "category"),
    p_description: textOrUndefined(formData, "description"),
    p_request_id: textOrUndefined(formData, "requestId"),
    p_requires_payment_before_start: formData.get("requiresPayment") === "on",
  });

  if (error) return { error: error.message, done: false, notice: null };

  revalidatePath("/espacios", "layout");
  redirect(`/espacios/${slug}/finanzas/presupuestos/${data}`);
}

/** §84 · corregir un borrador. Lo enviado no se corrige (P4). */
export async function updateQuoteDraft(
  quoteId: string,
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const concept = String(formData.get("concept") ?? "").trim();
  const cents = centsFrom(formData, "base");
  if (!concept) return { error: t.conceptRequired, done: false, notice: null };
  if (cents === null) return { error: t.baseInvalid, done: false, notice: null };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_quote_draft", {
    p_quote_id: quoteId,
    p_concept: concept,
    p_base_cents: cents,
    p_description: textOrUndefined(formData, "description"),
    p_category: textOrUndefined(formData, "category"),
    p_requires_payment_before_start: formData.get("requiresPayment") === "on",
  });
  return afterRpc(error, t.saveDone);
}

/** §84 · enviar al restaurante. Avisa a quien puede aceptarlo (§18). */
export async function sendQuote(quoteId: string): Promise<QuoteActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_quote", { p_quote_id: quoteId });
  return afterRpc(error, t.sendDone);
}

/** §84 / RN-JOB-06 · autorizar el inicio antes del pago. Queda registrado. */
export async function authorizeQuoteStart(
  quoteId: string,
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("authorize_quote_start", {
    p_quote_id: quoteId,
    p_reason: textOrUndefined(formData, "reason"),
  });
  return afterRpc(error, t.authorizeDone);
}
