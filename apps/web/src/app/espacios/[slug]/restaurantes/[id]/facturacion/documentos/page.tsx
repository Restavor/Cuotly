import { notFound, redirect } from "next/navigation";

import { Card, EmptyState, NoPermissionState, PageHeader, Tabs } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { ClientQuoteCard } from "../ClientQuoteCard";

/**
 * R27 · facturas y presupuestos del restaurante.
 *
 * Facturas: Cuotly todavía no las emite. La numeración fiscal es parte del
 * bloque legal aplazado (CLAUDE.md, "No inventes lo que está pendiente"),
 * y una "FAC-2026-010" con emisor y CIF de relleno sería exactamente el
 * dato ficticio que no se enseña. La pestaña lo dice.
 *
 * Presupuestos: los de siempre (§84), con sus dos botones cuando toca
 * responder. `quotes_select` no deja ver borradores y las columnas se
 * enumeran porque las de identidad están revocadas (P7). Quién responde
 * lo dice `client_can_accept_terms()`.
 */
export const dynamic = "force-dynamic";

const t = es.panelBilling;

export default async function ClientBillingDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: establishment }, { data: canViewBilling }] = await Promise.all([
    supabase.from("establishments").select("id").eq("id", id).maybeSingle(),
    supabase.rpc("client_can_view_billing", { p_establishment_id: id }),
  ]);
  if (!establishment) notFound();

  if (!canViewBilling) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.documentsTitle} subtitle={t.documentsSubtitle} />
        <NoPermissionState title={es.clientArea.billingNoAccessTitle} description={es.clientArea.billingNoAccessReason} />
      </div>
    );
  }

  const activa = tab === "presupuestos" ? "presupuestos" : "facturas";
  const base = `/espacios/${slug}/restaurantes/${id}/facturacion/documentos`;

  const [{ data: quoteRows }, { data: canAnswerQuotes }] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id, code, concept, description, base_cents, tax_cents, total_cents, requires_payment_before_start, state, decided_by_team, decision_reason",
      )
      .eq("establishment_id", id)
      .order("created_at", { ascending: false }),
    supabase.rpc("client_can_accept_terms", { p_establishment_id: id }),
  ]);

  const quotes =
    activa === "presupuestos"
      ? await Promise.all(
          (quoteRows ?? []).map(async (quote) => {
            const { data: status } = await supabase.rpc("quote_status", { p_quote_id: quote.id });
            return {
              id: quote.id,
              code: quote.code,
              concept: quote.concept,
              description: quote.description,
              baseCents: quote.base_cents,
              taxCents: quote.tax_cents,
              totalCents: quote.total_cents,
              // Si la derivación no contestó, el estado guardado: nunca se
              // inventa un "enviado" que ofrecería botones de responder.
              status: status ?? quote.state,
              requiresPaymentBeforeStart: quote.requires_payment_before_start,
              decidedByTeam: quote.decided_by_team,
              decisionReason: quote.decision_reason,
            };
          }),
        )
      : [];

  return (
    <div className="space-y-6">
      <PageHeader title={t.documentsTitle} subtitle={t.documentsSubtitle} />
      <Tabs
        label={t.docTabsLabel}
        active={activa}
        tabs={[
          { key: "facturas", label: t.docTabs.facturas, href: base },
          {
            key: "presupuestos",
            label: t.docTabs.presupuestos,
            href: `${base}?tab=presupuestos`,
            count: (quoteRows ?? []).length,
            countTone: "neutral",
          },
        ]}
      />

      {activa === "facturas" ? (
        <Card>
          <EmptyState title={t.invoicesTitle} description={t.invoicesReason} />
        </Card>
      ) : quotes.length === 0 ? (
        <Card>
          <EmptyState title={es.quotesClient.emptyTitle} description={es.quotesClient.emptyReason} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {quotes.map((quote) => (
            <ClientQuoteCard key={quote.id} quote={quote} canAnswer={canAnswerQuotes === true} />
          ))}
        </div>
      )}
    </div>
  );
}
