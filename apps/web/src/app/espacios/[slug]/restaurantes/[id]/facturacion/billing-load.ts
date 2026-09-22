import type { SupabaseClient } from "@supabase/supabase-js";

import { billingGroup, type BillingGroup } from "@/core/client-billing";
import type { Database } from "@/lib/supabase/database.types";
import { loadChargePayments } from "@/services/charge-payments";

export type ClientChargeRow = {
  readonly id: string;
  readonly concept: string;
  readonly period_start: string;
  readonly period_end: string;
  readonly base_cents: number;
  readonly tax_cents: number;
  readonly tax_rate_percent: number;
  readonly total_cents: number;
  readonly due_at: string;
  readonly status: string;
  readonly outstandingCents: number;
  readonly group: BillingGroup;
  readonly payments: Awaited<ReturnType<typeof loadChargePayments>>;
  readonly receipts: readonly { readonly id: string; readonly name: string; readonly created_at: string }[];
};

/**
 * R25 y R26 · los cobros del restaurante con lo que el servidor dice de
 * cada uno: estado (`charge_status()`), deuda viva
 * (`charge_outstanding_cents()`) y pagos apuntados (RN-FIN-02,
 * RN-DAT-05). Aquí no se suma dinero.
 *
 * Los justificantes no salen de `receipts` —esa tabla es del equipo— sino
 * de `file_links`, cuya política es `can_read_file()`: el restaurante ve
 * lo suyo y no lo que el equipo adjuntó como interno (RN-FIN-06).
 *
 * `chargeId` limita la consulta a uno (R26).
 */
export async function loadClientCharges(
  supabase: SupabaseClient<Database>,
  establishmentId: string,
  chargeId?: string,
): Promise<ClientChargeRow[]> {
  let consulta = supabase
    .from("charges")
    .select("id, concept, period_start, period_end, base_cents, tax_cents, tax_rate_percent, total_cents, due_at")
    .eq("establishment_id", establishmentId)
    .order("due_at", { ascending: false });
  if (chargeId) consulta = consulta.eq("id", chargeId);
  const { data: charges } = await consulta;
  const filas = charges ?? [];

  const ids = filas.map((c) => c.id);
  const { data: links } = ids.length
    ? await supabase.from("file_links").select("file_id, entity_id").eq("entity_type", "charge").in("entity_id", ids)
    : { data: [] };
  const fileIds = [...new Set((links ?? []).map((l) => l.file_id))];
  const { data: files } = fileIds.length
    ? await supabase.from("files").select("id, name, created_at").in("id", fileIds)
    : { data: [] };
  const porId = new Map((files ?? []).map((f) => [f.id, f]));
  const justificantes = new Map<string, { id: string; name: string; created_at: string }[]>();
  for (const l of links ?? []) {
    const f = porId.get(l.file_id);
    if (!f) continue;
    justificantes.set(l.entity_id, [...(justificantes.get(l.entity_id) ?? []), f]);
  }

  return Promise.all(
    filas.map(async (c) => {
      const [{ data: status }, { data: outstanding }, payments] = await Promise.all([
        supabase.rpc("charge_status", { p_charge_id: c.id }),
        supabase.rpc("charge_outstanding_cents", { p_charge_id: c.id }),
        loadChargePayments(supabase, c.id),
      ]);
      const receipts = justificantes.get(c.id) ?? [];
      const estado = status ?? "pending";
      const debe = outstanding ?? 0;
      return {
        ...c,
        status: estado,
        outstandingCents: debe,
        group: billingGroup({ status: estado, outstandingCents: debe, hasReceipt: receipts.length > 0 }),
        payments,
        receipts,
      };
    }),
  );
}
