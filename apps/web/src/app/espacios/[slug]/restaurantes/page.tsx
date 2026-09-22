import { notFound, redirect } from "next/navigation";

import { AttentionCell } from "@/components/establishment/AttentionCell";
import { EstablishmentCard, statusTone } from "@/components/establishment/EstablishmentCard";
import { EstablishmentPhoto } from "@/components/establishment/EstablishmentPhoto";
import { ListFilters } from "@/components/establishment/ListFilters";
import {
  ButtonLink,
  Card,
  EmptyState,
  EntityCell,
  NoPermissionState,
  PageHeader,
  PersonCell,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
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
      <div className="space-y-6">
        <PageHeader title={es.teamArea.establishments.title} />
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
  const t = es.teamArea.establishments;

  return (
    <div className="space-y-6">
      {/*
        Página 23 (M02) · título, subtítulo y el botón "Crear
        establecimiento" a la derecha. También está en el botón Crear del
        armazón; aquí se repite a propósito porque es la acción principal
        de esta pantalla. Que se vea no autoriza nada: `create_establishment`
        lo comprueba el servidor (CLAUDE.md — ocultar un botón no es un
        control de acceso).
      */}
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        actions={
          <>
            {/* M82 · la vista del grupo entero, que es como se mira un
                cliente con siete locales. */}
            <ButtonLink href={`${base}/grupos`} variant="secondary">
              {es.teamArea.groups.title}
            </ButtonLink>
            <ButtonLink href={`${base}/nuevo`} icon="plus">
              {t.createButton}
            </ButtonLink>
          </>
        }
      >
        <p className="mt-1 text-sm text-text">{t.activeCount(list.activeCount)}</p>
      </PageHeader>

      {list.rows.length === 0 ? null : (
        <ListFilters
          groups={list.groups}
          plans={list.plans}
          filters={filters}
          hasFilters={hasFilters}
          action={base}
        />
      )}

      {list.rows.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyReason} />
      ) : rows.length === 0 ? (
        // Un filtro que no casa con nada NO es "no hay restaurantes":
        // decirlo así mandaría a crear uno que ya existe (CA-20).
        <EmptyState title={t.filteredEmptyTitle} description={t.filteredEmptyReason} />
      ) : (
        <>
          {/*
            M02 · en escritorio, la tabla de la maqueta: foto y nombre,
            grupo, plan, estado, solicitudes abiertas, responsable y "Ver
            ficha". En un teléfono una tabla así se recorta o hay que
            moverla de lado, y ahí siguen las fichas de la página 23 del
            diseño móvil (`EstablishmentCard`).

            "Supervisor" en la maqueta es aquí **responsable** (RN-EST-19):
            supervisor ya significa otra cosa en Cuotly. Y el menú de tres
            puntos no va: no hay ninguna acción decidida para él.
          */}
          <Card className="hidden md:block">
            <Table
              footer={
                <TableFooter>
                  <span>{es.ui.table.showing(rows.length, list.rows.length, t.rowsNoun)}</span>
                </TableFooter>
              }
            >
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{t.nameColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.groupColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.planColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.statusColumn}</TableHeaderCell>
                  <TableHeaderCell>{t.openRequests}</TableHeaderCell>
                  <TableHeaderCell>{t.manager}</TableHeaderCell>
                  <TableHeaderCell>{t.attentionColumn}</TableHeaderCell>
                  <TableHeaderCell>{es.ui.table.actions}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <EntityCell
                        media={<EstablishmentPhoto photoUrl={row.photoUrl} size={44} />}
                        title={row.name}
                        subtitle={row.city ?? row.code}
                      />
                    </TableCell>
                    <TableCell>{row.groupName ?? t.noGroup}</TableCell>
                    <TableCell>
                      {row.planName === null ? (
                        <span className="text-xs text-text-secondary">{t.noPlan}</span>
                      ) : (
                        <StatusBadge tone="info">{row.planName}</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={statusTone(row.status)}>
                        {es.naming.states.establishment[row.status]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>{row.openRequests}</TableCell>
                    <TableCell>
                      {row.manager === null ? (
                        <span className="text-text-secondary">{t.noManager}</span>
                      ) : (
                        <PersonCell name={row.manager.name ?? t.managerUnknown} />
                      )}
                    </TableCell>
                    <TableCell>
                      <AttentionCell items={row.attention} />
                    </TableCell>
                    <TableCell>
                      <ButtonLink href={`${base}/${row.id}`} variant="outline" size="sm">
                        {es.ui.table.viewSheet}
                      </ButtonLink>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <ul className="space-y-3 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <EstablishmentCard row={row} href={`${base}/${row.id}`} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
