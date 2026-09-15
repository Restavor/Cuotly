import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Card,
  EmptyState,
  ErrorState,
  NoPermissionState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import {
  isSpaceReadOnly,
  type CuotlyChargeStatus,
  type CuotlyPlan,
  type SpaceCuotlyState,
} from "@/core/cuotly-subscription";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { euros, gigabytes } from "@/i18n/money";
import { createClient } from "@/lib/supabase/server";

import { DeclarePaymentForm } from "./DeclarePaymentForm";

/**
 * RN-ADM-10 · la suscripción de Cuotly vista por el propietario: el modo,
 * el plan, los cobros con su estado derivado y la declaración de un pago.
 * Es el enlace al que los avisos del Hito 18 ya apuntaban (RN-NOT-04).
 *
 * Lo que se ve lo deciden las políticas de `cuotly_*` (`manage_space` o
 * la plataforma) y las columnas van enumeradas: quién confirmó o rechazó
 * un pago está revocado para el propietario (RN-SUB-12).
 */
export const dynamic = "force-dynamic";

function tono(status: CuotlyChargeStatus): "success" | "info" | "danger" | "neutral" {
  if (status === "paid") return "success";
  if (status === "overdue") return "danger";
  if (status === "declared") return "info";
  return "neutral";
}

export default async function SubscriptionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, timezone, cuotly_status, cuotly_plan, cuotly_trial_ends_at, cuotly_reactivation_deadline_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const { data: canManage } = await supabase.rpc("has_capability", {
    p_space_id: space.id,
    p_capability: "manage_space",
  });

  const t = es.cuotlySubscription;

  if (!canManage) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{t.title}</h1>
        <NoPermissionState title={t.noAccessTitle} description={t.noAccessReason} />
      </div>
    );
  }

  const cuando = (value: string | null) =>
    value === null ? "—" : enZona(value, space.timezone, { dateStyle: "short" });

  const status = space.cuotly_status as SpaceCuotlyState | null;

  if (status === null) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-8">
        <p className="text-sm">
          <Link href={`/espacios/${slug}/ajustes`} className="text-cuotly-green underline">
            {t.back}
          </Link>
        </p>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <EmptyState title={t.noPlanTitle} description={t.noPlanReason} />
      </div>
    );
  }

  const [{ data: subscription }, { data: charges, error: chargesError }, { data: usage }] = await Promise.all([
    supabase
      .from("cuotly_subscriptions")
      .select(
        "plan, extra_establishments, extra_users, current_period_start, current_period_end, pending_plan, pending_requested_at",
      )
      .eq("space_id", space.id)
      .maybeSingle(),
    supabase
      .from("cuotly_charges")
      .select("id, reference, concept, kind, total_cents, period_start, period_end, due_at, issued_at")
      .eq("space_id", space.id)
      .order("due_at", { ascending: false }),
    supabase.rpc("cuotly_space_usage", { p_space_id: space.id }),
  ]);

  if (chargesError) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <ErrorState title={t.errorTitle} description={chargesError.message} />
      </div>
    );
  }

  // El estado y la deuda viva se derivan en el servidor (RN-DAT-05), cobro
  // a cobro: no hay columna de estado que leer.
  const cobros = await Promise.all(
    (charges ?? []).map(async (c) => {
      const [{ data: estado }, { data: pendiente }] = await Promise.all([
        supabase.rpc("cuotly_charge_status", { p_charge_id: c.id }),
        supabase.rpc("cuotly_charge_outstanding_cents", { p_charge_id: c.id }),
      ]);
      return {
        ...c,
        status: (estado ?? "pending") as CuotlyChargeStatus,
        outstandingCents: pendiente ?? 0,
      };
    }),
  );

  const { data: payments } = await supabase
    .from("cuotly_payments")
    .select("id, charge_id, amount_cents, method, paid_at, declared_at, confirmed_at, rejected_at, rejection_reason, reversed_at")
    .eq("space_id", space.id)
    .order("declared_at", { ascending: false });

  const declarables = cobros
    .filter((c) => c.status === "pending" || c.status === "overdue")
    .map((c) => ({ id: c.id, reference: c.reference, concept: c.concept, outstandingCents: c.outstandingCents }));

  const uso = usage && usage.length > 0 ? usage[0] : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header>
        <p className="text-sm">
          <Link href={`/espacios/${slug}/ajustes`} className="text-cuotly-green underline">
            {t.back}
          </Link>
        </p>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
      </header>

      <Card>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t.statusLabel}</dt>
            <dd className="text-sm">
              <StatusBadge tone={status === "active" ? "success" : status === "trial" ? "info" : "danger"}>
                {t.statuses[status]}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t.planLabel}</dt>
            <dd className="text-sm">
              {space.cuotly_plan ? t.plans[space.cuotly_plan as CuotlyPlan] : "—"}
              {subscription?.pending_plan ? (
                <span className="block text-xs text-text-secondary">
                  {t.pendingPlanLabel} {t.plans[subscription.pending_plan as CuotlyPlan]}
                </span>
              ) : null}
            </dd>
          </div>
          {status === "trial" ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t.trialEndsLabel}</dt>
              <dd className="text-sm">{cuando(space.cuotly_trial_ends_at)}</dd>
            </div>
          ) : subscription ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t.periodLabel}</dt>
              <dd className="text-sm">
                {cuando(subscription.current_period_start)} → {cuando(subscription.current_period_end)}
              </dd>
            </div>
          ) : null}
          {isSpaceReadOnly(status) ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t.reactivationLabel}</dt>
              <dd className="text-sm">{cuando(space.cuotly_reactivation_deadline_at)}</dd>
            </div>
          ) : null}
          {subscription && space.cuotly_plan === "pro" ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t.extrasLabel}</dt>
              <dd className="text-sm">{t.extrasValue(subscription.extra_establishments, subscription.extra_users)}</dd>
            </div>
          ) : null}
          {uso ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t.usageLabel}</dt>
              <dd className="text-sm">
                {t.usageValue(uso.active_establishments, uso.internal_users, gigabytes(uso.storage_bytes))}
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <Card title={t.chargesTitle}>
        <p className="mb-3 text-sm text-text-secondary">{t.chargesHint}</p>
        {cobros.length === 0 ? (
          <EmptyState title={t.emptyChargesTitle} description={t.emptyChargesReason} />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t.reference}</TableHeaderCell>
                <TableHeaderCell>{t.concept}</TableHeaderCell>
                <TableHeaderCell>{t.period}</TableHeaderCell>
                <TableHeaderCell>{t.total}</TableHeaderCell>
                <TableHeaderCell>{t.outstanding}</TableHeaderCell>
                <TableHeaderCell>{t.due}</TableHeaderCell>
                <TableHeaderCell>{t.status}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cobros.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.reference}</TableCell>
                  <TableCell>{c.concept}</TableCell>
                  <TableCell>
                    {cuando(c.period_start)} → {cuando(c.period_end)}
                  </TableCell>
                  <TableCell>{euros(c.total_cents)}</TableCell>
                  <TableCell>{euros(c.outstandingCents)}</TableCell>
                  <TableCell>{cuando(c.due_at)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={tono(c.status)}>{t.statusesCharge[c.status]}</StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {declarables.length > 0 ? (
        <Card title={t.declareTitle}>
          <p className="mb-1 text-sm font-semibold text-text">{t.bankTitle}</p>
          <p className="mb-3 text-sm text-text-secondary">{t.bankHint}</p>
          <p className="mb-4 text-sm text-text-secondary">{t.declareHint}</p>
          <DeclarePaymentForm charges={declarables} />
        </Card>
      ) : null}

      {payments && payments.length > 0 ? (
        <Card title={t.paymentsTitle}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t.reference}</TableHeaderCell>
                <TableHeaderCell>{t.total}</TableHeaderCell>
                <TableHeaderCell>{es.platformAdmin.charges.method}</TableHeaderCell>
                <TableHeaderCell>{es.platformAdmin.charges.paidAt}</TableHeaderCell>
                <TableHeaderCell>{t.status}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payments.map((p) => {
                const estado = p.reversed_at
                  ? "reversed"
                  : p.rejected_at
                    ? "rejected"
                    : p.confirmed_at
                      ? "confirmed"
                      : "pending";
                return (
                  <TableRow key={p.id}>
                    <TableCell>{cobros.find((c) => c.id === p.charge_id)?.reference ?? "—"}</TableCell>
                    <TableCell>{euros(p.amount_cents)}</TableCell>
                    <TableCell>{es.platformAdmin.charges.methods[p.method as "transfer" | "bizum"] ?? p.method}</TableCell>
                    <TableCell>{cuando(p.paid_at)}</TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={estado === "confirmed" ? "success" : estado === "pending" ? "info" : "danger"}
                      >
                        {t.paymentState[estado]}
                      </StatusBadge>
                      {p.rejection_reason ? (
                        <span className="block text-xs text-text-secondary">{p.rejection_reason}</span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
