"use server";

import { revalidatePath } from "next/cache";

import { isCuotlyPaymentMethod } from "@/core/cuotly-subscription";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import type { SettingsState } from "../action-state";

/**
 * RN-SUB-06, RN-ADM-10 · el propietario declara un pago a Cuotly. Quién
 * puede lo comprueba `declare_cuotly_payment()` (`manage_space`); aquí
 * solo se recogen los campos y se traduce la negativa.
 */
export async function declareCuotlyPayment(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const chargeId = String(formData.get("chargeId") ?? "").trim();
  const method = String(formData.get("method") ?? "").trim();
  const amountEuros = Number.parseFloat(String(formData.get("amount") ?? "").replace(",", "."));
  const paidAt = String(formData.get("paidAt") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();

  if (!chargeId || !isCuotlyPaymentMethod(method) || !Number.isFinite(amountEuros) || amountEuros <= 0) {
    return { error: es.cuotlySubscription.declareValidation, done: false, unchanged: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("declare_cuotly_payment", {
    p_charge_id: chargeId,
    p_amount_cents: Math.round(amountEuros * 100),
    p_method: method,
    p_paid_at: paidAt ? new Date(paidAt).toISOString() : undefined,
    p_receipt_reference: reference || undefined,
    p_note: note || undefined,
    p_idempotency_key: idempotencyKey || undefined,
  });
  if (error) return { error: error.message, done: false, unchanged: false };

  revalidatePath("/espacios", "layout");
  return { error: null, done: true, unchanged: false };
}
