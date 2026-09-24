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
import {
  type IncidentImpact,
  type IncidentKind,
  type IncidentState,
  incidentAwaitsSpace,
  incidentPriorityFor,
} from "@/core/support";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { priorityTone, stateTone } from "../../../../administracion/incidencias/tone";

/**
 * Las incidencias del espacio a Cuotly (RN-SOP-01): errores y sugerencias,
 * separados (RN-SOP-02). Las ven el propietario y los administradores; la
 * RLS de `incidents` ya lo decide, y aquí solo se dice "sin acceso" a quien
 * no lo tiene en vez de enseñar una lista vacía que parecería un dato.
 */
export const dynamic = "force-dynamic";

export default async function SpaceIncidentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, timezone, cuotly_plan")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const t = es.help.incidents;
  const base = `/espacios/${slug}/ayuda/incidencias`;

  const { data: puede } = await supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "contact_cuotly" });
  if (!puede) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{t.title}</h1>
        <NoPermissionState title={t.noAccessTitle} description={t.noAccessReason} />
      </div>
    );
  }

  const { data: filas } = await supabase
    .from("incidents")
    .select("id, kind, category, impact, status, description, opened_at, last_activity_at")
    .eq("space_id", space.id)
    .order("last_activity_at", { ascending: false });

  const lista = filas ?? [];
  const errores = lista.filter((i) => i.kind === "error");
  const sugerencias = lista.filter((i) => i.kind === "suggestion");

  const tabla = (items: typeof lista) => (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>{t.status}</TableHeaderCell>
          <TableHeaderCell>{t.category}</TableHeaderCell>
          <TableHeaderCell>{t.priority}</TableHeaderCell>
          <TableHeaderCell>{t.openedAt}</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {items.map((i) => {
          const estado = i.status as IncidentState;
          const prioridad = incidentPriorityFor(i.kind as IncidentKind, (i.impact as IncidentImpact | null) ?? null, space.cuotly_plan);
          return (
            <TableRow key={i.id}>
              <TableCell>
                <StatusBadge tone={stateTone(estado)}>{es.incidents.states[estado]}</StatusBadge>
                {incidentAwaitsSpace(estado) ? (
                  <span className="ml-2 text-xs font-semibold text-text">{t.awaitingYou}</span>
                ) : null}
              </TableCell>
              <TableCell>
                <Link href={`${base}/${i.id}`} className="font-semibold text-primary-dark underline">
                  {es.incidents.categories[i.category as keyof typeof es.incidents.categories] ?? i.category}
                </Link>
                <span className="block max-w-xs truncate text-xs text-text-secondary">{i.description}</span>
              </TableCell>
              <TableCell>
                <StatusBadge tone={priorityTone(prioridad)}>
                  {prioridad === null ? es.incidents.noPriority : es.incidents.priorities[prioridad]}
                </StatusBadge>
              </TableCell>
              <TableCell>{enZona(i.opened_at, space.timezone, { dateStyle: "short", timeStyle: "short" })}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 sm:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
          <p className="text-sm text-text-secondary">{t.subtitle}</p>
        </div>
        <Link
          href={`${base}/nueva`}
          className="inline-flex items-center justify-center rounded-[10px] bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark"
        >
          {t.openNew}
        </Link>
      </header>

      {lista.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyReason} />
      ) : (
        <>
          <Card title={t.errorsTitle}>{errores.length === 0 ? <p className="text-sm text-text-secondary">—</p> : tabla(errores)}</Card>
          <Card title={t.suggestionsTitle}>
            {sugerencias.length === 0 ? <p className="text-sm text-text-secondary">—</p> : tabla(sugerencias)}
          </Card>
        </>
      )}
    </div>
  );
}
