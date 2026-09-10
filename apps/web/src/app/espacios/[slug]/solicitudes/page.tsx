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
import { ListFilterNotice } from "@/components/establishment/ListFilterNotice";
import { requestHeadline, requestTone } from "@/core/requests";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * Bandeja de solicitudes del equipo (HU-11, PRD §20.4).
 *
 * Qué solicitudes aparecen no lo decide esta pantalla: lo decide RLS.
 * Un trabajador ve las de sus establecimientos autorizados; propietario y
 * administradores, las del espacio entero. Aquí no hay ni un filtro de
 * permisos escrito a mano, y es a propósito (CLAUDE.md: ocultar no es
 * controlar; y al revés, filtrar aquí duplicaría la regla).
 *
 * `select` enumera columnas siempre: `requests` tiene privilegios de
 * columna para que el cliente no vea la identidad del equipo, así que
 * `select *` devuelve 403.
 */
export const dynamic = "force-dynamic";

type RequestStateKey = keyof typeof es.naming.states.request;
type CategoryKey = keyof typeof es.naming.categories;

export default async function TeamRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ restaurante?: string }>;
}) {
  const { slug } = await params;
  // §15.2 · a este filtro llega el enlace "Ver todas" de la Operación de
  // la ficha. Recorta filas que RLS ya dejó pasar: no enseña ni esconde
  // nada que no estuviera decidido antes (CLAUDE.md).
  const { restaurante } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, slug")
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

  if (!membership) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-3xl font-bold text-primary-dark">{es.teamArea.requests.title}</h1>
        <NoPermissionState />
      </div>
    );
  }

  const { data: requests } = await supabase
    .from("requests")
    .select("id, code, description, state, created_at, validated_category, establishment_id")
    .eq("space_id", space.id)
    .neq("state", "draft")
    .order("created_at", { ascending: false });

  const { data: establishments } = await supabase
    .from("establishments")
    .select("id, name")
    .eq("space_id", space.id);

  const nameById = new Map((establishments ?? []).map((e) => [e.id, e.name]));

  const rows =
    restaurante === undefined
      ? (requests ?? [])
      : (requests ?? []).filter((request) => request.establishment_id === restaurante);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-primary-dark">{es.teamArea.requests.title}</h1>
        <p className="mt-1 text-sm text-text-secondary">{es.teamArea.requests.subtitle}</p>
      </header>

      {restaurante === undefined ? null : (
        <ListFilterNotice
          establishmentName={nameById.get(restaurante) ?? null}
          allHref={`/espacios/${slug}/solicitudes`}
        />
      )}

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={es.teamArea.requests.emptyTitle}
            description={es.teamArea.requests.emptyReason}
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.teamArea.requests.codeColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.requests.establishmentColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.requests.descriptionColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.requests.stateColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.requests.categoryColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.requests.dateColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <Link
                      href={`/espacios/${slug}/solicitudes/${request.id}`}
                      className="font-medium text-cuotly-green underline"
                    >
                      {request.code}
                    </Link>
                  </TableCell>
                  <TableCell>{nameById.get(request.establishment_id) ?? "—"}</TableCell>
                  {/*
                    La misma primera frase que hace de titular en el
                    detalle: la fila y la pantalla a la que lleva tienen que
                    llamar igual a lo mismo (CA-21). El texto completo sigue
                    entero allí, en "Mensaje del restaurante".
                  */}
                  <TableCell>{requestHeadline(request.description)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={requestTone(request.state)}>
                      {es.naming.states.request[request.state as RequestStateKey] ?? request.state}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {request.validated_category
                      ? (es.naming.categories[request.validated_category as CategoryKey] ??
                        request.validated_category)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(
                      new Date(request.created_at),
                    )}
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
