import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PaymentHistory } from "@/components/finance/PaymentHistory";
import { AttachmentRow, InfoNote } from "@/components/panel/RequestPieces";
import { Card, EmptyState, NoPermissionState, PageHeader, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { loadEstablishmentTimezone } from "../../timezone-load";
import { UploadReceiptForm } from "../UploadReceiptForm";
import { loadClientCharges } from "../billing-load";

/**
 * R26 · el detalle de un cobro y su justificante (RN-FIN-06).
 *
 * Base, IVA y total son los del cobro tal cual; lo que falta por pagar lo
 * da `charge_outstanding_cents()`. Nada se suma aquí.
 *
 * "Cómo realizar el pago" no enseña una cuenta ni un número de Bizum:
 * Cuotly no los guarda, así que se dice que los da el equipo y se lleva a
 * los mensajes para pedirlos. Tampoco hay "Referencia de pago": no existe
 * ese dato, y una referencia inventada que el banco no reconozca sería
 * peor que ninguna.
 */
export const dynamic = "force-dynamic";

const t = es.panelBilling;
type ChargeStateKey = keyof typeof es.teamArea.chargeStates;

function euros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export default async function ClientChargePage({
  params,
}: {
  params: Promise<{ slug: string; id: string; chargeId: string }>;
}) {
  const { slug, id, chargeId } = await params;
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

  const base = `/espacios/${slug}/restaurantes/${id}`;
  const volver = (
    <Link
      href={`${base}/facturacion`}
      className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm font-semibold text-text hover:bg-soft-surface"
    >
      <Icon name="arrowLeft" className="h-4 w-4" />
      {t.back}
    </Link>
  );

  if (!canViewBilling) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.detailTitle} />
        <NoPermissionState title={es.clientArea.billingNoAccessTitle} description={es.clientArea.billingNoAccessReason} />
      </div>
    );
  }

  const [cobro] = await loadClientCharges(supabase, id, chargeId);
  if (!cobro) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.detailTitle} />
        {volver}
        <Card>
          <EmptyState title={t.notFoundTitle} description={t.notFoundReason} />
        </Card>
      </div>
    );
  }

  const fecha = (iso: string) => enZona(iso, zona, { day: "numeric", month: "long", year: "numeric" });
  const estado =
    cobro.group === "in_review"
      ? t.groups.in_review
      : (es.teamArea.chargeStates[cobro.status as ChargeStateKey] ?? cobro.status);
  const tono = cobro.group === "paid" ? "success" : cobro.status === "overdue" ? "danger" : "warning";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.detailTitle}
        subtitle={t.detailSubtitle}
        actions={
          <div className="flex flex-col items-end gap-2">
            <StatusBadge tone={tono}>{estado}</StatusBadge>
            <span className="text-sm text-text-secondary">{t.dueLabel(fecha(cobro.due_at))}</span>
          </div>
        }
      />
      {volver}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-xl font-bold text-primary-dark">{cobro.concept}</h2>
          <p className="text-sm text-text-secondary">
            {t.periodLabelLine(fecha(cobro.period_start), fecha(cobro.period_end))}
          </p>
          <dl className="mt-4 divide-y divide-border text-sm">
            <div className="flex justify-between py-2">
              <dt className="text-text-secondary">{t.baseLabel}</dt>
              <dd className="text-text">{euros(cobro.base_cents)}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-text-secondary">{t.taxLabel(cobro.tax_rate_percent)}</dt>
              <dd className="text-text">{euros(cobro.tax_cents)}</dd>
            </div>
            <div className="flex justify-between rounded-[10px] bg-soft-surface px-3 py-3">
              <dt className="font-semibold text-text">{t.totalLabel}</dt>
              <dd className="text-xl font-bold text-primary-dark">{euros(cobro.total_cents)}</dd>
            </div>
            {cobro.outstandingCents > 0 && cobro.outstandingCents !== cobro.total_cents ? (
              <div className="flex justify-between py-2">
                <dt className="text-text-secondary">{t.outstandingLabel}</dt>
                <dd className="font-semibold text-text">{euros(cobro.outstandingCents)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4 flex items-center gap-3 rounded-[10px] border border-border p-3">
            <Icon name="calendar" className="h-6 w-6 text-primary-dark" />
            <div>
              <p className="text-sm text-text-secondary">{t.dueDateLabel}</p>
              <p className="text-sm font-semibold text-text">{fecha(cobro.due_at)}</p>
            </div>
          </div>
        </Card>

        <Card title={t.howTitle}>
          <p className="mb-3 text-sm text-text-secondary">{t.howBody}</p>
          <InfoNote title={t.howInstructionsTitle}>{t.howInstructionsBody}</InfoNote>
          <Link
            href={`${base}/mensajes`}
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-cuotly-green underline"
          >
            {t.askInstructions}
            <Icon name="arrowRight" className="h-4 w-4" />
          </Link>
        </Card>
      </div>

      <section id="justificante" className="scroll-mt-20">
        <Card title={t.receiptTitle}>
          <p className="mb-3 text-sm text-text-secondary">{t.receiptSubtitle}</p>
          {cobro.outstandingCents > 0 ? (
            <UploadReceiptForm
              establishmentId={id}
              charges={[{ id: cobro.id, label: `${cobro.concept} · ${euros(cobro.outstandingCents)}` }]}
            />
          ) : (
            <p className="text-sm text-text-secondary">{t.receiptNothing}</p>
          )}
          <p className="mt-4 rounded-[10px] bg-warning/25 p-3 text-sm text-text">{t.receiptNotConfirm}</p>
          <h3 className="mb-2 mt-6 text-sm font-semibold text-text">{t.receiptsSent}</h3>
          {cobro.receipts.length === 0 ? (
            <p className="text-sm text-text-secondary">{t.receiptsNone}</p>
          ) : (
            <ul className="space-y-2">
              {cobro.receipts.map((f) => (
                <AttachmentRow key={f.id} fileId={f.id} name={f.name} />
              ))}
            </ul>
          )}
        </Card>
      </section>

      <Card title={t.paymentsTitle}>
        <PaymentHistory payments={cobro.payments} timezone={zona} />
      </Card>
    </div>
  );
}
