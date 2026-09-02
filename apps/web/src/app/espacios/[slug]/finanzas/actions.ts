"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

export type PaymentState = { error: string | null; done: boolean };

export const INITIAL_PAYMENT: PaymentState = { error: null, done: false };

/**
 * HU-26 · registrar el cobro de una mensualidad.
 *
 * El importe llega en euros desde el formulario y se convierte a céntimos
 * aquí: todo el esquema trabaja en enteros para no arrastrar redondeos de
 * coma flotante en el dinero.
 *
 * La clave de idempotencia la construye el servidor con el cobro y el
 * importe, no el navegador: pulsar dos veces no cobra dos veces
 * (CLAUDE.md MUST, RN-DAT-09).
 */
export async function registerPayment(
  _prev: PaymentState,
  formData: FormData,
): Promise<PaymentState> {
  const chargeId = String(formData.get("chargeId") ?? "");
  const method = String(formData.get("method") ?? "");
  const euros = Number(String(formData.get("amount") ?? "").replace(",", "."));

  // Antes esto devolvía `{ error: null, done: false }`: la pantalla se
  // quedaba exactamente igual, sin apunte y sin decir por qué, y el cobro
  // seguía pendiente sin que nadie supiera que el envío se había
  // descartado. Un error de negocio se devuelve como resultado explícito
  // (CLAUDE.md, "Estilo de código"), no como silencio.
  if (!Number.isFinite(euros) || euros <= 0) {
    return { error: es.teamArea.finance.registerAmountInvalid, done: false };
  }

  const cents = Math.round(euros * 100);

  // El try/catch no es decorativo. Una excepción aquí —la red, el cliente
  // de Supabase, cualquier cosa— sale como un 500 de la acción, y
  // `useActionState` deja el estado como estaba: la pantalla no cambia y
  // no dice nada, que es indistinguible de "no pasó nada". Convertirla en
  // un resultado con mensaje es lo que pide CLAUDE.md ("errores de
  // negocio como tipos de resultado explícitos") y además deja rastro en
  // el servidor para quien esté mirando la consola.
  try {
    const supabase = await createClient();

    const { error } = await supabase.rpc("register_payment", {
      p_charge_id: chargeId,
      p_amount_cents: cents,
      p_method: method,
      p_idempotency_key: `ui:${chargeId}:${cents}`,
    });

    if (error) {
      console.error("[finanzas] register_payment devolvió error", {
        chargeId,
        cents,
        method,
        message: error.message,
      });
      return { error: error.message, done: false };
    }
  } catch (fallo) {
    const message = fallo instanceof Error ? fallo.message : String(fallo);
    console.error("[finanzas] register_payment lanzó", { chargeId, cents, method, message });
    return { error: message, done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}
