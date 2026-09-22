import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  ButtonLink,
  Card,
  EmptyState,
  EntityCell,
  FilterBar,
  FilterSelect,
  PageHeader,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { StatusNotice } from "@/components/establishment/StatusNotice";
import {
  CLIENT_REQUEST_PERIODS,
  UNCLASSIFIED,
  filterClientRequests,
  paginate,
  presentValues,
  readClientRequestFilters,
} from "@/core/client-requests";
import { statusEffects } from "@/core/establishment-status";
import { requestHeadline, requestTone } from "@/core/requests";
import { isDraft } from "@/core/request-draft";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { loadEstablishmentTimezone } from "../timezone-load";

/**
 * R05 · el listado de solicitudes del restaurante, con sus filtros.
 *
 * Las filas son las que RLS deja ver a quien mira; los filtros recortan
 * sobre ellas en el servidor y viven en la dirección (`FilterBar`). No
 * hay miniatura de foto por fila: el dibujo la pone, pero una solicitud
 * no tiene foto propia y elegir un adjunto cualquiera sería enseñar algo
 * que nadie ha dicho que la represente. Va el icono de solicitud.
 *
 * "Fecha de envío" es la del apunte `request.submitted`
 * (`client_request_milestones()`, migración 127), que es la que el
 * restaurante reconoce: un borrador que salió de una conversación se
 * envía días después de crearse. Un borrador todavía no tiene fecha de
 * envío y lo dice.
 */
export const dynamic = "force-dynamic";

type RequestStateKey = keyof typeof es.naming.states.request;
type CategoryKey = keyof typeof es.naming.categories;

const t = es.panelRequests;

export default async function ClientRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const filtros = readClientRequestFilters(await searchParams);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: establishment }, { data: requests }, zona, { data: motivo }] = await Promise.all([
    supabase.from("establishments").select("id, name, status").eq("id", id).maybeSingle(),
    // Enumeradas: `requests` tiene privilegios de columna (CLAUDE.md).
    supabase
      .from("requests")
      .select("id, code, description, state, created_at, validated_category")
      .eq("establishment_id", id)
      .order("created_at", { ascending: false }),
    loadEstablishmentTimezone(supabase, id),
    supabase.rpc("establishment_status_reason", { p_establishment_id: id }),
  ]);

  if (!establishment) notFound();

  const base = `/espacios/${slug}/restaurantes/${id}`;
  const filas = (requests ?? []).map((r) => ({ ...r, sentAt: r.created_at }));
  const filtradas = filterClientRequests(filas, filtros, new Date());
  const pagina = paginate(filtradas, filtros.page);

  // La fecha de envío, solo de las filas que se pintan.
  const envios = new Map(
    await Promise.all(
      pagina.rows.map(async (r) => {
        if (isDraft(r.state)) return [r.id, null] as const;
        const { data } = await supabase.rpc("client_request_milestones", { p_request_id: r.id });
        return [r.id, data?.[0]?.submitted_at ?? r.created_at] as const;
      }),
    ),
  );

  const estados = presentValues(filas.map((r) => r.state), "");
  const tipos = presentValues(filas.map((r) => r.validated_category), UNCLASSIFIED);
  const hayFiltros = filtros.state !== null || filtros.category !== null || filtros.period !== null;
  const serviceStopped = !statusEffects(establishment.status).serviceRunning;

  const conservar = (pag: number) => {
    const q = new URLSearchParams();
    if (filtros.state) q.set("estado", filtros.state);
    if (filtros.category) q.set("tipo", filtros.category);
    if (filtros.period) q.set("fecha", filtros.period);
    if (pag > 1) q.set("pagina", String(pag));
    const s = q.toString();
    return `${base}/solicitudes${s ? `?${s}` : ""}`;
  };

  const tipoDe = (categoria: string | null) =>
    categoria === null ? t.unclassified : (es.naming.categories[categoria as CategoryKey] ?? categoria);

  return (
    <div className="space-y-6">
      <StatusNotice status={establishment.status} reason={motivo ?? null} />

      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        actions={
          serviceStopped ? null : (
            <ButtonLink href={`${base}/solicitudes/nueva`} icon="plus">
              {t.newRequest}
            </ButtonLink>
          )
        }
      />

      <FilterBar action={`${base}/solicitudes`} hasFilters={hayFiltros}>
        <FilterSelect
          id="filtro-estado"
          name="estado"
          label={t.filterState}
          allLabel={t.filterStateAll}
          defaultValue={filtros.state}
          options={estados.map((e) => ({
            value: e,
            label: es.naming.states.request[e as RequestStateKey] ?? e,
          }))}
        />
        <FilterSelect
          id="filtro-fecha"
          name="fecha"
          label={t.filterDate}
          allLabel={t.filterDateAll}
          defaultValue={filtros.period}
          options={CLIENT_REQUEST_PERIODS.map((p) => ({ value: p, label: t.periods[p] }))}
        />
        <FilterSelect
          id="filtro-tipo"
          name="tipo"
          label={t.filterType}
          allLabel={t.filterTypeAll}
          defaultValue={filtros.category}
          options={tipos.map((c) => ({ value: c, label: c === UNCLASSIFIED ? t.unclassified : tipoDe(c) }))}
        />
      </FilterBar>

      {filas.length === 0 ? (
        <Card>
          <EmptyState
            title={es.clientArea.requestsEmptyTitle}
            description={serviceStopped ? t.stoppedReason : es.clientArea.requestsEmptyReason}
          />
        </Card>
      ) : pagina.total === 0 ? (
        <Card>
          <EmptyState title={t.emptyFilteredTitle} description={t.emptyFilteredReason} />
        </Card>
      ) : (
        <Table
          footer={
            <TableFooter>
              <span>{t.count(pagina.total)}</span>
              {pagina.pages > 1 ? (
                <nav aria-label={t.pageOf(pagina.page, pagina.pages)} className="flex items-center gap-2">
                  {pagina.page > 1 ? (
                    <Link
                      href={conservar(pagina.page - 1)}
                      aria-label={t.previous}
                      className="rounded-field border border-border px-2 py-1 hover:bg-soft-surface"
                    >
                      <Icon name="arrowLeft" className="h-4 w-4" />
                    </Link>
                  ) : null}
                  <span className="rounded-field border border-border bg-soft-surface px-3 py-1 font-semibold text-text">
                    {t.pageOf(pagina.page, pagina.pages)}
                  </span>
                  {pagina.page < pagina.pages ? (
                    <Link
                      href={conservar(pagina.page + 1)}
                      aria-label={t.next}
                      className="rounded-field border border-border px-2 py-1 hover:bg-soft-surface"
                    >
                      <Icon name="arrowRight" className="h-4 w-4" />
                    </Link>
                  ) : null}
                </nav>
              ) : null}
            </TableFooter>
          }
        >
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t.columnRequest}</TableHeaderCell>
              <TableHeaderCell>{t.columnType}</TableHeaderCell>
              <TableHeaderCell>{t.columnState}</TableHeaderCell>
              <TableHeaderCell>{t.columnSent}</TableHeaderCell>
              <TableHeaderCell>{t.columnActions}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagina.rows.map((r) => {
              const enviada = envios.get(r.id) ?? null;
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <EntityCell
                      media={
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-soft-surface text-cuotly-green">
                          <Icon name="request" className="h-5 w-5" />
                        </span>
                      }
                      title={requestHeadline(r.description, 60)}
                      subtitle={`${r.code} · ${r.description}`}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex rounded-full bg-soft-surface px-2.5 py-1 text-xs font-medium text-text">
                      {tipoDe(r.validated_category)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={requestTone(r.state)}>
                      {es.naming.states.request[r.state as RequestStateKey] ?? r.state}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {enviada === null ? (
                      <span className="text-text-secondary">{t.notSent}</span>
                    ) : (
                      enZona(enviada, zona, { day: "numeric", month: "short", year: "numeric" })
                    )}
                  </TableCell>
                  <TableCell>
                    <ButtonLink href={`${base}/solicitudes/${r.id}`} variant="outline" size="sm">
                      {t.view}
                    </ButtonLink>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
