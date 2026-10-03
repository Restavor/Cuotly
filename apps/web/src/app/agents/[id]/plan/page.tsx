import { Card, EmptyState, ErrorState, NoPermissionState, PageHeader, StatusBadge } from "@/components/ui";
import { hasDebt } from "@/core/agents/payment-info";
import {
  canRequestCancellation,
  canUndoCancellation,
  daysLeftOfGrace,
} from "@/core/reservations/lifecycle";
import { formatCentsAsEuros } from "@/core/reservations/money";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { reservationTerms } from "@/services/app-gateway";
import {
  loadPaymentInfo,
  loadPlanCharges,
  loadServiceDates,
  type PlanChargeStatus,
} from "@/services/agents/billing-gateway";

import { requireAgentsPage } from "@/app/agents/agents-context";
import { CancelServiceCard, UndoCancellationCard } from "../_components/CancellationCards";
import { PaymentDetails } from "../_components/PaymentDetails";

export const dynamic = "force-dynamic";

const CHARGE_TONE: Record<PlanChargeStatus, "success" | "warning" | "danger" | "info"> = {
  paid: "success",
  partially_paid: "warning",
  pending: "info",
  overdue: "danger",
};

/**
 * Plan y pagos (`AjustesPlan`, PRD de agents §11.1; sin plan anual): la cuota de Reservas, en qué estado está, los
 * datos para pagar si se debe algo, los cobros, y «Darme de baja» o «Anular la baja». Es del Propietario (y de
 * Restavor): el Encargado y el Equipo no la abren (PRD §3.2). Cada botón repite el permiso en la base de datos.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAgentsPage(id, "plan");
  const t = es.agents.billing.plan;
  const title = es.agents.menu.plan;
  if (access.kind === "denied") {
    return (
      <div className="space-y-6">
        <PageHeader title={title} />
        <NoPermissionState />
      </div>
    );
  }
  const { nav } = access;

  const client = await createClient();
  let dates;
  let charges;
  let info;
  let terms;
  try {
    [dates, charges, info, terms] = await Promise.all([
      loadServiceDates(client, id),
      loadPlanCharges(client, id),
      loadPaymentInfo(client, id),
      reservationTerms(client, id).catch(() => null),
    ]);
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title={title} subtitle={nav.name} />
        <ErrorState title={es.agents.billing.failedTitle} description={es.agents.billing.failedReason} />
      </div>
    );
  }
  if (!dates) {
    return (
      <div className="space-y-6">
        <PageHeader title={title} subtitle={nav.name} />
        <ErrorState title={es.agents.billing.failedTitle} description={es.agents.billing.failedReason} />
      </div>
    );
  }

  const now = new Date();
  const status = nav.serviceStatus;
  const longDate = (iso: string) => enZona(iso, dates.timeZone, { day: "numeric", month: "long", year: "numeric" });
  const shortDate = (iso: string) => enZona(iso, dates.timeZone, { day: "numeric", month: "short" });

  // El precio sin IVA sale del servicio (si el espacio aún lo ofrece) y, con IVA, del último cobro emitido.
  const latest = charges[0];
  const priceLine =
    terms !== null
      ? t.priceLine(formatCentsAsEuros(terms.priceCents), latest ? formatCentsAsEuros(latest.totalCents) : null)
      : null;

  let statusLine: string | null = null;
  if (status === "active") statusLine = t.statusActive;
  else if (status === "past_due") {
    statusLine = info
      ? t.statusPastDue(daysLeftOfGrace(new Date(info.dueAt), now, dates.graceDays))
      : t.statusPastDue(dates.graceDays);
  } else if (status === "paused") statusLine = t.statusPaused;
  else if (status === "ending" && dates.endingAt) statusLine = t.statusEnding(longDate(dates.endingAt));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={title} subtitle={nav.name} />

      <Card title={t.cardTitle}>
        {priceLine ? <p className="text-[15px] font-semibold text-text">{priceLine}</p> : null}
        {statusLine ? (
          <p
            role="status"
            className={`mt-2 text-sm ${status === "past_due" || status === "paused" ? "font-semibold text-pending-text" : "text-text-secondary"}`}
            data-testid="plan-status"
          >
            {statusLine}
          </p>
        ) : null}
      </Card>

      {info && hasDebt(info) ? <PaymentDetails info={info} timeZone={dates.timeZone} /> : null}

      <Card title={t.chargesTitle}>
        {charges.length === 0 ? (
          <EmptyState title={t.chargesEmptyTitle} description={t.chargesEmptyReason} />
        ) : (
          <ul className="divide-y divide-border" data-testid="plan-charges">
            {charges.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-text">
                    {t.chargePeriod(shortDate(c.periodStart), shortDate(c.periodEnd))}
                  </span>
                  <span className="block text-xs text-text-secondary">
                    {formatCentsAsEuros(c.totalCents)} · {t.chargeDue(longDate(c.dueAt))}
                    {c.outstandingCents > 0 && c.status !== "pending" && c.status !== "overdue"
                      ? ` · ${t.chargeLeft(formatCentsAsEuros(c.outstandingCents))}`
                      : ""}
                  </span>
                </span>
                <StatusBadge tone={CHARGE_TONE[c.status]}>{t.chargeStatus[c.status]}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canRequestCancellation(status) ? <CancelServiceCard establishmentId={id} /> : null}
      {status === "ending" && canUndoCancellation(status, dates.endingAt ? new Date(dates.endingAt) : null, now) ? (
        <UndoCancellationCard establishmentId={id} />
      ) : null}
    </div>
  );
}
