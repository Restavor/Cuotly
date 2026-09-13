"use client";

import { useActionState } from "react";

import { Button, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_QUOTE_ANSWER } from "./action-state";
import { acceptQuote, rejectQuote } from "./actions";

const t = es.quotesClient;

function Notice({ error, notice }: { error: string | null; notice: string | null }) {
  if (error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    );
  }
  return notice ? <p className="text-sm text-cuotly-green">{notice}</p> : null;
}

/**
 * Los dos botones que son del restaurante sobre un presupuesto enviado
 * (§84). Se pintan solo a quien el servidor dijo que puede responder,
 * pero eso no es el control: `accept_quote()` y `reject_quote()` vuelven
 * a comprobar quién es y en qué estado está.
 */
export function QuoteAnswerForms({ quoteId }: { quoteId: string }) {
  const [accept, acceptAction, accepting] = useActionState(
    acceptQuote.bind(null, quoteId),
    INITIAL_QUOTE_ANSWER,
  );
  const [reject, rejectAction, rejecting] = useActionState(
    rejectQuote.bind(null, quoteId),
    INITIAL_QUOTE_ANSWER,
  );

  return (
    <div className="mt-4 space-y-4 rounded-lg bg-soft-surface p-4">
      <p className="text-sm font-semibold text-text">{t.answerTitle}</p>
      <p className="text-sm text-text-secondary">{t.answerHint}</p>
      <form action={acceptAction} className="space-y-2">
        <Notice error={accept.error} notice={accept.notice} />
        <Button type="submit" disabled={accepting || rejecting}>
          {accepting ? t.acceptPending : t.acceptSubmit}
        </Button>
      </form>
      <form action={rejectAction} className="space-y-2">
        <TextArea label={t.rejectReasonLabel} name="reason" rows={2} />
        <Notice error={reject.error} notice={reject.notice} />
        <Button type="submit" variant="secondary" disabled={accepting || rejecting}>
          {rejecting ? t.rejectPending : t.rejectSubmit}
        </Button>
      </form>
    </div>
  );
}
