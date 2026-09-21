import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EstablishmentCard } from "@/components/establishment/EstablishmentCard";
import { ListFilters } from "@/components/establishment/ListFilters";
import { EmptyState, NoPermissionState } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { matchesFilters, parseFilters } from "@/core/establishments";
import { ESTABLISHMENT_STATES } from "@/core/naming";
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
      <header>
        <h1 className="text-3xl font-bold text-primary-dark">
          {es.teamArea.establishments.title}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {es.teamArea.establishments.subtitle}
        </p>
        <p className="mt-1 text-sm text-text">
          {es.teamArea.establishments.activeCount(list.activeCount)}
        </p>
      </header>

      {/*
        §20.5 · crear un establecimiento también está en el botón Crear del
        armazón. Aquí se repite a propósito, y a ancho completo como en la
        página 23: es la acción principal de esta pantalla, y quien entra a
        dar de alta un restaurante mira a la lista, no al menú.

        Que se vea no autoriza nada: `create_establishment` lo comprueba el
        servidor (CLAUDE.md — ocultar un botón no es un control de acceso).
      */}
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={`${base}/nuevo`}
          className="flex flex-1 items-center justify-center gap-2 rounded-field bg-primary px-4 py-3 text-sm font-semibold text-surface transition-colors hover:bg-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
        >
          <Icon name="plus" className="h-4 w-4" />
          {es.teamArea.establishments.createButton}
        </Link>
        {/* M82 · la vista del grupo entero, que es como se mira un cliente
            con siete locales. Desde aquí, porque es donde está quien los
            mira uno a uno y descubre que son del mismo dueño. */}
        <Link href={`${base}/grupos`} className="text-sm text-cuotly-green underline">
          {es.teamArea.groups.title}
        </Link>
      </div>

      {list.rows.length === 0 ? null : (
        <ListFilters
          groups={list.groups}
          plans={list.plans}
          filters={filters}
          hasFilters={hasFilters}
          action={base}
        />
      )}

      <div>
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
          /*
            Página 23 · fichas, no una tabla de cinco columnas. En un
            teléfono una tabla así se recorta, se desborda o hay que
            moverla de lado; una ficha cabe entera en cualquier ancho.
            Lo que cada una enseña —y lo que el diseño pide y todavía no
            existe— está explicado en `EstablishmentCard`.
          */
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id}>
                <EstablishmentCard row={row} href={`${base}/${row.id}`} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
