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

import { RegisterPaymentForm } from "@/components/RegisterPaymentForm";
import { dueCharges, isDueFilter } from "@/core/finance-due";
import { euros } from "@/i18n/money";
import { loadChargePayments } from "@/services/charge-payments";

import { loadChargeReceipts, loadChargesWithStatus } from "./finance-load";
import { FinanceView, type FinanceChargeRow, type FinanceContent } from "./FinanceView";

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
  const crudos = await searchParams;
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
  const q = readFinanceParams(crudos, hoy);

  const sinAcceso = (
    <div className="space-y-6">
      <PageHeader title={es.teamArea.finance.title} />
      <NoPermissionState
        title={es.teamArea.finance.noPermissionTitle}
        description={es.teamArea.finance.noPermissionReason}
      />
    </div>
  );

  // Facturas, Pagos y Vencimientos no pasan por `financial_dashboard()`,
  // así que el permiso se pregunta aparte: el mismo de todo Finanzas (CA-03).
  if (q.tab === "facturas" || q.tab === "pagos" || q.tab === "vencimientos") {
    const { data: canManage } = await supabase.rpc("has_capability", {
      p_space_id: space.id,
      p_capability: "manage_finance",
    });
    if (canManage !== true) return sinAcceso;
  }

  const vista = (content: FinanceContent) => (
    <FinanceView slug={slug} timeZone={zona} month={q.month} today={hoy} content={content} />
  );

  // M52 · Facturas: la pestaña espera al agente de facturas (decisión 69).
  if (q.tab === "facturas") {
    return vista({ tab: "facturas", invoices: await loadSpaceInvoices() });
  }

  // Pagos y Vencimientos miran los cobros emitidos en los doce meses que
  // acaban en el de hoy, con su estado y su deuda viva del servidor.
  if (q.tab === "pagos" || q.tab === "vencimientos") {
    const doce = monthsEndingAt(hoy.slice(0, 7), 12);
    const { charges, establishments } = await loadChargesWithStatus(
      supabase,
      space.id,
      monthRange(doce[0], zona).from,
      monthRange(doce[11], zona).to,
    );
    const pedido = typeof crudos.cobro === "string" ? crudos.cobro : null;

    if (q.tab === "vencimientos") {
      const restaurante = typeof crudos.restaurante === "string" && crudos.restaurante ? crudos.restaurante : null;
      const situacion = typeof crudos.situacion === "string" && isDueFilter(crudos.situacion) ? crudos.situacion : null;
      const filtros = { establishmentId: restaurante, state: situacion };
      return vista({
        tab: "vencimientos",
        now: new Date(),
        total: dueCharges(charges, { establishmentId: null, state: null }).length,
        rows: dueCharges(charges, filtros),
        establishments,
        filters: filtros,
        selectedId: pedido,
      });
    }

    // M51 · el desplegable lleva los que tienen algo pendiente; el cobro
    // pedido por enlace se enseña aunque ya esté pagado.
    const pendientes = dueCharges(charges, { establishmentId: null, state: null });
    const elegido = charges.find((c) => c.id === pedido) ?? pendientes[0] ?? null;
    const opciones = [...pendientes, ...(elegido && !pendientes.includes(elegido) ? [elegido] : [])].map((c) => ({
      id: c.id,
      label: es.teamArea.finance.paymentsOption(c.concept, c.establishment, euros(c.totalCents)),
    }));

    if (elegido === null) return vista({ tab: "pagos", data: { options: [], selected: null }, registerForm: null });

    const [{ data: cobrado }, pagos, justificantes] = await Promise.all([
      supabase.rpc("charge_collected_cents", { p_charge_id: elegido.id }),
      loadChargePayments(supabase, elegido.id),
      loadChargeReceipts(supabase, elegido.id),
    ]);

    return vista({
      tab: "pagos",
      data: {
        options: opciones,
        selected: {
          id: elegido.id,
          totalCents: elegido.totalCents,
          collectedCents: cobrado ?? 0,
          outstandingCents: elegido.outstanding,
          status: elegido.status,
          payments: pagos,
          receipts: justificantes,
        },
      },
      registerForm:
        elegido.outstanding > 0 ? (
          <RegisterPaymentForm
            chargeId={elegido.id}
            establishmentId={elegido.establishmentId}
            outstandingEuros={(elegido.outstanding / 100).toFixed(2)}
            defaultDay={hoy}
          />
        ) : null,
    });
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

  const [{ charges }, { data: nonpayment }] = await Promise.all([
    loadChargesWithStatus(supabase, space.id, desde, hasta),
    q.tab === "resumen"
      ? supabase.rpc("establishments_with_nonpayment", { p_space_id: space.id })
      : Promise.resolve({ data: [] }),
  ]);
  const chargeIds = charges.map((c) => c.id);

  // RN-FIN-06 · los justificantes que ha subido el restaurante. Solo se
  // mira si existen: el archivo se abre en el detalle del cobro.
  const { data: receipts } = chargeIds.length
    ? await supabase.from("receipts").select("charge_id, uploaded_side").in("charge_id", chargeIds)
    : { data: [] };
  const conJustificante = new Set(
    (receipts ?? []).filter((r) => r.uploaded_side === "client").map((r) => r.charge_id),
  );

  const rows: FinanceChargeRow[] = charges.map((c) => ({
    id: c.id,
    issuedAt: c.issuedAt,
    establishment: c.establishment,
    concept: c.concept,
    baseCents: c.baseCents,
    taxCents: c.taxCents,
    taxRatePercent: c.taxRatePercent,
    totalCents: c.totalCents,
    status: c.status,
    outstanding: c.outstanding,
    receiptWaiting: c.outstanding > 0 && conJustificante.has(c.id),
  }));

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
