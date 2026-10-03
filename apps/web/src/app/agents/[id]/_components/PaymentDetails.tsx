import { Card, EmptyState } from "@/components/ui";
import { formatIban, hasDebt, paymentDetailsConfigured, type PaymentInfo } from "@/core/agents/payment-info";
import { formatCentsAsEuros } from "@/core/reservations/money";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";

import { CopyButton } from "./CopyButton";

const DAY_MS = 86_400_000;

/**
 * «Datos para pagar» (`AgentsPendientePago`, PRD de agents §4.4): periodo, cuota, IVA y total del cobro más antiguo con
 * deuda, cuándo vence, y cómo pagar —IBAN a nombre de la razón social, Bizum y concepto, cada uno con su «Copiar»—. Lo usan
 * «Aprobado: datos para pagar» y «Plan y pagos». Un dato que Restavor no ha cargado no se inventa: se dice que faltan.
 */
export function PaymentDetails({
  info,
  timeZone,
  title = es.agents.billing.pending.detailsTitle,
  now = new Date(),
}: {
  info: PaymentInfo;
  timeZone: string;
  title?: string;
  now?: Date;
}) {
  const t = es.agents.billing.pending;
  if (!hasDebt(info)) return null;

  const day = (iso: string) => enZona(iso, timeZone, { day: "numeric", month: "long", year: "numeric" });
  const shortDay = (iso: string) => enZona(iso, timeZone, { day: "numeric", month: "numeric", year: "numeric" });
  const msLeft = new Date(info.dueAt).getTime() - now.getTime();
  const due = msLeft < 0 ? t.dueAgo(day(info.dueAt)) : t.dueIn(day(info.dueAt), Math.ceil(msLeft / DAY_MS));

  const summary: { label: string; value: string; testId: string; strong?: boolean }[] = [
    { label: t.period, value: t.periodValue(shortDay(info.periodStart), shortDay(info.periodEnd)), testId: "pay-period" },
    { label: t.fee, value: formatCentsAsEuros(info.baseCents), testId: "pay-fee" },
    { label: t.tax, value: formatCentsAsEuros(info.taxCents), testId: "pay-tax" },
    { label: t.amount, value: formatCentsAsEuros(info.totalCents), testId: "pay-amount", strong: true },
    { label: t.due, value: due, testId: "pay-due" },
  ];

  return (
    <Card title={title}>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,10rem)_1fr]" data-testid="payment-details">
        {summary.map((row) => (
          <div key={row.testId} className="contents">
            <dt className="text-sm text-text-secondary">{row.label}</dt>
            <dd className={`text-[15px] text-text ${row.strong ? "font-bold" : "font-semibold"}`} data-testid={row.testId}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <h3 className="mb-2 mt-6 text-sm font-semibold text-text">{t.howToPay}</h3>
      {paymentDetailsConfigured(info) ? (
        <ul className="divide-y divide-border rounded-field border border-border">
          {info.iban ? (
            <li className="flex flex-wrap items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-text-secondary">{t.iban}</span>
                <span className="block break-words text-[15px] font-semibold text-text" data-testid="pay-iban">
                  {formatIban(info.iban)}
                </span>
                {info.payeeName ? <span className="block text-xs text-text-secondary">{t.payee(info.payeeName)}</span> : null}
              </span>
              <CopyButton value={formatIban(info.iban)} label={t.iban} />
            </li>
          ) : null}
          {info.bizumPhone ? (
            <li className="flex flex-wrap items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-text-secondary">{t.bizum}</span>
                <span className="block text-[15px] font-semibold text-text" data-testid="pay-bizum">
                  {info.bizumPhone}
                </span>
              </span>
              <CopyButton value={info.bizumPhone} label={t.bizum} />
            </li>
          ) : null}
          <li className="flex flex-wrap items-center gap-3 px-4 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-text-secondary">{t.concept}</span>
              <span className="block break-words text-[15px] font-semibold text-text" data-testid="pay-concept">
                {info.reference}
              </span>
              <span className="block text-xs text-text-secondary">{t.conceptHint}</span>
            </span>
            <CopyButton value={info.reference} label={t.concept} />
          </li>
        </ul>
      ) : (
        <EmptyState title={t.unconfiguredTitle} description={t.unconfiguredReason} />
      )}
      {info.paymentNote ? <p className="mt-3 text-sm text-text-secondary">{info.paymentNote}</p> : null}
    </Card>
  );
}
