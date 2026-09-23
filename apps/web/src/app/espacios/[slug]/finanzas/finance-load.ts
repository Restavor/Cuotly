import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Los cobros emitidos en un periodo, con el estado y la deuda viva que
 * deriva el servidor de su libro de apuntes (RN-FIN-02 + RN-DAT-05). Lo
 * leen las pestañas Resumen, Cobros, Pagos y Vencimientos: una sola
 * consulta para que las cuatro cuenten lo mismo.
 */
export type ChargeWithStatus = {
  readonly id: string;
  readonly concept: string;
  readonly establishmentId: string;
  readonly establishment: string;
  readonly baseCents: number;
  readonly taxCents: number;
  readonly taxRatePercent: number;
  readonly totalCents: number;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly status: string;
  readonly outstanding: number;
};

export async function loadChargesWithStatus(
  supabase: Supabase,
  spaceId: string,
  from: Date,
  to: Date,
): Promise<{
  charges: ChargeWithStatus[];
  establishments: { id: string; name: string }[];
}> {
  const [{ data: charges }, { data: establishments }] = await Promise.all([
    supabase
      .from("charges")
      .select(
        "id, concept, establishment_id, base_cents, tax_rate_percent, tax_cents, total_cents, issued_at, due_at",
      )
      .eq("space_id", spaceId)
      .gte("issued_at", from.toISOString())
      .lt("issued_at", to.toISOString())
      .order("issued_at", { ascending: false }),
    supabase.from("establishments").select("id, name").eq("space_id", spaceId).order("name"),
  ]);

  const nombre = new Map((establishments ?? []).map((e) => [e.id, e.name]));

  const conEstado = await Promise.all(
    (charges ?? []).map(async (c) => {
      const [{ data: status }, { data: outstanding }] = await Promise.all([
        supabase.rpc("charge_status", { p_charge_id: c.id }),
        supabase.rpc("charge_outstanding_cents", { p_charge_id: c.id }),
      ]);
      return {
        id: c.id,
        concept: c.concept,
        establishmentId: c.establishment_id,
        establishment: nombre.get(c.establishment_id) ?? "—",
        baseCents: c.base_cents,
        taxCents: c.tax_cents,
        taxRatePercent: Number(c.tax_rate_percent),
        totalCents: c.total_cents,
        issuedAt: c.issued_at,
        dueAt: c.due_at,
        status: status ?? "pending",
        outstanding: outstanding ?? 0,
      };
    }),
  );

  return { charges: conEstado, establishments: establishments ?? [] };
}

/** Los justificantes de un cobro, con el nombre de su archivo si se puede leer (RN-ARC-05). */
export async function loadChargeReceipts(
  supabase: Supabase,
  chargeId: string,
): Promise<{ fileId: string; name: string; side: string; at: string }[]> {
  const { data: receipts } = await supabase
    .from("receipts")
    .select("file_id, uploaded_side, created_at")
    .eq("charge_id", chargeId)
    .order("created_at", { ascending: true });
  const ids = [...new Set((receipts ?? []).map((r) => r.file_id))];
  const { data: files } = ids.length
    ? await supabase.from("files").select("id, name").in("id", ids)
    : { data: [] };
  const nombre = new Map((files ?? []).map((f) => [f.id, f.name]));
  // Un justificante cuyo archivo no se puede leer no se enseña como un
  // hueco: `can_read_file()` ha decidido que no está.
  return (receipts ?? [])
    .filter((r) => nombre.has(r.file_id))
    .map((r) => ({ fileId: r.file_id, name: nombre.get(r.file_id) ?? "", side: r.uploaded_side, at: r.created_at }));
}
