import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { statusTone } from "@/components/establishment/EstablishmentCard";
import { EstablishmentPhoto } from "@/components/establishment/EstablishmentPhoto";
import { RestaurantsTabs } from "@/components/establishment/RestaurantsTabs";
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
import type { EstablishmentState } from "@/core/naming";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadEstablishmentPhotos } from "@/services/establishment-photo";

/**
 * M82 · los grupos de restaurantes del espacio, como el dibujo: a la
 * izquierda la lista con su buscador, a la derecha el grupo elegido
 * (`?grupo=`) con quién tiene acceso a todo él, cuándo nació y los
 * restaurantes que cuelgan.
 *
 * Los grupos existían en la base desde la migración 3; esta pantalla los
 * enseña enteros, que es como se mira un cliente con siete locales.
 *
 * **Lo que el dibujo pone y no está, y por qué** (CLAUDE.md: no se inventa
 * lo que no está decidido):
 *
 *   · "Crear grupo". Un grupo nace con su primer restaurante
 *     —`create_establishment_with_data()` lo crea al escribir un nombre
 *     nuevo—, y un grupo vacío no es nada.
 *   · "Editar grupo" y "Asignar establecimiento". Cambiar un restaurante de
 *     grupo cambia quién entra en él: el propietario global del grupo
 *     tiene acceso automático a sus restaurantes (RN-EST-03), así que
 *     moverlo quitaría y daría accesos a la vez. Ninguna regla del PRD dice
 *     qué pasa entonces, y no hay función que lo haga.
 *   · La descripción y la foto del grupo: `groups` no las guarda.
 *   · "En espacios": un restaurante solo está activo en un espacio a la vez
 *     (RN-EST-07), y la frase de abajo lo dice en vez de una columna que
 *     diría "1" en todas las filas.
 *
 * Qué grupos y qué restaurantes se ven lo decide RLS. Un trabajador ve los
 * de sus restaurantes autorizados; el cliente no llega aquí.
 */
export const dynamic = "force-dynamic";

const t = es.teamArea.groups;

type GroupRoleKey = keyof typeof t.roles;

export default async function SpaceGroupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ buscar?: string; grupo?: string }>;
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
    .select("id, name, timezone")
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
  const action = `${base}/grupos`;

  const [{ data: groups }, { data: establishments }] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name, created_at")
      .eq("space_id", space.id)
      .order("name"),
    supabase
      .from("establishments")
      .select("id, code, name, status, group_id, city")
      .eq("space_id", space.id)
      .order("name"),
  ]);

  const todos = establishments ?? [];
  const archivados = todos.filter((row) => row.status === "archived").length;

  const byGroup = new Map<string, typeof todos>();
  for (const establishment of todos) {
    byGroup.set(establishment.group_id, [
      ...(byGroup.get(establishment.group_id) ?? []),
      establishment,
    ]);
  }

  const buscar = query.buscar ?? "";
  const { shown, selected } = pickListAndSelection(
    groups ?? [],
    buscar,
    query.grupo ?? null,
    (group) => group.name,
  );
  const suyos = selected === null ? [] : (byGroup.get(selected.id) ?? []);

  // Quién tiene acceso a TODO el grupo elegido (RN-EST-03 el propietario
  // global, RN-EST-04 el editor de grupo). Las retiradas no cuentan:
  // `revoked_at` no se borra —no se borra nada— pero un acceso retirado no
  // es un acceso.
  const [{ data: memberships }, fotos] = await Promise.all([
    selected === null
      ? Promise.resolve({
          data: [] as { id: string; user_id: string; role: string }[],
        })
      : supabase
          .from("group_memberships")
          .select("id, user_id, role")
          .eq("group_id", selected.id)
          .is("revoked_at", null),
    loadEstablishmentPhotos(
      supabase,
      supabase.storage,
      suyos.map((row) => row.id),
    ),
  ]);

  const userIds = [...new Set((memberships ?? []).map((m) => m.user_id))];
  const { data: people } = userIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
    : { data: [] };
  const personName = new Map(
    (people ?? []).map((p) => [p.id, p.full_name?.trim() || p.email] as const),
  );

  const grupoHref = (id: string) => {
    const params = new URLSearchParams({ grupo: id });
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

      <RestaurantsTabs slug={slug} active="groups" archivedCount={archivados} />

      {(groups ?? []).length === 0 ? (
        <Card>
          <EmptyState title={t.emptyTitle} description={t.emptyReason} />
        </Card>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-3">
            <FilterBar action={action} hasFilters={buscar.trim() !== ""} label={t.searchLabel}>
              <FilterSearch
                id="buscar-grupo"
                name="buscar"
                defaultValue={buscar}
                placeholder={t.searchPlaceholder}
              />
            </FilterBar>

            {shown.length === 0 ? (
              <Card>
                <EmptyState icon="search" title={t.searchEmptyTitle} description={t.searchEmptyReason} />
              </Card>
            ) : (
              <ul className="space-y-2" aria-label={t.listLabel}>
                {shown.map((group) => {
                  const elegido = group.id === selected?.id;
                  return (
                    <li key={group.id}>
                      <Link
                        href={grupoHref(group.id)}
                        aria-current={elegido ? "true" : undefined}
                        className={`flex items-center gap-3 rounded-card border bg-surface p-3 transition-colors focus:outline focus:outline-2 focus:outline-cuotly-green ${
                          elegido
                            ? "border-cuotly-green bg-cuotly-green/5"
                            : "border-border hover:bg-soft-surface"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-soft-surface text-text-secondary"
                        >
                          <Icon name="building" className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-text">
                            {group.name}
                          </span>
                          <span className="block text-xs text-text-secondary">
                            {t.count((byGroup.get(group.id) ?? []).length)}
                          </span>
                        </span>
                        <Icon
                          name="chevronRight"
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 text-text-secondary"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {selected === null ? null : (
            <div className="min-w-0 space-y-4">
              <Card title={selected.name}>
                <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                  <div className="sm:col-span-3">
                    <dt className="text-text-secondary">{t.accessTitle}</dt>
                    <dd className="mt-1">
                      {(memberships ?? []).length === 0 ? (
                        <span className="text-text-secondary">{t.accessNone}</span>
                      ) : (
                        <ul className="space-y-1">
                          {(memberships ?? []).map((acceso) => (
                            <li key={acceso.id} className="text-text">
                              {personName.get(acceso.user_id) ?? t.personUnknown}
                              {" · "}
                              <span className="text-text-secondary">
                                {t.roles[acceso.role as GroupRoleKey] ?? acceso.role}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-secondary">{t.createdAtLabel}</dt>
                    <dd className="font-medium text-text">
                      {enZona(selected.created_at, space.timezone, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-secondary">{t.establishmentsCountLabel}</dt>
                    <dd className="font-medium text-text">{suyos.length}</dd>
                  </div>
                </dl>
              </Card>

              <Card title={t.establishmentsTitle}>
                {suyos.length === 0 ? (
                  <EmptyState title={t.establishmentsNoneTitle} description={t.establishmentsNone} />
                ) : (
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>{t.establishmentColumn}</TableHeaderCell>
                        <TableHeaderCell>{t.codeColumn}</TableHeaderCell>
                        <TableHeaderCell>{t.statusColumn}</TableHeaderCell>
                        <TableHeaderCell>{es.ui.table.actions}</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {suyos.map((establishment) => (
                        <TableRow key={establishment.id}>
                          <TableCell>
                            <EntityCell
                              media={
                                <EstablishmentPhoto
                                  photoUrl={fotos.get(establishment.id) ?? null}
                                  size={40}
                                />
                              }
                              title={establishment.name}
                              subtitle={establishment.city ?? undefined}
                            />
                          </TableCell>
                          <TableCell>
                            <span className="whitespace-nowrap text-text-secondary">
                              {establishment.code}
                            </span>
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              tone={statusTone(establishment.status as EstablishmentState)}
                            >
                              {es.naming.states.establishment[
                                establishment.status as EstablishmentState
                              ] ?? establishment.status}
                            </StatusBadge>
                          </TableCell>
                          <TableCell>
                            <ButtonLink
                              href={`${base}/${establishment.id}`}
                              variant="outline"
                              size="sm"
                            >
                              {es.ui.table.viewSheet}
                            </ButtonLink>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <p className="mt-4 flex items-start gap-2 rounded-[10px] bg-soft-surface px-3 py-2.5 text-sm text-text-secondary">
                  <Icon name="alert" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  {t.oneSpaceNote}
                </p>
              </Card>

              <Card title={t.howTitle}>
                <p className="text-sm text-text-secondary">{t.howBorn}</p>
                <p className="mt-2 text-sm text-text-secondary">{t.howAccess}</p>
                <p className="mt-2 text-sm text-text-secondary">{t.howMove}</p>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
