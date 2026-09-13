"use client";

import { useActionState } from "react";

import { Button, Card, Field, Select, TextArea } from "@/components/ui";
import { QUOTE_OUTCOMES, type QuoteOutcome } from "@/core/quotes";
import { es } from "@/i18n/es";

import { INITIAL_QUOTE_ACTION } from "./action-state";
import {
  acceptQuoteForClient,
  authorizeQuoteStart,
  createQuote,
  rejectQuoteForClient,
  sendQuote,
  updateQuoteDraft,
} from "./actions";

const t = es.quotesTeam;

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

const CATEGORIES = ["small", "photo", "medium", "large"] as const;

export type QuoteDraft = {
  readonly id: string;
  readonly concept: string;
  readonly description: string | null;
  readonly baseCents: number;
  readonly outcome: QuoteOutcome;
  readonly category: string | null;
  readonly requiresPaymentBeforeStart: boolean;
};

/**
 * El formulario de un presupuesto: crea el borrador o lo corrige. Los dos
 * son el mismo formulario a propósito (CA-21): lo que cambia es la acción.
 *
 * Con una solicitud fija (se viene de "Presupuestar esta solicitud") el
 * restaurante es el de la solicitud y el resultado solo puede ser un
 * trabajo: es lo que `create_quote()` exige, y no se ofrece lo que va a
 * rechazar.
 */
export function QuoteForm({
  slug,
  establishments,
  fixedRequest,
  defaultEstablishmentId,
  quote,
}: {
  slug: string;
  establishments: readonly { id: string; name: string }[];
  fixedRequest: { id: string; code: string; establishmentId: string; category: string | null } | null;
  defaultEstablishmentId: string | null;
  quote: QuoteDraft | null;
}) {
  const [state, action, pending] = useActionState(
    quote === null ? createQuote : updateQuoteDraft.bind(null, quote.id),
    INITIAL_QUOTE_ACTION,
  );
  const editing = quote !== null;

  return (
    <Card title={editing ? t.editTitle : t.newTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="slug" value={slug} />
        {editing ? null : fixedRequest ? (
          <>
            <input type="hidden" name="establishmentId" value={fixedRequest.establishmentId} />
            <input type="hidden" name="requestId" value={fixedRequest.id} />
            <input type="hidden" name="outcome" value="job" />
            <p className="text-sm text-text">
              <span className="font-semibold">{t.requestLabel}:</span> {fixedRequest.code}
            </p>
          </>
        ) : (
          <>
            <Select
              label={t.establishmentLabel}
              name="establishmentId"
              required
              defaultValue={defaultEstablishmentId ?? ""}
              options={[
                { value: "", label: "—" },
                ...establishments.map((e) => ({ value: e.id, label: e.name })),
              ]}
            />
            <p className="text-sm text-text-secondary">{t.requestNone}</p>
            <Select
              label={t.outcomeLabel}
              name="outcome"
              defaultValue="job"
              options={QUOTE_OUTCOMES.map((outcome) => ({ value: outcome, label: t.outcomes[outcome] }))}
            />
          </>
        )}

        <Field label={t.conceptLabel} name="concept" required defaultValue={quote?.concept ?? ""} />
        <TextArea
          label={t.descriptionLabel}
          name="description"
          rows={4}
          defaultValue={quote?.description ?? ""}
        />
        <Field
          label={t.baseLabel}
          name="base"
          inputMode="decimal"
          required
          defaultValue={quote ? (quote.baseCents / 100).toFixed(2) : ""}
        />

        {quote?.outcome === "menu_template" ? null : (
          <Select
            label={t.categoryLabel}
            name="category"
            hint={t.categoryHint}
            defaultValue={quote?.category ?? fixedRequest?.category ?? ""}
            options={[
              { value: "", label: "—" },
              ...CATEGORIES.map((c) => ({ value: c, label: es.naming.categories[c] })),
            ]}
          />
        )}

        <label className="flex items-start gap-2 text-sm text-text">
          <input
            type="checkbox"
            name="requiresPayment"
            defaultChecked={quote?.requiresPaymentBeforeStart ?? true}
            className="mt-1"
          />
          <span>
            {t.requiresPaymentLabel}
            <span className="block text-xs text-text-secondary">{t.requiresPaymentHint}</span>
          </span>
        </label>

        <Notice error={state.error} notice={state.notice} />
        <Button type="submit" disabled={pending}>
          {editing
            ? pending
              ? t.savePending
              : t.saveSubmit
            : pending
              ? t.createPending
              : t.createSubmit}
        </Button>
      </form>
    </Card>
  );
}

export function SendQuoteForm({ quoteId }: { quoteId: string }) {
  const [state, action, pending] = useActionState(sendQuote.bind(null, quoteId), INITIAL_QUOTE_ACTION);
  return (
    <Card title={t.sendTitle}>
      <form action={action} className="space-y-3">
        <p className="text-sm text-text-secondary">{t.sendHint}</p>
        <Notice error={state.error} notice={state.notice} />
        <Button type="submit" disabled={pending}>
          {pending ? t.sendPending : t.sendSubmit}
        </Button>
      </form>
    </Card>
  );
}

/**
 * Decisión 21 · el equipo registra la respuesta que el restaurante dio
 * fuera de Cuotly. Dos formularios con el mismo motivo obligatorio: se
 * pinta a quien gestiona solicitudes, pero el control es `accept_quote()`
 * y `reject_quote()`, que comprueban quién y exigen el motivo.
 */
export function AnswerForClientForms({ quoteId }: { quoteId: string }) {
  const [accept, acceptAction, accepting] = useActionState(
    acceptQuoteForClient.bind(null, quoteId),
    INITIAL_QUOTE_ACTION,
  );
  const [reject, rejectAction, rejecting] = useActionState(
    rejectQuoteForClient.bind(null, quoteId),
    INITIAL_QUOTE_ACTION,
  );
  const busy = accepting || rejecting;

  return (
    <Card title={t.answerForClientTitle}>
      <p className="mb-3 text-sm text-text-secondary">{t.answerForClientHint}</p>
      <form action={acceptAction} className="space-y-2">
        <TextArea label={t.onBehalfReasonLabel} hint={t.onBehalfReasonHint} name="reason" rows={2} required />
        <Notice error={accept.error} notice={accept.notice} />
        <Button type="submit" disabled={busy}>
          {accepting ? t.acceptForClientPending : t.acceptForClientSubmit}
        </Button>
      </form>
      <form action={rejectAction} className="mt-4 space-y-2">
        <TextArea label={t.onBehalfReasonLabel} hint={t.onBehalfReasonHint} name="reason" rows={2} required />
        <Notice error={reject.error} notice={reject.notice} />
        <Button type="submit" variant="secondary" disabled={busy}>
          {rejecting ? t.rejectForClientPending : t.rejectForClientSubmit}
        </Button>
      </form>
    </Card>
  );
}

export function AuthorizeStartForm({ quoteId }: { quoteId: string }) {
  const [state, action, pending] = useActionState(
    authorizeQuoteStart.bind(null, quoteId),
    INITIAL_QUOTE_ACTION,
  );
  return (
    <Card title={t.authorizeTitle}>
      <form action={action} className="space-y-3">
        <p className="text-sm text-text-secondary">{t.authorizeHint}</p>
        <TextArea label={t.authorizeReasonLabel} name="reason" rows={2} />
        <Notice error={state.error} notice={state.notice} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? t.authorizePending : t.authorizeSubmit}
        </Button>
      </form>
    </Card>
  );
}
