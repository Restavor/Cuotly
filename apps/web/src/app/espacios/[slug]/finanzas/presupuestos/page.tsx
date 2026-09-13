import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Card,
  EmptyState,
  NoPermissionState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { isQuoteState, quoteTone } from "@/core/quotes";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * Los presupuestos del espacio (§84, Fase 2, Hito 12), para el equipo.
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

function euros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export default async function TeamQuotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ restaurante?: string }>;
}) {
  const { slug } = await params;
  const { restaurante } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase.from("spaces").select("id, slug").eq("slug", slug).maybeSingle();
  if (!space) notFound();

  const { data: puedeGestionar } = await supabase.rpc("has_capability", {
    p_space_id: space.id,
    p_capability: "manage_requests",
  });

  const base = `/espacios/${space.slug}/finanzas/presupuestos`;

  if (puedeGestionar !== true) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{t.title}</h1>
        <NoPermissionState title={t.noPermissionTitle} description={t.noPermissionReason} />
      </div>
    );
  }

  let consulta = supabase
    .from("quotes")
    .select("id, code, concept, establishment_id, total_cents, created_at")
    .eq("space_id", space.id)
    .order("created_at", { ascending: false });
  if (restaurante) consulta = consulta.eq("establishment_id", restaurante);

  const [{ data: quotes, error: quotesError }, { data: establishments }] = await Promise.all([
    consulta,
    supabase.from("establishments").select("id, name").eq("space_id", space.id),
  ]);

  const nombre = new Map((establishments ?? []).map((e) => [e.id, e.name]));

  const rows = await Promise.all(
    (quotes ?? []).map(async (quote) => {
      const { data: status } = await supabase.rpc("quote_status", { p_quote_id: quote.id });
      return { ...quote, status: status ?? "draft" };
    }),
  );

  const nuevoHref = restaurante ? `${base}/nuevo?restaurante=${restaurante}` : `${base}/nuevo`;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
        <p className="flex flex-wrap gap-4 text-sm">
          <Link href={nuevoHref} className="font-semibold text-cuotly-green underline">
            {t.newLink}
          </Link>
          <Link href={`/espacios/${space.slug}/finanzas`} className="text-cuotly-green underline">
            {t.backToFinance}
          </Link>
        </p>
      </header>

      <Card>
        {quotesError ? (
          <EmptyState title={es.states.errorTitle} description={es.emptyReasons.error} />
        ) : rows.length === 0 ? (
          <EmptyState title={t.listEmptyTitle} description={t.listEmptyReason} />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t.codeColumn}</TableHeaderCell>
                <TableHeaderCell>{t.establishmentColumn}</TableHeaderCell>
                <TableHeaderCell>{t.conceptColumn}</TableHeaderCell>
                <TableHeaderCell>{t.totalColumn}</TableHeaderCell>
                <TableHeaderCell>{t.stateColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell>
                    <Link href={`${base}/${quote.id}`} className="text-cuotly-green underline">
                      {quote.code}
                    </Link>
                  </TableCell>
                  <TableCell>{nombre.get(quote.establishment_id) ?? "—"}</TableCell>
                  <TableCell>{quote.concept}</TableCell>
                  <TableCell>{euros(quote.total_cents)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={isQuoteState(quote.status) ? quoteTone(quote.status) : "neutral"}>
                      {isQuoteState(quote.status) ? es.naming.states.quote[quote.status] : quote.status}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
