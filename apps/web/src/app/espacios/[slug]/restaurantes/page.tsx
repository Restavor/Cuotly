import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AttentionCell } from "@/components/establishment/AttentionCell";
import { ListFilters } from "@/components/establishment/ListFilters";
import {
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
import { Icon } from "@/components/ui/Icon";
import { matchesFilters, parseFilters } from "@/core/establishments";
import { ESTABLISHMENT_STATES, type EstablishmentState } from "@/core/naming";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { loadEstablishmentList } from "./list-load";

/**
 * §20.2 · "Restaurantes", la vista global del equipo: qué establecimientos
 * hay, de qué grupo son, qué plan tienen, en qué estado están y cuál de
 * ellos necesita atención hoy.
 *
 * Cada fila lleva a la ficha del PRD §15.2, que es la pantalla hermana de
 * esta. Hasta ahora este destino era un listado mínimo cuya razón de ser
 * era dar entrada al libro de consumos, y lo decía en voz alta.
 *
 * Qué filas se ven lo decide RLS sobre `establishments`, no esta página: un
 * trabajador ve los que tenga autorizados y un cliente no llega aquí —para
 * él, `is_space_member` es falso y lo que hay es la pantalla de su propio
 * restaurante.
 *
 * Los filtros se aplican en el servidor, sobre las filas que RLS ya ha
 * dejado pasar. Esto es un componente de servidor: al navegador no le llega
 * la lista sin filtrar, le llega el resultado.
 */
export const dynamic = "force-dynamic";

function statusTone(status: EstablishmentState): "success" | "warning" | "danger" | "neutral" {
  if (status === "active") return "success";
  if (status === "suspended" || status === "archived") return "danger";
  if (status === "paused" || status === "ending" || status === "read_only") return "warning";
  return "neutral";
}

export default async function TeamEstablishmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ buscar?: string; grupo?: string; plan?: string; estado?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const { data: isMember } = await supabase.rpc("is_space_member", { p_space_id: space.id });

  if (!isMember) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-3xl font-bold text-primary-dark">
          {es.teamArea.establishments.title}
        </h1>
        <NoPermissionState
          title={es.teamArea.ledger.noAccessTitle}
          description={es.teamArea.ledger.noAccessReason}
        />
      </div>
    );
  }

  const base = `/espacios/${slug}/restaurantes`;
  const list = await loadEstablishmentList(supabase, space.id, slug);

  const filters = parseFilters(
    query,
    { groupIds: list.groups.map((g) => g.id), planIds: list.plans.map((p) => p.id) },
    ESTABLISHMENT_STATES,
  );
  const hasFilters =
    filters.search.trim().length > 0 ||
    filters.groupId !== null ||
    filters.planId !== null ||
    filters.status !== null;

  const rows = list.rows.filter((row) => matchesFilters(row, filters));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary-dark">
            {es.teamArea.establishments.title}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {es.teamArea.establishments.activeCount(list.activeCount)}
          </p>
        </div>
        {/*
          §20.5 · crear un establecimiento también está en el botón Crear
          del armazón. Aquí se repite a propósito: es la acción principal de
          esta pantalla, y quien entra buscando darse de alta un restaurante
          mira a la esquina de la lista, no al menú.

          Que se vea no autoriza nada: `create_establishment` lo comprueba
          el servidor (CLAUDE.md — ocultar un botón no es un control).
        */}
        <Link
          href={`${base}/nuevo`}
          className="flex items-center gap-2 rounded-field bg-primary px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
        >
          <Icon name="plus" className="h-4 w-4" />
          {es.teamArea.establishments.createButton}
        </Link>
      </header>

      {list.rows.length === 0 ? null : (
        <ListFilters
          groups={list.groups}
          plans={list.plans}
          filters={filters}
          hasFilters={hasFilters}
          action={base}
        />
      )}

      <div className="rounded-[20px] border border-border bg-surface p-2">
        {list.rows.length === 0 ? (
          <EmptyState
            title={es.teamArea.establishments.emptyTitle}
            description={es.teamArea.establishments.emptyReason}
          />
        ) : rows.length === 0 ? (
          // Un filtro que no casa con nada NO es "no hay restaurantes":
          // decirlo así mandaría a crear uno que ya existe (CA-20).
          <EmptyState
            title={es.teamArea.establishments.filteredEmptyTitle}
            description={es.teamArea.establishments.filteredEmptyReason}
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.teamArea.establishments.nameColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.establishments.groupColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.establishments.planColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.establishments.statusColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.establishments.attentionColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {/*
                      UN control por fila, no dos: el nombre es el enlace y
                      el galón de la derecha es decoración. Repetir el
                      enlace en la última celda serían dos paradas de
                      tabulador para el mismo destino (§20.1, el mismo
                      criterio que "Cambiar de espacio" en el armazón).
                    */}
                    <Link
                      href={`${base}/${row.id}`}
                      className="block rounded focus:outline focus:outline-2 focus:outline-cuotly-green"
                    >
                      <span className="block font-semibold text-primary-dark">{row.name}</span>
                      <span className="block text-xs text-text-secondary">{row.code}</span>
                    </Link>
                  </TableCell>
                  <TableCell>{row.groupName ?? "—"}</TableCell>
                  <TableCell>
                    {row.planName === null ? (
                      <span className="text-sm text-text-secondary">
                        {es.teamArea.establishments.noPlan}
                      </span>
                    ) : (
                      <StatusBadge tone="info">{row.planName}</StatusBadge>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(row.status)}>
                      {es.naming.states.establishment[row.status]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center justify-between gap-3">
                      <AttentionCell items={row.attention} />
                      <Icon
                        name="chevronRight"
                        className="h-4 w-4 shrink-0 text-text-secondary"
                      />
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
