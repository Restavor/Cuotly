import { notFound, redirect } from "next/navigation";

import {
  ButtonLink,
  Card,
  EmptyState,
  EntityCell,
  FilterBar,
  FilterSelect,
  NoPermissionState,
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
import { EstablishmentPhoto } from "@/components/establishment/EstablishmentPhoto";
import { CHANGE_CATEGORIES } from "@/core/classification-rules";
import { REQUEST_STATES } from "@/core/naming";
import { requestHeadline, requestTone } from "@/core/requests";
import { loadTeamRequests } from "./list-query";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadEstablishmentPhotos } from "@/services/establishment-photo";

/**
 * Bandeja de solicitudes del equipo (HU-11, PRD §20.4), con la pinta de la
 * página 62 del diseño (M08): título y subtítulo, la barra de filtros
 * —restaurante, estado, categoría— y la tabla con la foto del local.
 *
 * Qué solicitudes aparecen no lo decide esta pantalla: lo decide RLS.
 * Un trabajador ve las de sus establecimientos autorizados; propietario y
 * administradores, las del espacio entero. Aquí no hay ni un filtro de
 * permisos escrito a mano, y es a propósito (CLAUDE.md: ocultar no es
 * controlar; y al revés, filtrar aquí duplicaría la regla). Los tres
 * filtros de la barra **recortan** lo que RLS ya dejó pasar.
 *
 * `select` enumera columnas siempre: `requests` tiene privilegios de
 * columna para que el cliente no vea la identidad del equipo, así que
 * `select *` devuelve 403.
 *
 * El "+ Nueva solicitud" de la maqueta no va: una solicitud la pide el
 * restaurante desde su panel (RN-REQ), no el equipo desde aquí. Un botón
 * que abriera un formulario que no existe prometería lo que la regla no
 * da. Y el panel de detalle de la derecha es la pantalla de la solicitud,
 * a la que lleva "Ver solicitud".
 */
export const dynamic = "force-dynamic";

type RequestStateKey = keyof typeof es.naming.states.request;
type CategoryKey = keyof typeof es.naming.categories;

export default async function TeamRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ restaurante?: string; estado?: string; categoria?: string }>;
}) {
  const { slug } = await params;
  // §15.2 · a `restaurante` llega el enlace "Ver todas" de la Operación de
  // la ficha. Los tres recortan filas que RLS ya dejó pasar: no enseñan
  // ni esconden nada que no estuviera decidido antes (CLAUDE.md).
  const query = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, slug, timezone")
    .eq("slug", slug)
    .maybeSingle();

  if (!space) notFound();

  // Sin pertenecer al espacio no hay bandeja que enseñar. La comprobación
  // de verdad la hace RLS —esta consulta devolvería cero filas igual—,
  // pero decir "sin acceso" es más honesto que enseñar una lista vacía
  // como si no hubiera trabajo (CA-20).
  const { data: membership } = await supabase
    .from("space_memberships")
    .select("role")
    .eq("space_id", space.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const t = es.teamArea.requests;

  if (!membership) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} />
        <NoPermissionState />
      </div>
    );
  }

  const restaurante = query.restaurante === "" ? undefined : query.restaurante;
  const estado = (REQUEST_STATES as readonly string[]).includes(query.estado ?? "")
    ? query.estado
    : undefined;
  const categoria = (CHANGE_CATEGORIES as readonly string[]).includes(query.categoria ?? "")
    ? query.categoria
    : undefined;

  // Qué filas y en qué orden lo decide `loadTeamRequests()`, que es el
  // mismo sitio del que lo lee el paginador del detalle: así el
  // "siguiente" de una solicitud no puede llevar a otro sitio que el
  // siguiente de esta tabla.
  const [todas, { data: establishments }] = await Promise.all([
    loadTeamRequests(supabase, space.id, restaurante),
    supabase.from("establishments").select("id, name, city").eq("space_id", space.id).order("name"),
  ]);

  const rows = todas.filter(
    (request) =>
      (estado === undefined || request.state === estado) &&
      (categoria === undefined || request.validated_category === categoria),
  );

  // RN-EST-18 · las fotos de los locales, firmadas de una vez para toda
  // la tabla. Solo de los que aparecen: no hay que firmar cincuenta
  // enlaces para pintar cuatro filas.
  const fotos = await loadEstablishmentPhotos(
    supabase,
    supabase.storage,
    [...new Set(rows.map((request) => request.establishment_id))],
  );

  const establecimiento = new Map((establishments ?? []).map((e) => [e.id, e]));
  const hasFilters = restaurante !== undefined || estado !== undefined || categoria !== undefined;
  const base = `/espacios/${slug}/solicitudes`;
  const hrefSolicitud = (id: string) =>
    restaurante === undefined ? `${base}/${id}` : `${base}/${id}?restaurante=${restaurante}`;

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} subtitle={t.subtitle} />

      {todas.length === 0 && !hasFilters ? null : (
        <FilterBar action={base} hasFilters={hasFilters}>
          <FilterSelect
            id="filtro-restaurante"
            name="restaurante"
            label={t.filterRestaurant}
            defaultValue={restaurante}
            options={(establishments ?? []).map((e) => ({ value: e.id, label: e.name }))}
          />
          <FilterSelect
            id="filtro-estado"
            name="estado"
            label={t.filterState}
            defaultValue={estado}
            options={REQUEST_STATES.map((state) => ({
              value: state,
              label: es.naming.states.request[state],
            }))}
          />
          <FilterSelect
            id="filtro-categoria"
            name="categoria"
            label={t.filterCategory}
            defaultValue={categoria}
            allLabel={es.ui.filters.allFeminine}
            options={CHANGE_CATEGORIES.map((category) => ({
              value: category,
              label: es.naming.categories[category],
            }))}
          />
        </FilterBar>
      )}

      <Card>
        {todas.length === 0 && !hasFilters ? (
          <EmptyState title={t.emptyTitle} description={t.emptyReason} />
        ) : rows.length === 0 ? (
          // Un filtro que no casa con nada NO es "no hay solicitudes"
          // (CA-20): se dice que es el filtro.
          <EmptyState
            icon="search"
            title={t.filteredEmptyTitle}
            description={t.filteredEmptyReason}
            action={
              <ButtonLink href={base} variant="secondary" size="sm">
                {es.ui.filters.clear}
              </ButtonLink>
            }
          />
        ) : (
          <Table
            footer={
              <TableFooter>
                <span>{es.ui.table.showing(rows.length, todas.length, t.rowsNoun)}</span>
              </TableFooter>
            }
          >
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t.establishmentColumn}</TableHeaderCell>
                <TableHeaderCell>{t.codeColumn}</TableHeaderCell>
                <TableHeaderCell>{t.descriptionColumn}</TableHeaderCell>
                <TableHeaderCell>{t.dateColumn}</TableHeaderCell>
                <TableHeaderCell>{t.stateColumn}</TableHeaderCell>
                <TableHeaderCell>{t.categoryColumn}</TableHeaderCell>
                <TableHeaderCell>{es.ui.table.view}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((request) => {
                const local = establecimiento.get(request.establishment_id);
                return (
                  <TableRow key={request.id}>
                    <TableCell>
                      <EntityCell
                        media={
                          <EstablishmentPhoto
                            photoUrl={fotos.get(request.establishment_id) ?? null}
                            size={40}
                          />
                        }
                        title={local?.name ?? "—"}
                        subtitle={local?.city ?? null}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-text-secondary">{request.code}</span>
                    </TableCell>
                    {/*
                      La misma primera frase que hace de titular en el
                      detalle: la fila y la pantalla a la que lleva tienen
                      que llamar igual a lo mismo (CA-21). El texto entero
                      sigue allí, en "Mensaje del restaurante".
                    */}
                    <TableCell>
                      <span className="block max-w-xs truncate">
                        {requestHeadline(request.description)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="whitespace-nowrap">
                        {enZona(request.created_at, space.timezone, { dateStyle: "medium" })}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={requestTone(request.state)}>
                        {es.naming.states.request[request.state as RequestStateKey] ??
                          request.state}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      {request.validated_category
                        ? (es.naming.categories[request.validated_category as CategoryKey] ??
                          request.validated_category)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <ButtonLink href={hrefSolicitud(request.id)} variant="outline" size="sm">
                        {t.viewRequest}
                      </ButtonLink>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
