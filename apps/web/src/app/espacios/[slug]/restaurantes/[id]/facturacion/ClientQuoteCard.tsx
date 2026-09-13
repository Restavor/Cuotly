import { Card, StatusBadge } from "@/components/ui";
import { isQuoteState, quoteTone } from "@/core/quotes";
import { es } from "@/i18n/es";

import { QuoteAnswerForms } from "./QuoteAnswerForms";

const t = es.quotesClient;

function euros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export interface ClientQuote {
  readonly id: string;
  readonly code: string;
  readonly concept: string;
  readonly description: string | null;
  readonly baseCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
  /** Lo que derivó `quote_status()` (RN-DAT-05). */
  readonly status: string;
  readonly requiresPaymentBeforeStart: boolean;
}

/**
 * Un presupuesto visto por el restaurante (§84): concepto, alcance,
 * importes con IVA y estado, y —solo cuando está enviado— los dos botones
 * de responder, si quien mira puede. Sin identidades: no hay ninguna que
 * enseñar, las columnas están revocadas (P7).
 *
 * Se usa en dos sitios a propósito (CA-21): en la facturación y dentro
 * de la solicitud que presupuesta. Es la misma tarjeta.
 */
export function ClientQuoteCard({ quote, canAnswer }: { quote: ClientQuote; canAnswer: boolean }) {
  const estado = quote.status;
  return (
    <Card title={`${quote.code} · ${quote.concept}`}>
      <div className="mb-2">
        <StatusBadge tone={isQuoteState(estado) ? quoteTone(estado) : "neutral"}>
          {isQuoteState(estado) ? es.naming.states.quote[estado] : estado}
        </StatusBadge>
      </div>
      {quote.description ? (
        <p className="mb-2 whitespace-pre-wrap text-sm text-text">{quote.description}</p>
      ) : null}
      <p className="text-sm font-semibold text-primary-dark">
        {t.amounts(euros(quote.baseCents), euros(quote.taxCents), euros(quote.totalCents))}
      </p>
      <p className="text-sm text-text-secondary">
        {quote.requiresPaymentBeforeStart ? t.paymentRequiredHint : t.paymentNotRequiredHint}
      </p>

      {estado === "sent" ? (
        canAnswer ? (
          <QuoteAnswerForms quoteId={quote.id} />
        ) : (
          <div className="mt-4 rounded-lg bg-soft-surface p-4">
            <p className="text-sm font-semibold text-text">{t.onlyOwnerTitle}</p>
            <p className="text-sm text-text-secondary">{t.onlyOwnerReason}</p>
          </div>
        )
      ) : null}
      {estado === "pending_payment" ? (
        <p className="mt-2 text-sm text-text-secondary">{t.pendingPaymentHint}</p>
      ) : null}
      {estado === "paid" ? <p className="mt-2 text-sm text-text-secondary">{t.paidHint}</p> : null}
      {estado === "rejected" ? (
        <p className="mt-2 text-sm text-text-secondary">{t.rejectedHint}</p>
      ) : null}
    </Card>
  );
}
