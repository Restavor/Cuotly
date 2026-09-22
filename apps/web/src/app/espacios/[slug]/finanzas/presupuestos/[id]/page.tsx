import Link from "next/link";
import { redirect } from "next/navigation";

import { PaymentHistory } from "@/components/finance/PaymentHistory";
import { RequestHistoryCard } from "@/components/request/Detail";
import { Card, EmptyState, StatusBadge } from "@/components/ui";
import {
  isQuoteState,
  quoteTone,
  teamCanAnswerQuoteForClient,
  type QuoteOutcome,
  type QuoteStoredState,
} from "@/core/quotes";
import { fechaCorta } from "@/i18n/dates";
import { DEFAULT_TIMEZONE } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadChargePayments } from "@/services/charge-payments";
import type { RequestHistoryEntry } from "@/app/espacios/[slug]/solicitudes/[id]/detail-load";

import { AnswerForClientForms, AuthorizeStartForm, QuoteForm, SendQuoteForm } from "../QuoteForms";

/**
 * La ficha de un presupuesto (§84), para el equipo: importes con el IVA
 * congelado (RN-FIN-08, P4), la solicitud y el trabajo que cuelgan de él,
 * el cobro que emitió la aceptación y su deuda viva (derivada del libro,
 * RN-DAT-05), la autorización de inicio (RN-JOB-06) y el historial.
 *
 * Qué formularios se pintan depende del estado y de dos capacidades,
 * pero eso es presentación: `send_quote()`, `update_quote_draft()` y
 * `authorize_quote_start()` comprueban cada una lo suyo. Un restaurante
 * puede leer su presupuesto enviado (RLS se lo deja) y llegar por URL;
 * lo que vería aquí sin identidades es lo mismo que en su facturación,
 * así que se le reenvía a la suya.
 */
export const dynamic = "force-dynamic";

const t = es.quotesTeam;

function euros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export default async function TeamQuoteDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Columnas enumeradas: `sent_by`, `decided_by`, `start_authorized_by` y
  // `created_by` están revocadas para `authenticated` (CLAUDE.md). Quién
  // hizo qué sale del historial de auditoría.
  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, space_id, establishment_id, request_id, code, concept, description, outcome, category, base_cents, tax_rate_percent, tax_cents, total_cents, requires_payment_before_start, state, sent_at, decided_at, decision_reason, decided_by_team, start_authorized_at, start_authorization_reason, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!quote) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <EmptyState title={t.notFoundTitle} description={t.notFoundReason} />
      </div>
    );
  }

  const { data: esDelEquipo } = await supabase.rpc("is_space_member", { p_space_id: quote.space_id });
  if (!esDelEquipo) {
    redirect(`/espacios/${slug}/restaurantes/${quote.establishment_id}/facturacion/documentos?tab=presupuestos`);
  }

  const [
    { data: status },
    { data: establishment },
    { data: request },
    { data: job },
    { data: charge },
    { data: auditRows },
    { data: puedeGestionar },
    { data: puedeFinanzas },
    { data: space },
  ] = await Promise.all([
    supabase.rpc("quote_status", { p_quote_id: id }),
    supabase.from("establishments").select("id, name").eq("id", quote.establishment_id).maybeSingle(),
    quote.request_id
      ? supabase.from("requests").select("id, code, state").eq("id", quote.request_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("jobs").select("id, code, state").eq("quote_id", id).maybeSingle(),
    supabase
      .from("charges")
      .select("id, total_cents, due_at")
      .eq("quote_id", id)
      .maybeSingle(),
    supabase
      .from("audit_log")
      .select("id, action, created_at, actor_id, reason")
      .eq("entity_type", "quote")
      .eq("entity_id", id)
      .order("created_at", { ascending: true }),
    supabase.rpc("has_capability", { p_space_id: quote.space_id, p_capability: "manage_requests" }),
    supabase.rpc("has_capability", { p_space_id: quote.space_id, p_capability: "manage_finance" }),
    // CLAUDE.md · las fechas del historial se pintan en la zona del espacio.
    supabase.from("spaces").select("timezone").eq("id", quote.space_id).maybeSingle(),
  ]);

  // La deuda viva del cobro la deriva el servidor (RN-FIN-02).
  const { data: outstanding } = charge
    ? await supabase.rpc("charge_outstanding_cents", { p_charge_id: charge.id })
    : { data: null };

  // M51 · los apuntes del cobro, no solo el resultado. "Quedan 300 €" dice
  // cuánto falta y nada más; quien tiene que decir "el 12 me pagaste 200 por
  // Bizum" necesita la lista.
  const pagos = charge ? await loadChargePayments(supabase, charge.id) : [];

  // El historial, como el de una solicitud: actor de `profiles`, nunca de
  // una columna del presupuesto (CA-04).
  const actorIds = [...new Set((auditRows ?? []).map((row) => row.actor_id).filter(Boolean))] as string[];
  const { data: people } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const nombre = new Map((people ?? []).map((p) => [p.id, p.full_name?.trim() || p.email] as const));
  const history: RequestHistoryEntry[] = (auditRows ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    occurredAt: row.created_at,
    actor: row.actor_id === null ? null : (nombre.get(row.actor_id) ?? null),
    reason: row.reason,
  }));

  const estado = status ?? quote.state;
  const stored = quote.state as QuoteStoredState;
  const outcome = quote.outcome as QuoteOutcome;
  const deuda = outstanding ?? 0;
  const gestionar = puedeGestionar === true;
  const base = `/espacios/${slug}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header className="space-y-2">
        <p className="text-sm">
          <Link href={`${base}/finanzas/presupuestos`} className="text-cuotly-green underline">
            ← {t.title}
          </Link>
        </p>
        <h1 className="text-2xl font-bold text-primary-dark">{t.detailTitle(quote.code)}</h1>
        <p className="text-sm text-text-secondary">
          {establishment?.name ?? "—"} · {quote.concept}
        </p>
        <StatusBadge tone={isQuoteState(estado) ? quoteTone(estado) : "neutral"}>
          {isQuoteState(estado) ? es.naming.states.quote[estado] : estado}
        </StatusBadge>
      </header>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          <Card title={t.amountsTitle}>
            {quote.description ? (
              <p className="mb-3 whitespace-pre-wrap text-sm text-text">{quote.description}</p>
            ) : null}
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">{t.baseRow}</dt>
                <dd>{euros(quote.base_cents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">{t.taxRow(String(Number(quote.tax_rate_percent)))}</dt>
                <dd>{euros(quote.tax_cents)}</dd>
              </div>
              <div className="flex justify-between font-semibold text-primary-dark">
                <dt>{t.totalRow}</dt>
                <dd>{euros(quote.total_cents)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-text-secondary">{t.taxFrozenHint}</p>
            <p className="mt-2 text-sm text-text-secondary">
              {t.outcomes[outcome]}
              {quote.category ? ` · ${es.naming.categories[quote.category as keyof typeof es.naming.categories]}` : ""}
            </p>
            <p className="mt-3 flex flex-wrap gap-4 text-sm">
              {request ? (
                <Link href={`${base}/solicitudes/${request.id}`} className="text-cuotly-green underline">
                  {t.requestLink} · {request.code}
                </Link>
              ) : null}
              {job ? (
                <Link href={`${base}/trabajos/${job.id}`} className="text-cuotly-green underline">
                  {t.jobLink} · {job.code}
                </Link>
              ) : null}
            </p>
          </Card>

          <Card title={t.chargeTitle}>
            {charge === null ? (
              <p className="text-sm text-text-secondary">{t.chargeNone}</p>
            ) : (
              <>
                <p className="text-sm text-text">
                  {t.chargeLine(euros(charge.total_cents), fechaCorta(charge.due_at))}
                </p>
                <p className="text-sm text-text-secondary">
                  {deuda > 0 ? t.chargeOutstanding(euros(deuda)) : t.chargePaidHint}
                </p>
                <div className="mt-3">
                  <p className="mb-2 text-sm font-semibold text-text">
                    {es.teamArea.finance.paymentsTitle}
                  </p>
                  <PaymentHistory payments={pagos} timezone={space?.timezone ?? DEFAULT_TIMEZONE} />
                </div>
              </>
            )}
          </Card>

          <Card title={t.paymentTitle}>
            <p className="text-sm text-text">
              {quote.requires_payment_before_start ? t.paymentRequired : t.paymentNotRequired}
            </p>
            {quote.start_authorized_at ? (
              <>
                <p className="mt-1 text-sm text-text">{t.startAuthorized(fechaCorta(quote.start_authorized_at))}</p>
                {quote.start_authorization_reason ? (
                  <p className="text-sm text-text-secondary">
                    {t.startAuthorizedReason(quote.start_authorization_reason)}
                  </p>
                ) : null}
              </>
            ) : null}
          </Card>

          {/*
            §84 · autorizar el inicio antes del pago: solo tiene sentido con
            el presupuesto aceptado, pago previo exigido, deuda viva y sin
            autorización todavía. Y solo a quien `manage_finance` deja.
          */}
          {stored === "accepted" &&
          quote.requires_payment_before_start &&
          deuda > 0 &&
          quote.start_authorized_at === null &&
          puedeFinanzas === true ? (
            <AuthorizeStartForm quoteId={id} />
          ) : null}
        </div>

        <div className="space-y-6">
          {stored === "draft" && gestionar ? (
            <>
              <QuoteForm
                slug={slug}
                establishments={[]}
                fixedRequest={null}
                defaultEstablishmentId={null}
                quote={{
                  id: quote.id,
                  concept: quote.concept,
                  description: quote.description,
                  baseCents: quote.base_cents,
                  outcome,
                  category: quote.category,
                  requiresPaymentBeforeStart: quote.requires_payment_before_start,
                }}
              />
              <SendQuoteForm quoteId={id} />
            </>
          ) : null}

          {stored === "sent" ? (
            <Card title={t.decisionTitle}>
              <p className="text-sm text-text-secondary">{t.waitingHint}</p>
            </Card>
          ) : null}

          {/*
            Decisión 21 · registrar la respuesta que el restaurante dio
            fuera de Cuotly. Solo sobre uno enviado y a quien gestiona;
            el servidor lo vuelve a comprobar y exige el motivo.
          */}
          {isQuoteState(estado) && teamCanAnswerQuoteForClient(estado, gestionar) ? (
            <AnswerForClientForms quoteId={id} />
          ) : null}

          {stored === "rejected" ? (
            <Card title={t.decisionTitle}>
              {quote.decided_at ? (
                <p className="text-sm text-text">{t.decidedAt(fechaCorta(quote.decided_at))}</p>
              ) : null}
              {quote.decided_by_team ? <p className="text-sm text-text">{t.decidedByTeam}</p> : null}
              {quote.decision_reason ? (
                <p className="text-sm text-text">{t.decisionReason(quote.decision_reason)}</p>
              ) : null}
              <p className="mt-1 text-sm text-text-secondary">{t.rejectedHint}</p>
            </Card>
          ) : null}

          {stored === "accepted" ? (
            <Card title={t.decisionTitle}>
              {quote.decided_at ? (
                <p className="text-sm text-text">{t.decidedAt(fechaCorta(quote.decided_at))}</p>
              ) : null}
              {quote.decided_by_team ? <p className="text-sm text-text">{t.decidedByTeam}</p> : null}
              {quote.decision_reason ? (
                <p className="text-sm text-text">{t.decisionReason(quote.decision_reason)}</p>
              ) : null}
              {outcome === "menu_template" ? (
                <p className="mt-1 text-sm text-text-secondary">{t.templateHint}</p>
              ) : null}
            </Card>
          ) : null}

          <RequestHistoryCard timeZone={space?.timezone ?? DEFAULT_TIMEZONE} entries={history} />
        </div>
      </div>
    </div>
  );
}
