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

/**
 * RN-SUB-10 · cambiar el plan de Cuotly. Pro → Agency es inmediato y se
 * cobra la diferencia proporcional; Agency → Pro se programa para la
 * renovación y solo si el uso cabe en Pro con los adicionales que se
 * contraten. Todo eso lo decide `change_cuotly_plan()` (`manage_space`,
 * con evento y auditoría, RN-SUB-12); la clave de idempotencia hace que
 * pulsar dos veces no cobre dos diferencias.
 */
export async function changeCuotlyPlan(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const newPlan = String(formData.get("newPlan") ?? "");
  const extras = (k: string) => {
    const n = Number.parseInt(String(formData.get(k) ?? "0"), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.rpc("change_cuotly_plan", {
    p_space_id: spaceId,
    p_new_plan: newPlan,
    p_extra_establishments: extras("extraEstablishments"),
    p_extra_users: extras("extraUsers"),
    p_idempotency_key: idempotencyKey || undefined,
  });
  if (error) return { error: error.message, done: false, unchanged: false };

  revalidatePath("/espacios", "layout");
  return { error: null, done: true, unchanged: false };
}

/** RN-SUB-10 · anular el paso a Pro mientras no llegue la renovación. */
export async function cancelCuotlyPlanChange(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const spaceId = String(formData.get("spaceId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_cuotly_plan_change", { p_space_id: spaceId });
  if (error) return { error: error.message, done: false, unchanged: false };

  revalidatePath("/espacios", "layout");
  return { error: null, done: true, unchanged: false };
}
