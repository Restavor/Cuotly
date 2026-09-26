"use client";

import { useActionState } from "react";

import { Button, Card, TextArea } from "@/components/ui";
import type { CreditFit } from "@/core/credits";
import { es } from "@/i18n/es";

import { AcceptRequestButton } from "../../AcceptRequestButton";
import { INITIAL_CLIENT_REQUEST } from "./action-state";
import { askCreditQuote, deferToNextCycle, trimScope } from "./actions";

function ErrorText({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  ) : null;
}

/**
 * RN-CRE-11 y RN-CRE-14 · lo que el restaurante puede hacer con una
 * solicitud valorada en créditos. Qué se ofrece lo decide `creditFit()`
 * con el saldo que da el servidor; lo que se puede de verdad lo decide cada
 * función (`accept_request()`, `defer_request_to_next_cycle()`,
 * `request_credit_quote()`, `trim_request_scope()`), que vuelve a
 * comprobarlo todo.
 */
export function CreditDecision({
  requestId,
  fit,
  description,
  context,
  deferredUntilLabel,
  quoteRequestedLabel,
}: {
  requestId: string;
  fit: CreditFit;
  description: string;
  context: string | null;
  deferredUntilLabel: string | null;
  quoteRequestedLabel: string | null;
}) {
  const t = es.credits;

  if (quoteRequestedLabel !== null) {
    return (
      <Card title={t.quoteTitle}>
        <p className="text-sm text-text-secondary">{t.quoteRequested(quoteRequestedLabel)}</p>
      </Card>
    );
  }

  if (fit === "accept") {
    return (
      <Card title={t.acceptTitle}>
        <AcceptRequestButton requestId={requestId} />
      </Card>
    );
  }

  if (fit === "quote") {
    return <QuoteForm requestId={requestId} />;
  }

  return (
    <div className="space-y-6">
      <Card title={t.notEnoughTitle}>
        <p className="text-sm text-text-secondary">{fit === "choose" ? t.notEnoughHint : t.neverFitsHint}</p>
      </Card>
      <TrimForm requestId={requestId} description={description} context={context} />
      {fit === "choose" ? (
        deferredUntilLabel !== null ? (
          <Card title={t.deferTitle}>
            <p className="text-sm text-text-secondary">{t.deferredUntil(deferredUntilLabel)}</p>
          </Card>
        ) : (
          <DeferForm requestId={requestId} />
        )
      ) : null}
      <QuoteForm requestId={requestId} />
    </div>
  );
}

function TrimForm({ requestId, description, context }: { requestId: string; description: string; context: string | null }) {
  const t = es.credits;
  const [state, action, pending] = useActionState(trimScope, INITIAL_CLIENT_REQUEST);
  return (
    <Card title={t.trimTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <p className="text-sm text-text-secondary">{t.trimHint}</p>
        <TextArea label={t.trimLabel} name="description" rows={4} defaultValue={description} required />
        <TextArea label={t.trimContextLabel} name="context" rows={2} defaultValue={context ?? ""} />
        <ErrorText message={state.error} />
        <Button type="submit" disabled={pending}>
          {pending ? t.trimPending : t.trimSubmit}
        </Button>
      </form>
    </Card>
  );
}

function DeferForm({ requestId }: { requestId: string }) {
  const t = es.credits;
  const [state, action, pending] = useActionState(deferToNextCycle, INITIAL_CLIENT_REQUEST);
  return (
    <Card title={t.deferTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <p className="text-sm text-text-secondary">{t.deferHint}</p>
        <ErrorText message={state.error} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? t.deferPending : t.deferSubmit}
        </Button>
      </form>
    </Card>
  );
}

function QuoteForm({ requestId }: { requestId: string }) {
  const t = es.credits;
  const [state, action, pending] = useActionState(askCreditQuote, INITIAL_CLIENT_REQUEST);
  return (
    <Card title={t.quoteTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <p className="text-sm text-text-secondary">{t.quoteHint}</p>
        <TextArea label={t.quoteNoteLabel} name="note" rows={2} />
        <ErrorText message={state.error} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? t.quotePending : t.quoteSubmit}
        </Button>
      </form>
    </Card>
  );
}
