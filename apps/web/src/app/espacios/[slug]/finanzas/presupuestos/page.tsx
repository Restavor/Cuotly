import { notFound, redirect } from "next/navigation";

import { NoPermissionState, PageHeader } from "@/components/ui";
import { filterQuotes, readQuoteListParams } from "@/core/quote-list";
import { DEFAULT_TIMEZONE } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { QuotesListView, type QuoteListRow } from "./QuotesListView";

/**
 * M49 · los presupuestos del espacio (§84, Fase 2, Hito 12), para el equipo.
 *
 * Quién los ve lo decide `quotes_select`: quien gestiona solicitudes ve
 * todos; un trabajador, ninguno. Aquí se pregunta `manage_requests` solo
 * para decir el motivo en vez de enseñar una lista vacía (CA-20). Las
 * columnas se enumeran: las de identidad están revocadas (CLAUDE.md), y
 * el estado visible lo deriva `quote_status()` del cobro (RN-DAT-05).
 *
 * `?restaurante=` filtra por restaurante; es lo que enlaza la ficha.
 */
export const dynamic = "force-dynamic";

const t = es.quotesTeam;

export default async function TeamQuotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const q = readQuoteListParams(await searchParams);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, slug, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const { data: puedeGestionar } = await supabase.rpc("has_capability", {
    p_space_id: space.id,
    p_capability: "manage_requests",
  });

  if (puedeGestionar !== true) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} />
        <NoPermissionState title={t.noPermissionTitle} description={t.noPermissionReason} />
      </div>
    );
  }

  const [{ data: quotes, error: quotesError }, { data: establishments }] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, code, concept, description, establishment_id, total_cents, created_at, sent_at")
      .eq("space_id", space.id)
      .order("created_at", { ascending: false }),
    supabase.from("establishments").select("id, name").eq("space_id", space.id).order("name"),
  ]);

  const nombre = new Map((establishments ?? []).map((e) => [e.id, e.name]));

  const todas: QuoteListRow[] = await Promise.all(
    (quotes ?? []).map(async (quote) => {
      const { data: status } = await supabase.rpc("quote_status", { p_quote_id: quote.id });
      return {
        id: quote.id,
        code: quote.code,
        concept: quote.concept,
        description: quote.description,
        establishment_id: quote.establishment_id,
        establishmentName: nombre.get(quote.establishment_id) ?? "—",
        totalCents: quote.total_cents,
        createdAt: quote.created_at,
        sentAt: quote.sent_at,
        status: status ?? "draft",
      };
    }),
  );

  return (
    <QuotesListView
      slug={slug}
      timeZone={space.timezone ?? DEFAULT_TIMEZONE}
      params={q}
      total={todas.length}
      rows={filterQuotes(todas, q)}
      establishments={establishments ?? []}
      failed={quotesError !== null}
      canCreate
    />
  );
}
