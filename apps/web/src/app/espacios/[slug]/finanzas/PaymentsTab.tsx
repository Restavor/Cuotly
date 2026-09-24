import type { ReactNode } from "react";

import { AutoSubmitForm } from "@/components/panel/AutoSubmitForm";
import { PaymentHistory, type ChargePaymentRow } from "@/components/finance/PaymentHistory";
import { ButtonLink, Card, EmptyState, StatCard, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";

const t = es.teamArea.finance;
type ChargeStateKey = keyof typeof es.teamArea.chargeStates;

export type PaymentsTabData = {
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly selected: {
    readonly id: string;
    readonly totalCents: number;
    readonly collectedCents: number;
    readonly outstandingCents: number;
    readonly status: string;
    readonly payments: readonly ChargePaymentRow[];
    readonly receipts: readonly { readonly fileId: string; readonly name: string; readonly side: string; readonly at: string }[];
  } | null;
};

/**
 * M51 · Pagos parciales y justificantes, como el dibujo: arriba el cobro y
 * sus tres cifras; debajo, el historial de pagos y la revisión de
 * justificantes a la izquierda, y el registro del siguiente pago a la
 * derecha.
 *
 * El dibujo elige un **presupuesto**; aquí se elige un **cobro**, que es
 * donde viven los pagos en Cuotly (RN-FIN-02): un presupuesto aceptado
 * emite su cobro (§84), y las mensualidades del plan también se pagan a
 * plazos. Las tres cifras salen del servidor; aquí no se suma nada.
 */
export function PaymentsTab({
  slug,
  timeZone,
  data,
  registerForm,
}: {
  slug: string;
  timeZone: string;
  data: PaymentsTabData;
  registerForm: ReactNode | null;
}) {
  const base = `/espacios/${slug}/finanzas`;
  if (data.options.length === 0 && data.selected === null) {
    return (
      <Card>
        <EmptyState title={t.paymentsNoneTitle} description={t.paymentsNoneReason} />
      </Card>
    );
  }
  const s = data.selected;

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">{t.paymentsSubtitle}</p>

      {/* En el teléfono el selector va a lo ancho y las tres cifras en dos
          columnas, en vez de tres tarjetas una debajo de otra. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] lg:gap-4">
        <Card className="col-span-2 p-4! lg:col-span-1">
          <AutoSubmitForm action={base} submitLabel={t.paymentsChoose} className="flex items-end gap-2">
            <input type="hidden" name="tab" value="pagos" />
            <label className="block flex-1 text-sm font-medium text-text">
              <span className="mb-1 block">{t.paymentsSelectLabel}</span>
              <select
                name="cobro"
                defaultValue={s?.id ?? ""}
                className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
              >
                {data.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs font-normal text-text-secondary">{t.paymentsSelectHint}</span>
            </label>
          </AutoSubmitForm>
        </Card>
        {s ? (
          <>
            <StatCard icon="document" tone="neutral" label={t.paymentsTotal} value={euros(s.totalCents)} />
            <StatCard icon="check" tone="green" label={t.paymentsPaid} value={euros(s.collectedCents)} />
            <StatCard
              icon="clock"
              tone={s.status === "overdue" ? "danger" : "info"}
              label={t.paymentsPending}
              value={euros(s.outstandingCents)}
              hint={es.teamArea.chargeStates[s.status as ChargeStateKey] ?? s.status}
            />
          </>
        ) : null}
      </div>

      {s ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            <Card title={t.paymentsHistoryTitle}>
              <PaymentHistory payments={s.payments} timezone={timeZone} />
            </Card>
            <Card title={t.receiptsReviewTitle}>
              {s.receipts.length === 0 ? (
                <p className="text-sm text-text-secondary">{t.receiptsReviewEmpty}</p>
              ) : (
                <ul className="space-y-2">
                  {s.receipts.map((r) => (
                    <li
                      key={`${r.fileId}-${r.at}`}
                      className="flex items-center gap-3 rounded-[12px] border border-border p-3"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-soft-surface text-primary-dark"
                      >
                        <Icon name="document" className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text">{r.name}</span>
                        <span className="block text-xs text-text-secondary">
                          {t.receiptUploadedAt(enZona(r.at, timeZone, { dateStyle: "medium", timeStyle: "short" }))}
                        </span>
                      </span>
                      <StatusBadge tone={r.side === "client" ? "info" : "neutral"}>
                        {r.side === "client" ? t.receiptFromClient : t.receiptFromTeam}
                      </StatusBadge>
                      <a
                        href={`/api/archivos/${r.fileId}`}
                        aria-label={`${es.files.download} ${r.name}`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-soft-surface text-primary-dark hover:bg-cuotly-green/10"
                      >
                        <Icon name="download" className="h-4 w-4" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title={t.registerNewTitle}>
            {registerForm === null ? (
              <p className="text-sm text-text-secondary">{t.nothingToRegister}</p>
            ) : (
              <div className="space-y-3">
                {registerForm}
                <p className="flex items-start gap-2 rounded-[10px] bg-soft-surface p-3 text-xs text-text-secondary">
                  <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />
                  {t.receiptReviewNote}
                </p>
              </div>
            )}
            <ButtonLink href={`${base}/cobros/${s.id}`} variant="outline" size="sm" className="mt-4">
              {t.openFullCharge}
            </ButtonLink>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
