import { notFound, redirect } from "next/navigation";

import { RegisterPaymentForm } from "@/components/RegisterPaymentForm";
import { Card, EmptyState, NoPermissionState, PageHeader } from "@/components/ui";
import { todayInTimeZone } from "@/core/finance";
import { chargeTimeline } from "@/core/finance-summary";
import { DEFAULT_TIMEZONE } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadEstablishmentPhotos } from "@/services/establishment-photo";

import { ChargeDetailView } from "./ChargeDetailView";

/**
 * M17 · el detalle de un cobro para el equipo.
 *
 * Es de Finanzas, así que pide lo mismo que Finanzas: `manage_finance`
 * (CA-03). El registro del pago lo vuelve a comprobar `register_payment()`
 * en el servidor, y lo que se ve de cada tabla lo decide RLS.
 *
 * Nada se suma: lo recibido, lo pendiente y el estado salen de sus
 * funciones sobre el libro de apuntes (RN-FIN-02). Tampoco se enseña quién
 * registró cada pago ni quién subió el justificante: `recorded_by` y
 * `uploaded_by` son identidad y están tapadas por privilegios de columna;
 * se dice si lo subió el restaurante o el equipo, que es lo que importa
 * para revisarlo (CLAUDE.md).
 */
export const dynamic = "force-dynamic";

export default async function TeamChargePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const t = es.teamArea.finance;
  const { data: canManage } = await supabase.rpc("has_capability", {
    p_space_id: space.id,
    p_capability: "manage_finance",
  });
  if (canManage !== true) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} />
        <NoPermissionState title={t.noPermissionTitle} description={t.noPermissionReason} />
      </div>
    );
  }

  const { data: charge } = await supabase
    .from("charges")
    .select(
      "id, establishment_id, subscription_id, quote_id, concept, period_start, period_end, base_cents, tax_rate_percent, tax_cents, total_cents, due_at, issued_at",
    )
    .eq("id", id)
    .eq("space_id", space.id)
    .maybeSingle();

  if (!charge) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} />
        <Card>
          <EmptyState title={t.chargeNotFoundTitle} description={t.chargeNotFoundReason} />
        </Card>
      </div>
    );
  }

  const zona = space.timezone ?? DEFAULT_TIMEZONE;

  const [
    { data: status },
    { data: outstanding },
    { data: collected },
    { data: establishment },
    { data: subscription },
    { data: receipts },
    { data: payments },
    fotos,
  ] = await Promise.all([
    supabase.rpc("charge_status", { p_charge_id: charge.id }),
    supabase.rpc("charge_outstanding_cents", { p_charge_id: charge.id }),
    supabase.rpc("charge_collected_cents", { p_charge_id: charge.id }),
    supabase
      .from("establishments")
      .select("id, name, code, city")
      .eq("id", charge.establishment_id)
      .maybeSingle(),
    charge.subscription_id
      ? supabase
          .from("subscriptions")
          .select("kind, plan_id, service_id")
          .eq("id", charge.subscription_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("receipts")
      .select("file_id, uploaded_side, created_at")
      .eq("charge_id", charge.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("payments")
      .select("id, amount_cents, method, paid_at, reversed_at, reversal_reason")
      .eq("charge_id", charge.id)
      .order("paid_at", { ascending: true }),
    loadEstablishmentPhotos(supabase, supabase.storage, [charge.establishment_id]),
  ]);

  // El nombre del plan o del servicio del que sale el cobro.
  const [{ data: plan }, { data: service }] = await Promise.all([
    subscription?.plan_id
      ? supabase.from("plans").select("name").eq("id", subscription.plan_id).maybeSingle()
      : Promise.resolve({ data: null }),
    subscription?.service_id
      ? supabase.from("services").select("name").eq("id", subscription.service_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const fileIds = [...new Set((receipts ?? []).map((r) => r.file_id))];
  const { data: files } = fileIds.length
    ? await supabase.from("files").select("id, name").in("id", fileIds)
    : { data: [] };
  const nombreArchivo = new Map((files ?? []).map((f) => [f.id, f.name]));
  // Un justificante cuyo archivo no se puede leer no se enseña como un
  // hueco: `can_read_file()` ha decidido que no está (RN-ARC-05).
  const justificantes = (receipts ?? [])
    .filter((r) => nombreArchivo.has(r.file_id))
    .map((r) => ({
      fileId: r.file_id,
      name: nombreArchivo.get(r.file_id) ?? "",
      side: r.uploaded_side,
      at: r.created_at,
    }));

  const pendiente = outstanding ?? 0;

  return (
    <ChargeDetailView
      slug={slug}
      timeZone={zona}
      data={{
        concept: charge.concept,
        periodStart: charge.period_start,
        periodEnd: charge.period_end,
        dueAt: charge.due_at,
        baseCents: charge.base_cents,
        taxCents: charge.tax_cents,
        taxRatePercent: Number(charge.tax_rate_percent),
        totalCents: charge.total_cents,
        receivedCents: collected ?? 0,
        outstandingCents: pendiente,
        status: status ?? "pending",
        establishment: {
          id: charge.establishment_id,
          name: establishment?.name ?? "—",
          code: establishment?.code ?? "",
          city: establishment?.city ?? null,
          photoUrl: fotos.get(charge.establishment_id) ?? null,
        },
        plan: plan
          ? { name: plan.name, kind: "plan" }
          : service
            ? { name: service.name, kind: "service" }
            : null,
        quoteId: charge.quote_id,
        receipts: justificantes,
        timeline: chargeTimeline({
          issuedAt: charge.issued_at,
          receipts: justificantes.map((r) => ({ at: r.at, side: r.side, name: r.name })),
          payments: (payments ?? []).map((p) => ({
            paidAt: p.paid_at,
            amountCents: p.amount_cents,
            method: p.method,
            reversedAt: p.reversed_at,
            reversalReason: p.reversal_reason,
          })),
        }),
      }}
      registerForm={
        pendiente > 0 ? (
          <RegisterPaymentForm
            chargeId={charge.id}
            establishmentId={charge.establishment_id}
            outstandingEuros={(pendiente / 100).toFixed(2)}
            defaultDay={todayInTimeZone(new Date(), zona)}
          />
        ) : null
      }
    />
  );
}
