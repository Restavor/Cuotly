import type { createClient } from "@/lib/supabase/server";

import type { ChargePaymentRow } from "@/components/finance/PaymentHistory";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * M51 · los apuntes de un cobro, para las dos pantallas que los enseñan: la
 * ficha del presupuesto del equipo y la facturación del restaurante. En un
 * solo sitio para que las dos lean lo mismo.
 *
 * **Las columnas se enumeran y `recorded_by` no está.** `payments` tiene
 * privilegios de columna porque el cliente no puede ver la identidad de
 * nadie del equipo, así que `select *` devolvería 403 y pedir esa columna
 * también (CLAUDE.md). Quién registró cada pago sale de `audit_log` cuando
 * el equipo lo necesita.
 *
 * Aquí no se filtra por permisos: RLS decide qué pagos vuelven. Si esta
 * función devuelve una lista vacía para alguien, es que no tenía que
 * verlos.
 */
export async function loadChargePayments(
  supabase: Supabase,
  chargeId: string,
): Promise<readonly ChargePaymentRow[]> {
  const { data } = await supabase
    .from("payments")
    .select("id, amount_cents, method, paid_at, reversed_at, reversal_reason")
    .eq("charge_id", chargeId)
    .order("paid_at", { ascending: true });

  return data ?? [];
}
