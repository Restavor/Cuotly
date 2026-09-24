import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { InfoNote } from "@/components/panel/RequestPieces";
import {
  ButtonLink,
  Card,
  EmptyState,
  NoPermissionState,
  PageHeader,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  BILLING_PERIODS,
  BILLING_TABS,
  billingSummary,
  filterCharges,
  lastPayment,
  readBillingFilters,
  type BillingGroup,
} from "@/core/client-billing";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { loadEstablishmentTimezone } from "../timezone-load";
import { loadClientCharges } from "./billing-load";

/**
 * R25 · Pagos y facturas del restaurante (HU-25, RN-FIN-07).
 *
 * Quién puede ver esto no lo decide la pantalla: `client_can_view_billing()`
 * lo dice en el servidor —propietario local siempre, Editor solo con el
 * permiso explícito, Consulta nunca— y las políticas de `charges` filtran
 * las filas igual. Aquí se pregunta para poder explicar el motivo en vez de
 * enseñar una tabla vacía (CA-20).
 *
 * Las tres tarjetas de arriba no suman dinero (CLAUDE.md): "Pendiente de
 * pago" cuenta los cobros con deuda y enseña un importe solo cuando es uno,
 * el que ya dio `charge_outstanding_cents()`. "Descargar factura" no está:
 * Cuotly todavía no emite facturas (bloque legal pendiente, CLAUDE.md), y
 * lo dice la pestaña de facturas.
 */
export const dynamic = "force-dynamic";

const t = es.panelBilling;
type ChargeStateKey = keyof typeof es.teamArea.chargeStates;

function euros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

const TONO: Record<BillingGroup, "success" | "warning" | "neutral"> = {
  paid: "success",
  in_review: "warning",
  pending: "neutral",
};

function Resumen({ icon, title, value, detail, tone }: { icon: IconName; title: string; value: string; detail?: string | null; tone: string }) {
  return (
    <Card>
      <div className="flex items-center gap-4">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${tone}`}>
          <Icon name={icon} className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-text-secondary">{title}</p>
          <p className="text-xl font-bold text-primary-dark">{value}</p>
          {detail ? <p className="truncate text-sm text-text-secondary">{detail}</p> : null}
        </div>
      </div>
    </Card>
  );
}

export default async function ClientBillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const filtros = readBillingFilters(await searchParams);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: establishment }, { data: canViewBilling }, zona] = await Promise.all([
    supabase.from("establishments").select("id").eq("id", id).maybeSingle(),
    supabase.rpc("client_can_view_billing", { p_establishment_id: id }),
    loadEstablishmentTimezone(supabase, id),
  ]);
  if (!establishment) notFound();

  if (!canViewBilling) {
    return (
      <div className="space-y-6">
        <PageHeader title={es.clientArea.billingTitle} subtitle={t.subtitle} />
        <NoPermissionState title={es.clientArea.billingNoAccessTitle} description={es.clientArea.billingNoAccessReason} />
      </div>
    );
  }

  const cobros = await loadClientCharges(supabase, id);
  const filtrados = filterCharges(cobros, filtros, new Date());
  const resumen = billingSummary(cobros);
  const ultimo = lastPayment(cobros.flatMap((c) => c.payments));
  const base = `/espacios/${slug}/restaurantes/${id}/facturacion`;
  const fecha = (iso: string) => enZona(iso, zona, { day: "numeric", month: "long", year: "numeric" });
  const corta = (iso: string) => enZona(iso, zona, { day: "numeric", month: "short", year: "numeric" });
  const mes = (dia: string) => enZona(dia, zona, { month: "long", year: "numeric" });
  const enlace = (cambios: Partial<typeof filtros>) => {
    const f = { ...filtros, ...cambios };
    const q = new URLSearchParams();
    if (f.tab !== "todos") q.set("ver", f.tab);
    if (f.period !== "12") q.set("periodo", f.period);
    const s = q.toString();
    return `${base}${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={es.clientArea.billingTitle}
        subtitle={t.subtitle}
        actions={
          <ButtonLink href={`${base}/documentos`} variant="outline" icon="document">
            {t.documentsLink}
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Resumen
          icon="clock"
          tone="bg-warning/25 text-primary-dark"
          title={t.pendingTitle}
          value={
            resumen.pendingCount === 0
              ? t.pendingNone
              : resumen.onlyPending
                ? euros(resumen.onlyPending.outstandingCents)
                : t.pendingCount(resumen.pendingCount)
          }
          detail={resumen.onlyPending ? t.pendingCount(1) : null}
        />
        <Resumen
          icon="calendar"
          tone="bg-soft-surface text-primary-dark"
          title={t.nextDueTitle}
          value={resumen.nextDue ? fecha(resumen.nextDue.due_at) : t.nextDueNone}
          detail={resumen.nextDue?.concept ?? null}
        />
        <Resumen
          icon="check"
          tone="bg-cuotly-green/15 text-cuotly-green"
          title={t.lastPaymentTitle}
          value={ultimo ? fecha(ultimo.paid_at) : t.lastPaymentNone}
          detail={ultimo ? euros(ultimo.amount_cents) : null}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t.tabsLabel} className="flex flex-wrap gap-2">
          {BILLING_TABS.map((tab) => (
            <Link
              key={tab}
              href={enlace({ tab })}
              aria-current={filtros.tab === tab ? "true" : undefined}
              className={`rounded-[10px] border px-4 py-2 text-sm font-semibold ${
                filtros.tab === tab ? "border-primary bg-primary text-surface" : "border-border bg-surface text-text hover:bg-soft-surface"
              }`}
            >
              {t.tabs[tab]}
            </Link>
          ))}
        </nav>
        <nav aria-label={t.periodLabel} className="flex flex-wrap gap-2">
          {BILLING_PERIODS.map((p) => (
            <Link
              key={p}
              href={enlace({ period: p })}
              aria-current={filtros.period === p ? "true" : undefined}
              className={`rounded-[10px] border px-3 py-2 text-sm ${
                filtros.period === p ? "border-cuotly-green font-semibold text-cuotly-green" : "border-border text-text-secondary hover:bg-soft-surface"
              }`}
            >
              {t.periods[p]}
            </Link>
          ))}
        </nav>
      </div>

      {cobros.length === 0 ? (
        <Card>
          <EmptyState title={es.clientArea.billingEmptyTitle} description={es.clientArea.billingEmptyReason} />
        </Card>
      ) : filtrados.length === 0 ? (
        <Card>
          <EmptyState title={t.emptyFilteredTitle} description={t.emptyFilteredReason} />
        </Card>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t.columnDate}</TableHeaderCell>
              <TableHeaderCell>{t.columnConcept}</TableHeaderCell>
              <TableHeaderCell>{t.columnPeriod}</TableHeaderCell>
              <TableHeaderCell>{t.columnBase}</TableHeaderCell>
              <TableHeaderCell>{t.columnTax(filtrados[0].tax_rate_percent)}</TableHeaderCell>
              <TableHeaderCell>{t.columnTotal}</TableHeaderCell>
              <TableHeaderCell>{t.columnState}</TableHeaderCell>
              <TableHeaderCell>{t.columnActions}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtrados.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{corta(c.due_at)}</TableCell>
                <TableCell>{c.concept}</TableCell>
                <TableCell>{mes(c.period_start)}</TableCell>
                <TableCell>{euros(c.base_cents)}</TableCell>
                <TableCell>{euros(c.tax_cents)}</TableCell>
                <TableCell>{euros(c.total_cents)}</TableCell>
                <TableCell>
                  <StatusBadge tone={c.status === "overdue" ? "danger" : TONO[c.group]}>
                    {c.group === "pending"
                      ? (es.teamArea.chargeStates[c.status as ChargeStateKey] ?? t.groups.pending)
                      : t.groups[c.group]}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <ButtonLink href={`${base}/${c.id}`} variant="outline" size="sm">
                      {t.viewDetail}
                    </ButtonLink>
                    {c.group === "pending" ? (
                      <ButtonLink href={`${base}/${c.id}#justificante`} variant="outline" size="sm" icon="upload">
                        {t.uploadReceipt}
                      </ButtonLink>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <InfoNote title={es.clientArea.billingTitle}>{t.manualNote}</InfoNote>
    </div>
  );
}
