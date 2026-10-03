"use server";

import { revalidatePath } from "next/cache";

import { parseEuros } from "@/core/agents/balance";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { adjustBalance, registerManualTopup, registerPayout, setLowBalanceThreshold, type TeamMoneyMethod } from "@/services/agents/balance-gateway";
import { deliverNoticesNow } from "@/services/agents/lifecycle-delivery";

import type { SheetFeedback } from "./action-state";

/**
 * Lo que hace Restavor con el saldo de un restaurante (SAL-01; PRD de agents §5.2 RN-AGT-02, RN-AGT-04 y
 * RN-AGT-08): registrar una recarga a mano, ajustar el saldo y devolver lo que sobra. Ninguna autoriza nada:
 * quién puede lo deciden `record_manual_topup()`, `adjust_agent_balance()` y `record_balance_payout()` (el
 * equipo del espacio con `manage_clients`; el ajuste y la devolución, además, con el segundo paso). Aquí solo
 * se traduce lo que contestan a un mensaje. La clave de idempotencia la trae el formulario: pulsar dos veces
 * no apunta dos veces.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[\w-]{8,64}$/;
const METHODS: readonly TeamMoneyMethod[] = ["transfer", "bizum", "other"];

function failure(error: unknown): SheetFeedback {
  const t = es.reservationsSpace.sheet.forms;
  const text = error instanceof Error ? error.message : "";
  if (/dos pasos/i.test(text)) return { ok: false, message: t.needsTwoFactor };
  if (/Solo Restavor/i.test(text)) return { ok: false, message: t.noPermission };
  if (/más de lo que hay/i.test(text)) return { ok: false, message: t.tooMuch };
  if (/dado de baja/i.test(text)) return { ok: false, message: t.notEnding };
  if (/por qué/i.test(text)) return { ok: false, message: t.reasonRequired };
  if (/otra operación/i.test(text)) return { ok: false, message: t.keyReused };
  if (/aviso de saldo bajo no puede/i.test(text)) return { ok: false, message: t.thresholdInvalid };
  return { ok: false, message: t.failed };
}

function refresh(slug: string, establishmentId: string) {
  revalidatePath(`/espacios/${slug}/restaurantes/${establishmentId}/reservas`);
  revalidatePath(`/espacios/${slug}/reservas`);
}

/** El push de los avisos que pudo crear el apunte (recibo, saldo bajo o agotado): al momento, como los demás. */
async function pushNow(establishmentId: string, entryId: string, extra: readonly string[] = []) {
  const keys = [...extra, `agent_balance_low:${establishmentId}:${entryId}`, `agent_balance_empty:${establishmentId}:${entryId}`];
  await deliverNoticesNow({ pushKeys: keys, emailKeys: [], establishmentIds: [] });
}

export async function registerManualTopupAction(input: {
  slug: string;
  establishmentId: string;
  amount: string;
  method: string;
  note: string;
  formKey: string;
}): Promise<SheetFeedback> {
  const t = es.reservationsSpace.sheet.forms;
  if (!UUID.test(input.establishmentId) || !KEY.test(input.formKey)) return { ok: false, message: t.failed };
  const method = METHODS.find((m) => m === input.method);
  if (!method) return { ok: false, message: t.failed };
  const amount = parseEuros(input.amount);
  if (!amount.ok) return { ok: false, message: amount.reason === "zero" ? t.amountZero : t.invalidAmount };
  try {
    const entryId = await registerManualTopup(await createClient(), {
      establishmentId: input.establishmentId,
      netCents: amount.cents,
      method,
      note: input.note.trim() === "" ? null : input.note.trim(),
      idempotencyKey: `${input.formKey}:topup:${amount.cents}`,
    });
    await pushNow(input.establishmentId, entryId, [`agent_topup_receipt:manual:${entryId}`]);
    refresh(input.slug, input.establishmentId);
    return { ok: true, message: t.topupDone };
  } catch (error) {
    return failure(error);
  }
}

export async function adjustBalanceAction(input: {
  slug: string;
  establishmentId: string;
  amount: string;
  reason: string;
  formKey: string;
}): Promise<SheetFeedback> {
  const t = es.reservationsSpace.sheet.forms;
  if (!UUID.test(input.establishmentId) || !KEY.test(input.formKey)) return { ok: false, message: t.failed };
  const amount = parseEuros(input.amount, { signed: true });
  if (!amount.ok) return { ok: false, message: amount.reason === "zero" ? t.amountZero : t.invalidAmount };
  if (input.reason.trim() === "") return { ok: false, message: t.reasonRequired };
  try {
    const entryId = await adjustBalance(await createClient(), {
      establishmentId: input.establishmentId,
      amountCents: amount.cents,
      reason: input.reason.trim(),
      idempotencyKey: `${input.formKey}:adjust:${amount.cents}`,
    });
    await pushNow(input.establishmentId, entryId);
    refresh(input.slug, input.establishmentId);
    return { ok: true, message: t.adjustDone };
  } catch (error) {
    return failure(error);
  }
}

export async function registerPayoutAction(input: {
  slug: string;
  establishmentId: string;
  amount: string;
  note: string;
  formKey: string;
}): Promise<SheetFeedback> {
  const t = es.reservationsSpace.sheet.forms;
  if (!UUID.test(input.establishmentId) || !KEY.test(input.formKey)) return { ok: false, message: t.failed };
  const amount = parseEuros(input.amount);
  if (!amount.ok) return { ok: false, message: amount.reason === "zero" ? t.amountZero : t.invalidAmount };
  try {
    const entryId = await registerPayout(await createClient(), {
      establishmentId: input.establishmentId,
      amountCents: amount.cents,
      note: input.note.trim() === "" ? null : input.note.trim(),
      idempotencyKey: `${input.formKey}:payout:${amount.cents}`,
    });
    // Devolver puede dejar el saldo bajo o a cero: el aviso sale como con cualquier otro apunte.
    await pushNow(input.establishmentId, entryId);
    refresh(input.slug, input.establishmentId);
    return { ok: true, message: t.payoutDone };
  } catch (error) {
    return failure(error);
  }
}

/** El saldo por debajo del cual se avisa de «saldo bajo» (RN-AGT-05): lo cambia Restavor; cambiarlo deja huella. */
export async function setLowBalanceThresholdAction(input: {
  slug: string;
  establishmentId: string;
  amount: string;
}): Promise<SheetFeedback> {
  const t = es.reservationsSpace.sheet.forms;
  if (!UUID.test(input.establishmentId)) return { ok: false, message: t.failed };
  const amount = parseEuros(input.amount);
  // Cero es válido aquí (sin aviso de saldo bajo, solo el de agotado): `parseEuros` lo da como «zero».
  if (!amount.ok && amount.reason !== "zero") return { ok: false, message: t.invalidAmount };
  try {
    await setLowBalanceThreshold(await createClient(), {
      establishmentId: input.establishmentId,
      thresholdCents: amount.ok ? amount.cents : 0,
    });
    refresh(input.slug, input.establishmentId);
    return { ok: true, message: t.thresholdDone };
  } catch (error) {
    return failure(error);
  }
}
