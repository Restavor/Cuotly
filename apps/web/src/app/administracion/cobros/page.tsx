import {
  Card,
  EmptyState,
  ErrorState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { canManageSubscriptions } from "@/core/platform-admin";
import type { CuotlyChargeStatus, CuotlyPaymentMethod } from "@/core/cuotly-subscription";
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";
import { createClient } from "@/lib/supabase/server";
import {
  listCharges,
  listPendingPayments,
  myPlatformAccess,
  revenueByMonth,
  type PendingPaymentRow,
  type PlatformChargeRow,
  type RevenueMonthRow,
} from "@/services/platform-gateway";

import { PendingPaymentForms, RecordPaymentForm } from "./PaymentForms";

/**
 * Ingresos e impagos (§128): los pagos declarados que esperan la
 * confirmación humana de §4.5, los cobros con deuda viva y lo cobrado por
 * mes según el libro (RN-ADM-04, RN-SUB-06). Los formularios se pintan a
 * quien tiene `can_manage_subscriptions`; las funciones lo comprueban.
 */
export const dynamic = "force-dynamic";

function cuando(value: string): string {
  return enZona(value, CUOTLY_TIMEZONE, { dateStyle: "short" });
}

function tonoCobro(status: CuotlyChargeStatus): "success" | "info" | "danger" | "neutral" {
  if (status === "paid") return "success";
  if (status === "overdue") return "danger";
  if (status === "declared") return "info";
  return "neutral";
}

export default async function AdminChargesPage() {
  const supabase = await createClient();

  let pendientes: readonly PendingPaymentRow[];
  let cobros: readonly PlatformChargeRow[];
  let ingresos: readonly RevenueMonthRow[];
  let puede = false;
  try {
    const [p, c, r, access] = await Promise.all([
      listPendingPayments(supabase),
      listCharges(supabase, true),
      revenueByMonth(supabase, 12),
      myPlatformAccess(supabase),
    ]);
    pendientes = p;
    cobros = c;
    ingresos = r;
    puede = canManageSubscriptions(access);
  } catch (fallo) {
    return (
      <ErrorState
        title={es.platformAdmin.loadErrorTitle}
        description={fallo instanceof Error ? fallo.message : String(fallo)}
      />
    );
  }

  const t = es.platformAdmin.charges;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
        {!puede ? <p className="mt-1 text-sm text-text-secondary">{t.noPermissionHint}</p> : null}
      </header>

      <Card title={t.pendingTitle}>
        <p className="mb-3 text-sm text-text-secondary">{t.pendingHint}</p>
        {pendientes.length === 0 ? (
          <EmptyState title={t.emptyPendingTitle} description={t.emptyPendingReason} />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t.space}</TableHeaderCell>
                <TableHeaderCell>{t.reference}</TableHeaderCell>
                <TableHeaderCell>{t.amount}</TableHeaderCell>
                <TableHeaderCell>{t.method}</TableHeaderCell>
                <TableHeaderCell>{t.paidAt}</TableHeaderCell>
                <TableHeaderCell>{t.declaredBy}</TableHeaderCell>
                <TableHeaderCell>{t.receipt}</TableHeaderCell>
                {puede ? <TableHeaderCell>
                  <span className="sr-only">{es.platformAdmin.charges.pendingTitle}</span>
                </TableHeaderCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {pendientes.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.space_name}</TableCell>
                  <TableCell>{p.charge_reference}</TableCell>
                  <TableCell>{euros(p.amount_cents)}</TableCell>
                  <TableCell>{t.methods[p.method as CuotlyPaymentMethod] ?? p.method}</TableCell>
                  <TableCell>{cuando(p.paid_at)}</TableCell>
                  <TableCell>
                    {p.declared_by_email}
                    <span className="block text-xs text-text-secondary">
                      {t.declaredSide[p.declared_side as "owner" | "platform"] ?? p.declared_side}
                    </span>
                  </TableCell>
                  <TableCell>
                    {p.receipt_reference ?? "—"}
                    {p.note ? <span className="block text-xs text-text-secondary">{p.note}</span> : null}
                  </TableCell>
                  {puede ? (
                    <TableCell>
                      <PendingPaymentForms paymentId={p.id} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card title={t.openTitle}>
        <p className="mb-3 text-sm text-text-secondary">{t.openHint}</p>
        {cobros.length === 0 ? (
          <EmptyState title={t.emptyOpenTitle} description={t.emptyOpenReason} />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t.space}</TableHeaderCell>
                <TableHeaderCell>{t.reference}</TableHeaderCell>
                <TableHeaderCell>{t.concept}</TableHeaderCell>
                <TableHeaderCell>{t.amount}</TableHeaderCell>
                <TableHeaderCell>{t.outstanding}</TableHeaderCell>
                <TableHeaderCell>{t.due}</TableHeaderCell>
                <TableHeaderCell>{t.status}</TableHeaderCell>
                {puede ? <TableHeaderCell>{t.recordTitle}</TableHeaderCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {cobros.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.space_name}</TableCell>
                  <TableCell>{c.reference}</TableCell>
                  <TableCell>{c.concept}</TableCell>
                  <TableCell>{euros(c.total_cents)}</TableCell>
                  <TableCell>{euros(c.outstanding_cents)}</TableCell>
                  <TableCell>{cuando(c.due_at)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={tonoCobro(c.status as CuotlyChargeStatus)}>
                      {t.statuses[c.status as CuotlyChargeStatus] ?? c.status}
                    </StatusBadge>
                  </TableCell>
                  {puede ? (
                    <TableCell>
                      <RecordPaymentForm chargeId={c.id} outstandingCents={c.outstanding_cents} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card title={t.revenueTitle}>
        <p className="mb-3 text-sm text-text-secondary">{t.revenueHint}</p>
        {ingresos.length === 0 ? (
          <EmptyState title={t.emptyRevenueTitle} description={t.emptyRevenueReason} />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t.month}</TableHeaderCell>
                <TableHeaderCell>{t.paid}</TableHeaderCell>
                <TableHeaderCell>{t.payments}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ingresos.map((m) => (
                <TableRow key={m.month}>
                  <TableCell>{enZona(m.month, CUOTLY_TIMEZONE, { month: "long", year: "numeric" })}</TableCell>
                  <TableCell>{euros(m.paid_cents)}</TableCell>
                  <TableCell>{m.payments}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
