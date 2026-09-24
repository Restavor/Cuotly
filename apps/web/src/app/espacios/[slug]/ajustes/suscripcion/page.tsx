import { notFound, redirect } from "next/navigation";

import {
  Card,
  EmptyState,
  ErrorState,
  NoPermissionState,
  ProgressBar,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import {
  CUOTLY_PLAN_TERMS,
  isSpaceReadOnly,
  spaceLimits,
  type CuotlyChargeStatus,
  type CuotlyPlan,
  type SpaceCuotlyState,
} from "@/core/cuotly-subscription";
import { Icon } from "@/components/ui/Icon";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { euros, gigabytes } from "@/i18n/money";
import { createClient } from "@/lib/supabase/server";

import { SettingsHeader } from "../SettingsHeader";
import { DeclarePaymentForm } from "./DeclarePaymentForm";
import { CancelCuotlyPlanChangeForm, ChangeCuotlyPlanForm } from "./PlanChangeForms";

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
      <div className="space-y-6">
        <SettingsHeader slug={slug} active="subscription" />
        <NoPermissionState title={t.noAccessTitle} description={t.noAccessReason} />
      </div>
    );
  }

  const cuando = (value: string | null) =>
    value === null ? "—" : enZona(value, space.timezone, { dateStyle: "short" });
  const fechaLarga = (value: string | null) =>
    value === null ? "—" : enZona(value, space.timezone, { day: "numeric", month: "long", year: "numeric" });

  const status = space.cuotly_status as SpaceCuotlyState | null;

  if (status === null) {
    return (
      <div className="space-y-6">
        <SettingsHeader slug={slug} active="subscription" />
        <EmptyState title={t.noPlanTitle} description={t.noPlanReason} />
      </div>
    );
  }

  const [{ data: subscription }, { data: charges, error: chargesError }, { data: usage }] = await Promise.all([
    supabase
      .from("cuotly_subscriptions")
      .select(
        "plan, extra_establishments, extra_users, pending_extra_establishments, pending_extra_users, current_period_start, current_period_end, pending_plan, pending_requested_at",
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
      <div className="space-y-6">
        <SettingsHeader slug={slug} active="subscription" />
        <ErrorState title={t.errorTitle} description={chargesError.message} />
      </div>
    );
  }

  // El estado de cada cobro lo deriva el servidor (RN-SUB-06), igual que
  // lo que queda por pagar: la pantalla no lo recalcula.
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

  // Quién confirmó o rechazó un pago está revocado para el propietario
  // (RN-SUB-12): se enumeran solo las columnas que puede leer.
  const { data: payments } = await supabase
    .from("cuotly_payments")
    .select("id, charge_id, amount_cents, method, paid_at, declared_at, confirmed_at, rejected_at, rejection_reason, reversed_at")
    .eq("space_id", space.id)
    .order("declared_at", { ascending: false });

  const declarables = cobros
    .filter((c) => c.status === "pending" || c.status === "overdue")
    .map((c) => ({ id: c.id, reference: c.reference, concept: c.concept, outstandingCents: c.outstandingCents }));

  const uso = usage && usage.length > 0 ? usage[0] : null;
  const plan = (space.cuotly_plan ?? subscription?.plan ?? null) as CuotlyPlan | null;
  const terms = plan ? CUOTLY_PLAN_TERMS[plan] : null;
  const limites = spaceLimits(
    subscription && plan
      ? {
          plan,
          extraEstablishments: subscription.extra_establishments,
          extraUsers: subscription.extra_users,
          pendingPlan: (subscription.pending_plan as CuotlyPlan | null) ?? null,
          pendingExtraEstablishments: subscription.pending_extra_establishments,
          pendingExtraUsers: subscription.pending_extra_users,
        }
      : null,
    status,
  );
  const otro: CuotlyPlan | null = plan === "pro" ? "agency" : plan === "agency" ? "pro" : null;
  const proTerms = CUOTLY_PLAN_TERMS.pro;
  // RN-SUB-10 · para bajar a Pro hay que contratar lo que el uso de hoy
  // pida por encima de lo incluido. Es solo la propuesta del formulario:
  // el servidor lo vuelve a comprobar.
  const minExtraEst = uso ? Math.max(0, uso.active_establishments - (proTerms.includedEstablishments ?? 0)) : 0;
  const minExtraUsers = uso ? Math.max(0, uso.internal_users - (proTerms.includedUsers ?? 0)) : 0;

  const lineaUso = (usados: number, limite: number | null) =>
    limite === null ? t.usageUnlimited(usados) : t.usageOf(usados, limite);
  const pct = (usados: number, limite: number | null) => (limite === null || limite === 0 ? 0 : (usados / limite) * 100);

  return (
    <div className="space-y-6">
      <SettingsHeader slug={slug} active="subscription" />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-primary-dark">{t.currentPlanTitle}</h2>
              <StatusBadge tone={status === "active" ? "success" : status === "trial" ? "info" : "danger"}>
                {t.statuses[status]}
              </StatusBadge>
            </div>
            <p className="mt-3 text-2xl font-bold text-primary-dark">
              {plan ? `Cuotly ${t.plans[plan]}` : "—"}
            </p>
            {terms ? (
              <p className="text-xl font-bold text-primary-dark">{t.pricePerMonth(euros(terms.priceCents))}</p>
            ) : null}

            <ul className="mt-4 space-y-3 text-sm" data-testid="suscripcion-uso">
              <li className="flex items-center gap-2 text-text">
                <Icon name="check" className="h-4 w-4 text-cuotly-green" />
                {t.includedSpace(space.name)}
              </li>
              {uso ? (
                <>
                  <li className="space-y-1">
                    <span className="flex items-center justify-between gap-3 text-text">
                      <span>{t.establishmentsLine}</span>
                      <span className="font-semibold">{lineaUso(uso.active_establishments, limites.maxEstablishments)}</span>
                    </span>
                    {limites.maxEstablishments !== null ? (
                      <ProgressBar
                        percent={pct(uso.active_establishments, limites.maxEstablishments)}
                        label={`${t.establishmentsLine}: ${lineaUso(uso.active_establishments, limites.maxEstablishments)}`}
                      />
                    ) : null}
                  </li>
                  <li className="space-y-1">
                    <span className="flex items-center justify-between gap-3 text-text">
                      <span>{t.usersLine}</span>
                      <span className="font-semibold">{lineaUso(uso.internal_users, limites.maxUsers)}</span>
                    </span>
                    {limites.maxUsers !== null ? (
                      <ProgressBar
                        percent={pct(uso.internal_users, limites.maxUsers)}
                        label={`${t.usersLine}: ${lineaUso(uso.internal_users, limites.maxUsers)}`}
                      />
                    ) : null}
                  </li>
                  {terms ? (
                    <li className="flex items-center justify-between gap-3 text-text">
                      <span>{t.storageLine}</span>
                      <span className="font-semibold">{t.storageValue(gigabytes(uso.storage_bytes), terms.storageGb)}</span>
                    </li>
                  ) : null}
                </>
              ) : null}
            </ul>

            {plan === "pro" && terms ? (
              <div className="mt-5 border-t border-border pt-4 text-sm">
                <p className="mb-2 font-semibold text-text">{t.extrasTitle}</p>
                <dl className="space-y-1.5">
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">{t.extraEstablishment}</dt>
                    <dd className="text-text">{t.pricePerMonth(euros(terms.extraEstablishmentCents ?? 0))}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">{t.extraUser}</dt>
                    <dd className="text-text">{t.pricePerMonth(euros(terms.extraUserCents ?? 0))}</dd>
                  </div>
                  {subscription ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-text-secondary">{t.extrasLabel}</dt>
                      <dd className="text-text">
                        {t.extrasValue(subscription.extra_establishments, subscription.extra_users)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            ) : null}
          </Card>

          <Card title={t.historyTitle}>
            <p className="mb-3 text-xs text-text-secondary">{t.chargesHint}</p>
            {cobros.length === 0 ? (
              <EmptyState title={t.emptyChargesTitle} description={t.emptyChargesReason} />
            ) : (
              <div className="relative overflow-x-auto">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>{t.due}</TableHeaderCell>
                      <TableHeaderCell>{t.concept}</TableHeaderCell>
                      <TableHeaderCell>{t.total}</TableHeaderCell>
                      <TableHeaderCell>{t.status}</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cobros.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <span className="whitespace-nowrap text-sm">{cuando(c.due_at)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{c.concept}</span>
                          <span className="block text-xs text-text-secondary">
                            {c.reference} · {cuando(c.period_start)} → {cuando(c.period_end)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="whitespace-nowrap text-sm">{euros(c.total_cents)}</span>
                          {c.outstandingCents > 0 && c.outstandingCents !== c.total_cents ? (
                            <span className="block text-xs text-text-secondary">
                              {t.outstanding}: {euros(c.outstandingCents)}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={tono(c.status)}>{t.statusesCharge[c.status]}</StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          {payments && payments.length > 0 ? (
            <Card title={t.paymentsTitle}>
              <div className="relative overflow-x-auto">
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
                          <TableCell>
                            {es.platformAdmin.charges.methods[p.method as "transfer" | "bizum"] ?? p.method}
                          </TableCell>
                          <TableCell>{cuando(p.paid_at)}</TableCell>
                          <TableCell>
                            <StatusBadge tone={estado === "confirmed" ? "success" : estado === "pending" ? "info" : "danger"}>
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
              </div>
            </Card>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4">
          <Card title={t.renewalTitle}>
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-soft-surface text-primary-dark">
                <Icon name="calendar" className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm text-text-secondary">{status === "trial" ? t.trialEnds : t.nextRenewal}</p>
                <p className="font-semibold text-text">
                  {status === "trial"
                    ? fechaLarga(space.cuotly_trial_ends_at)
                    : fechaLarga(subscription?.current_period_end ?? null)}
                </p>
                {isSpaceReadOnly(status) ? (
                  <p className="mt-1 text-sm text-danger">
                    {t.reactivationLabel} {cuando(space.cuotly_reactivation_deadline_at)}
                  </p>
                ) : null}
              </div>
            </div>

            {declarables.length > 0 ? (
              <div className="mt-4 rounded-[10px] bg-danger/5 p-4">
                <p className="font-semibold text-text">{t.pendingPaymentTitle}</p>
                <p className="mb-3 text-sm text-text-secondary">{t.pendingPaymentHint}</p>
                <p className="mb-1 text-sm font-semibold text-text">{t.bankTitle}</p>
                <p className="mb-3 text-sm text-text-secondary">{t.bankHint}</p>
                <DeclarePaymentForm charges={declarables} />
              </div>
            ) : (
              <p className="mt-4 text-sm text-text-secondary">{t.nothingPending}</p>
            )}
          </Card>

          {otro ? (
            <Card title={t.compareTitle}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-lg font-bold text-primary-dark">Cuotly {t.plans[otro]}</p>
                  <p className="text-xl font-bold text-primary-dark">
                    {t.pricePerMonth(euros(CUOTLY_PLAN_TERMS[otro].priceCents))}
                  </p>
                </div>
                <ul className="space-y-1.5 text-sm text-text">
                  {[
                    t.features.oneSpace,
                    t.features.establishments(CUOTLY_PLAN_TERMS[otro].includedEstablishments),
                    t.features.users(CUOTLY_PLAN_TERMS[otro].includedUsers),
                    t.features.storage(CUOTLY_PLAN_TERMS[otro].storageGb),
                  ]
                    .filter((f): f is string => f !== null)
                    .map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-cuotly-green" />
                        {f}
                      </li>
                    ))}
                </ul>
              </div>
              <div className="mt-4 border-t border-border pt-4">
                {status === "trial" ? (
                  <p className="text-sm text-text-secondary">{t.change.trialNoChange}</p>
                ) : subscription?.pending_plan ? (
                  <div className="space-y-2">
                    <p className="text-sm text-text">
                      {t.change.scheduled(t.plans[subscription.pending_plan as CuotlyPlan])}
                    </p>
                    <CancelCuotlyPlanChangeForm spaceId={space.id} />
                  </div>
                ) : isSpaceReadOnly(status) ? null : (
                  <>
                    <p className="mb-3 text-sm text-text-secondary">
                      {otro === "agency" ? t.change.agencyHint : t.change.proHint}
                    </p>
                    <ChangeCuotlyPlanForm
                      spaceId={space.id}
                      target={otro}
                      minExtraEstablishments={minExtraEst}
                      minExtraUsers={minExtraUsers}
                    />
                  </>
                )}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
