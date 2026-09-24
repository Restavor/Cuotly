import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EstablishmentPhoto } from "@/components/establishment/EstablishmentPhoto";
import { RestaurantsTabs } from "@/components/establishment/RestaurantsTabs";
import { ReactivateForm } from "@/components/establishment/ServiceStatusForms";
import { TransferBlock } from "@/components/establishment/TransferForms";
import {
  ButtonLink,
  Card,
  EmptyState,
  EntityCell,
  NoPermissionState,
  PageHeader,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { FilterBar, FilterSearch } from "@/components/ui/FilterBar";
import { Icon } from "@/components/ui/Icon";
import { pickListAndSelection } from "@/core/establishments";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { loadPendingTransfer } from "../[id]/transfer-load";
import { loadArchivedEstablishments } from "./archived-load";

/**
 * M84 · los restaurantes archivados, con su reactivación y su
 * transferencia a otro espacio.
 *
 * Como el dibujo: la tabla a la izquierda —restaurante, código, fecha de
 * archivo, último plan y estado— y a la derecha el elegido (`?restaurante=`)
 * con lo que se puede hacer con él. Las dos acciones son las mismas de la
 * ficha (Gestión · Estado del servicio), con los mismos componentes y las
 * mismas funciones: `set_establishment_status()` exige `manage_clients` y
 * la transferencia la propone solo el propietario del espacio (RN-TRA).
 * Que un botón se pinte o no es cortesía; quien decide es el servidor
 * (CLAUDE.md).
 *
 * Lo que el dibujo dice y aquí cambia: "Solicitar reactivación" es
 * **Reactivar**, porque en Cuotly reactivar no se pide a nadie: lo hace el
 * equipo, con su motivo, y si hay deuda vencida la guarda de RN-FIN-13 lo
 * para. Y "Buscar espacio de mantenimiento" no es un buscador: un espacio
 * no ve los demás espacios, así que se pega su identificador, como en la
 * ficha.
 */
export const dynamic = "force-dynamic";

const t = es.teamArea.archived;

export default async function ArchivedEstablishmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ buscar?: string; restaurante?: string }>;
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
    .select("id, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const { data: isMember } = await supabase.rpc("is_space_member", { p_space_id: space.id });
  if (!isMember) {
    return (
      <div className="space-y-6">
        <PageHeader title={es.teamArea.establishments.title} />
        <NoPermissionState />
      </div>
    );
  }

  const base = `/espacios/${slug}/restaurantes`;
  const action = `${base}/archivados`;

  const [archivados, { data: gestiona }, { data: soyPropietario }] = await Promise.all([
    loadArchivedEstablishments(supabase, space.id),
    supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "manage_clients" }),
    supabase.rpc("space_owner_is_me", { p_space_id: space.id }),
  ]);

  const buscar = query.buscar ?? "";
  const { shown, selected } = pickListAndSelection(
    archivados,
    buscar,
    query.restaurante ?? null,
    (row) => `${row.name} ${row.code}`,
  );

  const transfer =
    selected === null ? null : await loadPendingTransfer(supabase, selected.id, space.id);

  const dia = (iso: string) =>
    enZona(iso, space.timezone, { day: "numeric", month: "short", year: "numeric" });
  const elegirHref = (id: string) => {
    const params = new URLSearchParams({ restaurante: id });
    if (buscar.trim() !== "") params.set("buscar", buscar);
    return `${action}?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={es.teamArea.establishments.title}
        subtitle={t.subtitle}
        actions={
          <ButtonLink href={`${base}/nuevo`} icon="plus">
            {es.teamArea.establishments.createButton}
          </ButtonLink>
        }
      />

      <RestaurantsTabs slug={slug} active="archived" archivedCount={archivados.length} />

      {archivados.length === 0 ? (
        <Card>
          <EmptyState icon="building" title={t.emptyTitle} description={t.emptyReason} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-3">
            <FilterBar action={action} hasFilters={buscar.trim() !== ""} label={t.searchLabel}>
              <FilterSearch
                id="buscar-archivado"
                name="buscar"
                defaultValue={buscar}
                placeholder={t.searchPlaceholder}
              />
            </FilterBar>

            <Card>
              {shown.length === 0 ? (
                <EmptyState icon="search" title={t.searchEmptyTitle} description={t.searchEmptyReason} />
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>{t.establishmentColumn}</TableHeaderCell>
                      <TableHeaderCell>{t.codeColumn}</TableHeaderCell>
                      <TableHeaderCell>{t.archivedAtColumn}</TableHeaderCell>
                      <TableHeaderCell>{t.lastPlanColumn}</TableHeaderCell>
                      <TableHeaderCell>{t.statusColumn}</TableHeaderCell>
                      <TableHeaderCell>{es.ui.table.actions}</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {shown.map((row) => (
                      <TableRow key={row.id} highlight={row.id === selected?.id}>
                        <TableCell>
                          <EntityCell
                            media={<EstablishmentPhoto photoUrl={row.photoUrl} size={40} />}
                            title={row.name}
                            subtitle={row.city ?? undefined}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="whitespace-nowrap text-text-secondary">{row.code}</span>
                        </TableCell>
                        <TableCell>
                          <span className="whitespace-nowrap">
                            {row.archivedAt === null ? (
                              <span className="text-text-secondary">{t.archivedAtUnknown}</span>
                            ) : (
                              dia(row.archivedAt)
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          {row.lastPlanName ?? (
                            <span className="text-text-secondary">{t.noPlan}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone="warning">
                            {es.naming.states.establishment.archived}
                          </StatusBadge>
                        </TableCell>
                        <TableCell>
                          <ButtonLink
                            href={elegirHref(row.id)}
                            variant="outline"
                            size="sm"
                          >
                            {t.select}
                          </ButtonLink>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>

          {selected === null ? null : (
            <div className="min-w-0 space-y-4">
              <Card>
                <div className="flex items-start gap-4">
                  <EstablishmentPhoto photoUrl={selected.photoUrl} size={72} />
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-primary-dark">
                      {selected.name}
                    </h2>
                    <p className="text-sm text-text-secondary">
                      {t.codeLine(selected.code)}
                    </p>
                    {selected.city === null ? null : (
                      <p className="text-sm text-text-secondary">{selected.city}</p>
                    )}
                  </div>
                </div>

                {/*
                  El ámbar del dibujo: fondo ámbar con el texto oscuro, porque
                  el ámbar como color de texto no llega a 3:1 (CA-22).
                */}
                <dl className="mt-4 grid grid-cols-1 gap-3 rounded-[12px] bg-warning/20 p-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-text-secondary">{t.archivedAtColumn}</dt>
                    <dd className="font-semibold text-primary-dark">
                      {selected.archivedAt === null ? t.archivedAtUnknown : dia(selected.archivedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-secondary">{t.lastPlanColumn}</dt>
                    <dd className="font-semibold text-primary-dark">
                      {selected.lastPlanName ?? t.noPlan}
                    </dd>
                  </div>
                  {selected.archiveReason === null ? null : (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-text-secondary">{t.reasonLabel}</dt>
                      <dd className="whitespace-pre-line text-text">{selected.archiveReason}</dd>
                    </div>
                  )}
                </dl>

                <p className="mt-3 text-sm">
                  <Link href={`${base}/${selected.id}`} className="text-cuotly-green underline">
                    {t.openSheet}
                  </Link>
                </p>
              </Card>

              {gestiona === true ? (
                <ReactivateForm establishmentId={selected.id} />
              ) : (
                <Card title={es.establishmentSheet.serviceReactivateTitle}>
                  <p className="text-sm text-text-secondary">{t.reactivateNoPermission}</p>
                </Card>
              )}

              <TransferBlock
                establishmentId={selected.id}
                pending={transfer}
                canPropose={soyPropietario === true}
              />

              <p className="flex items-start gap-2 rounded-[10px] bg-soft-surface px-3 py-2.5 text-sm text-text-secondary">
                <Icon name="alert" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                {t.nothingAutomatic}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
