import { notFound, redirect } from "next/navigation";

import { NoPermissionState, PageHeader } from "@/components/ui";
import { monthRange } from "@/core/client-activity";
import { todayInTimeZone } from "@/core/finance";
import {
  countChargesByBucket,
  monthsEndingAt,
  percentChange,
  readFinanceParams,
} from "@/core/finance-summary";
import { DEFAULT_TIMEZONE } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadSpaceInvoices } from "@/services/invoices";

import { FinanceView, type FinanceChargeRow } from "./FinanceView";

/**
 * M16 · Finanzas del espacio (HU-26, HU-28, PRD §17.2).
 *
 * CA-03 — "un trabajador no puede ver finanzas globales" — no se cumple
 * escondiendo esta pantalla: `financial_dashboard()` lanza una excepción a
 * quien no tenga `manage_finance`. Aquí se traduce esa negativa a un
 * estado "sin acceso", que es lo que ve un trabajador que llegue por URL.
 *
 * **El mes.** El dibujo lleva un selector de mes, y el servidor ya sabe
 * contestar por periodo: `financial_dashboard()` da lo cobrado, lo
 * pendiente y lo vencido **de lo emitido** entre dos instantes. El mes se
 * corta en la zona del espacio (CLAUDE.md), y los doce del gráfico son
 * doce llamadas a la misma función: ni una cifra se suma aquí.
 *
 * El registro de un pago se hace en el detalle de cada cobro (M17), que
 * es donde está el justificante que hay que mirar antes.
 */
export const dynamic = "force-dynamic";

export default async function FinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, slug, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const zona = space.timezone ?? DEFAULT_TIMEZONE;
  const hoy = todayInTimeZone(new Date(), zona);
  const q = readFinanceParams(await searchParams, hoy);

  const sinAcceso = (
    <div className="space-y-6">
      <PageHeader title={es.teamArea.finance.title} />
      <NoPermissionState
        title={es.teamArea.finance.noPermissionTitle}
        description={es.teamArea.finance.noPermissionReason}
      />
    </div>
  );

  // M52 · Facturas: la pestaña espera al agente de facturas. Pide lo
  // mismo que el resto de Finanzas (CA-03) y no lee ninguna cifra.
  if (q.tab === "facturas") {
    const { data: canManage } = await supabase.rpc("has_capability", {
      p_space_id: space.id,
      p_capability: "manage_finance",
    });
    if (canManage !== true) return sinAcceso;
    return (
      <FinanceView
        slug={slug}
        timeZone={zona}
        month={q.month}
        today={hoy}
        content={{ tab: "facturas", invoices: await loadSpaceInvoices() }}
      />
    );
  }

  // Los doce meses del gráfico acaban en el elegido; el elegido es el
  // último y el anterior, el penúltimo.
  const meses = monthsEndingAt(q.month, 12);
  const tableros = await Promise.all(
    meses.map(async (mes) => {
      const { from, to } = monthRange(mes, zona);
      const { data, error } = await supabase.rpc("financial_dashboard", {
        p_space_id: space.id,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      return { mes, fila: data?.[0] ?? null, error };
    }),
  );

  const actual = tableros[tableros.length - 1];
  if (actual.error || actual.fila === null) return sinAcceso;
  const anterior = tableros[tableros.length - 2];

  // Resumen: lo emitido en el mes. Cobros: lo emitido en los doce meses.
  const desde = monthRange(q.tab === "resumen" ? q.month : meses[0], zona).from;
  const hasta = monthRange(q.month, zona).to;

  const [{ data: charges }, { data: nonpayment }, { data: establishments }] = await Promise.all([
    supabase
      .from("charges")
      .select(
        "id, concept, establishment_id, base_cents, tax_rate_percent, tax_cents, total_cents, issued_at",
      )
      .eq("space_id", space.id)
      .gte("issued_at", desde.toISOString())
      .lt("issued_at", hasta.toISOString())
      .order("issued_at", { ascending: false }),
    q.tab === "resumen"
      ? supabase.rpc("establishments_with_nonpayment", { p_space_id: space.id })
      : Promise.resolve({ data: [] }),
    supabase.from("establishments").select("id, name").eq("space_id", space.id),
  ]);

  const establishmentName = new Map((establishments ?? []).map((e) => [e.id, e.name]));
  const chargeIds = (charges ?? []).map((c) => c.id);

  // El estado y la deuda viva de cada cobro los deriva el servidor de su
  // libro de apuntes (RN-FIN-02 + RN-DAT-05): aquí no se suman importes.
  const [estados, { data: receipts }] = await Promise.all([
    Promise.all(
      (charges ?? []).map(async (charge) => {
        const [{ data: status }, { data: outstanding }] = await Promise.all([
          supabase.rpc("charge_status", { p_charge_id: charge.id }),
          supabase.rpc("charge_outstanding_cents", { p_charge_id: charge.id }),
        ]);
        return { id: charge.id, status: status ?? "pending", outstanding: outstanding ?? 0 };
      }),
    ),
    // RN-FIN-06 · los justificantes que ha subido el restaurante. Solo se
    // mira si existen: el archivo se abre en el detalle del cobro.
    chargeIds.length
      ? supabase
          .from("receipts")
          .select("charge_id, uploaded_side")
          .in("charge_id", chargeIds)
      : Promise.resolve({ data: [] }),
  ]);
  const estadoPorCobro = new Map(estados.map((e) => [e.id, e]));
  const conJustificante = new Set(
    (receipts ?? []).filter((r) => r.uploaded_side === "client").map((r) => r.charge_id),
  );

  const rows: FinanceChargeRow[] = (charges ?? []).map((c) => {
    const estado = estadoPorCobro.get(c.id) ?? { status: "pending", outstanding: 0 };
    return {
      id: c.id,
      issuedAt: c.issued_at,
      establishment: establishmentName.get(c.establishment_id) ?? "—",
      concept: c.concept,
      baseCents: c.base_cents,
      taxCents: c.tax_cents,
      taxRatePercent: Number(c.tax_rate_percent),
      totalCents: c.total_cents,
      status: estado.status,
      outstanding: estado.outstanding,
      receiptWaiting: estado.outstanding > 0 && conJustificante.has(c.id),
    };
  });

  const cuenta = countChargesByBucket(
    q.tab === "resumen" ? rows : [],
  );
  const fila = actual.fila;

  return (
    <FinanceView
      slug={slug}
      timeZone={zona}
      month={q.month}
      today={hoy}
      content={
        q.tab === "cobros"
          ? { tab: "cobros", rows }
          : {
              tab: "resumen",
              rows,
              summary: {
                collected: Number(fila.collected_cents),
                collectedChange: percentChange(
                  Number(fila.collected_cents),
                  anterior?.fila ? Number(anterior.fila.collected_cents) : null,
                ),
                pending: Number(fila.pending_cents),
                pendingCount: cuenta.pending,
                overdue: Number(fila.overdue_cents),
                overdueCount: cuenta.overdue,
                issued: Number(fila.forecast_total_cents),
                recurring: Number(fila.recurring_monthly_total_cents),
                monthly: tableros.map((tb) => ({
                  month: tb.mes,
                  collected: tb.fila ? Number(tb.fila.collected_cents) : null,
                })),
              },
              nonpayment: (nonpayment ?? []).map((n) => ({
                establishmentId: n.establishment_id,
                name: n.establishment_name,
                oldestDueAt: n.oldest_due_at,
                outstandingCents: Number(n.outstanding_cents),
                stage: n.stage,
              })),
            }
      }
    />
  );
}
