import Link from "next/link";

import { Card, EmptyState, ErrorState, NoPermissionState, PageHeader, StatusBadge } from "@/components/ui";
import { formatCallTime, microsToCents, monthStart } from "@/core/agents/balance";
import { agentsPageHref } from "@/core/reservations/agents-routes";
import { formatCentsAsEuros } from "@/core/reservations/money";
import { canReservations } from "@/core/reservations/permissions";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadBalancePage } from "@/services/agents/balance-gateway";
import { loadServiceDates } from "@/services/agents/billing-gateway";
import { movementLabel } from "@/services/agents/movement-label";
import { stripeStatus } from "@/services/agents/stripe";

import { requireAgentsPage } from "@/app/agents/agents-context";
import { TopupForm } from "../_components/TopupForm";

export const dynamic = "force-dynamic";

const LATEST = 10;
const ALL = 200;

const MINUS = "−";

function signed(cents: number): string {
  if (cents === 0) return formatCentsAsEuros(0);
  return cents > 0 ? `+${formatCentsAsEuros(cents)}` : `${MINUS}${formatCentsAsEuros(-cents)}`;
}

/**
 * Saldo (`AgentsSaldo` y `AgenteSaldoMovil`, PRD de agents §5.2 y §11.1): lo que hay, para cuántos minutos de
 * llamadas da, recargar, en qué se ha gastado el mes y los últimos movimientos. Lo ven el Propietario y el
 * Encargado (y Restavor, y el soporte en sesión); recargar es solo del Propietario. La tablet del local no lo ve.
 *
 * Los importes salen del libro del saldo (`agent_balance_entries`, en millonésimas) y de las funciones de la
 * base de datos; aquí no se calcula ningún saldo ni se inventa ningún gasto: sin llamadas ni avisos, dice que
 * todavía no hay gasto. Recargar con tarjeta está «Próximamente» mientras Stripe no esté configurado (decisión 144).
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ recarga?: string; todos?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const access = await requireAgentsPage(id, "balance");
  const t = es.agents.balance;
  const title = es.agents.menu.balance;
  if (access.kind === "denied") {
    return (
      <div className="space-y-6">
        <PageHeader title={title} />
        <NoPermissionState description={t.noPermission} />
      </div>
    );
  }
  const { nav } = access;
  const showAll = query.todos === "1";

  const client = await createClient();
  const dates = await loadServiceDates(client, id).catch(() => null);
  if (!dates) {
    return (
      <div className="space-y-6">
        <PageHeader title={title} subtitle={nav.name} />
        <ErrorState title={es.agents.billing.failedTitle} description={es.agents.billing.failedReason} />
      </div>
    );
  }

  const now = new Date();
  let data;
  try {
    data = await loadBalancePage(client, id, monthStart(now, dates.timeZone), showAll ? ALL : LATEST);
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title={title} subtitle={nav.name} />
        <ErrorState title={es.agents.billing.failedTitle} description={es.agents.billing.failedReason} />
      </div>
    );
  }

  const canTopup = canReservations(nav.actor, "topup", { serviceStatus: nav.serviceStatus });
  const stripe = stripeStatus();
  const month = enZona(now.toISOString(), dates.timeZone, { month: "long" });
  const when = (iso: string) => enZona(iso, dates.timeZone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={title} subtitle={nav.name} />
      <p className="text-sm text-text-secondary">{t.intro}</p>

      {query.recarga === "ok" ? (
        <p role="status" className="rounded-field border border-border bg-cuotly-green/10 px-4 py-3 text-sm text-text" data-testid="topup-returned-ok">
          {t.topup.returnedOk}
        </p>
      ) : null}
      {query.recarga === "cancelada" ? (
        <p role="status" className="rounded-field border border-border px-4 py-3 text-sm text-text" data-testid="topup-returned-cancelled">
          {t.topup.returnedCancelled}
        </p>
      ) : null}

      {data.state === "empty" ? (
        <div role="alert" className="rounded-field border border-danger/30 bg-danger/5 px-4 py-3" data-testid="balance-empty-bar">
          <p className="text-[15px] font-semibold text-text">{t.emptyBar}</p>
          <p className="mt-1 text-sm text-text-secondary">{t.emptyBarReason}</p>
        </div>
      ) : data.state === "low" ? (
        <div role="status" className="rounded-field border border-border bg-soft-surface px-4 py-3" data-testid="balance-low-bar">
          <p className="text-sm font-semibold text-text">{t.lowBar(formatCentsAsEuros(data.balanceCents))}</p>
        </div>
      ) : null}

      <Card title={t.available}>
        <p className="text-4xl font-bold text-text" data-testid="balance-amount">
          {formatCentsAsEuros(data.balanceCents)}
        </p>
        {data.minutes !== null ? (
          <p className="mt-1 text-sm text-text-secondary" data-testid="balance-minutes">
            {t.minutes(data.minutes)}
          </p>
        ) : null}
        <p className="mt-4 text-xs text-text-secondary">
          {data.thresholdCents > 0 ? `${t.alertLine(formatCentsAsEuros(data.thresholdCents))} ` : ""}
          {t.afterZero}
        </p>
      </Card>

      {canTopup ? (
        <Card title={t.topup.title}>
          {stripe.ready ? (
            <TopupForm establishmentId={id} vatRatePercent={data.vatRatePercent} />
          ) : (
            <div data-testid="topup-soon">
              <StatusBadge tone="info">{t.topup.soonTitle}</StatusBadge>
              <p className="mt-3 text-sm text-text-secondary">{t.topup.soonBody}</p>
            </div>
          )}
        </Card>
      ) : (
        <p className="text-sm text-text-secondary" data-testid="topup-owner-only">
          {t.topup.notOwner}
        </p>
      )}

      <Card title={t.spend.title(month)}>
        {data.spend.rows.length === 0 ? (
          <EmptyState title={t.spend.emptyTitle} description={t.spend.emptyReason} />
        ) : (
          <ul className="divide-y divide-border" data-testid="balance-spend">
            {data.spend.rows.map((row) => (
              <li key={row.kind} className="flex items-center gap-3 py-3" data-testid={`spend-${row.kind}`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-text">
                    {row.kind === "call" ? t.spend.calls : row.kind === "whatsapp" ? t.spend.whatsapp : t.spend.sms}
                  </span>
                  <span className="block text-xs text-text-secondary">
                    {row.kind === "call"
                      ? t.spend.callsDetail(data.spend.calls.count, formatCallTime(data.spend.calls.seconds))
                      : t.spend.notices(row.entries)}
                  </span>
                </span>
                <span className="text-[15px] font-semibold text-text">{formatCentsAsEuros(row.cents)}</span>
              </li>
            ))}
            {data.spend.refundedCents > 0 ? (
              <li className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1 text-sm text-text-secondary">{t.spend.refunds}</span>
                <span className="text-[15px] font-semibold text-text">{signed(data.spend.refundedCents)}</span>
              </li>
            ) : null}
            <li className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1 text-sm font-semibold text-text">{t.spend.total}</span>
              <span className="text-[15px] font-bold text-text" data-testid="spend-total">
                {formatCentsAsEuros(data.spend.totalCents)}
              </span>
            </li>
          </ul>
        )}
      </Card>

      <Card title={t.movements.title}>
        {data.movements.length === 0 ? (
          <EmptyState title={t.movements.emptyTitle} description={t.movements.emptyReason} />
        ) : (
          <ul className="divide-y divide-border" data-testid="balance-movements">
            {data.movements.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3" data-testid="movement">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-text">{movementLabel(m.kind, m.sourceType)}</span>
                  <span className="block text-xs text-text-secondary">
                    {when(m.createdAt)}
                    {m.kind === "adjustment" && m.note ? ` · ${m.note}` : ""}
                  </span>
                </span>
                <span className="text-[15px] font-semibold text-text">{signed(microsToCents(m.amountMicros))}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Link
            href={showAll ? agentsPageHref(id, "balance") : `${agentsPageHref(id, "balance")}?todos=1`}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-cuotly-green underline"
          >
            {showAll ? t.movements.seeLatest : t.movements.seeAll}
          </Link>
          <a
            href={`${agentsPageHref(id, "balance")}/exportar`}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-cuotly-green underline"
            data-testid="balance-download"
          >
            {t.movements.download}
          </a>
          {showAll ? <span className="text-xs text-text-secondary">{t.movements.showing(ALL)}</span> : null}
        </div>
      </Card>
    </div>
  );
}
