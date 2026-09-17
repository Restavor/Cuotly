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
import { groupJobsByState } from "@/core/job-board";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadTeamJobs } from "./list-query";

/**
 * Tablero de trabajos del equipo (HU-16 a HU-23, PRD §20.4).
 *
 * Qué trabajos se ven lo decide RLS: un trabajador ve los suyos y los de
 * sus establecimientos autorizados; propietario y administradores, todos.
 */
export const dynamic = "force-dynamic";

type JobStateKey = keyof typeof es.naming.states.job;
type CategoryKey = keyof typeof es.naming.categories;

export function jobTone(state: string): "success" | "warning" | "info" | "neutral" | "danger" {
  if (state === "published" || state === "completed") return "success";
  if (state === "blocked_by_client" || state === "authorized_pause") return "warning";
  // La base no admite un `cancelled` a secas: son los dos de RN-JOB-04,
  // según si se canceló antes o después de Comenzar. Comparar con
  // "cancelled" no acertaba nunca y un trabajo cancelado salía en gris.
  if (state === "cancelled_before_start" || state === "cancelled_after_start") return "danger";
  if (state === "in_progress" || state === "in_correction") return "info";
  if (state === "reassignment_requested") return "warning";
  return "neutral";
}

export default async function TeamJobsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ restaurante?: string; vista?: string }>;
}) {
  const { slug } = await params;
  // A este filtro llega el enlace "Ver todos" de la Operación de la ficha
  // (vista 04). Recorta filas que RLS ya dejó pasar.
  const { restaurante, vista } = await searchParams;
  // M09 · el tablero es la misma bandeja agrupada por estado, no otra
  // pantalla ni otra consulta. Por eso vive en la misma ruta y solo
  // cambia cómo se pinta lo que ya se ha leído.
  const enTablero = vista === "tablero";
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

  const { data: membership } = await supabase
    .from("space_memberships")
    .select("role")
    .eq("space_id", space.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{es.teamArea.jobs.title}</h1>
        <NoPermissionState />
      </div>
    );
  }

  // Qué filas y en qué orden lo decide `loadTeamJobs()`, el mismo sitio
  // del que lo lee el paginador del detalle: así el "siguiente" de un
  // trabajo no puede llevar a otro sitio que el siguiente de esta tabla.
  const jobs = await loadTeamJobs(supabase, space.id);


  const [{ data: establishments }, { data: people }] = await Promise.all([
    supabase.from("establishments").select("id, name").eq("space_id", space.id),
    supabase.from("profiles").select("id, full_name, email"),
  ]);

  const establishmentName = new Map((establishments ?? []).map((e) => [e.id, e.name]));
  const personName = new Map(
    (people ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]),
  );

  const rows =
    restaurante === undefined
      ? (jobs ?? [])
      : (jobs ?? []).filter((job) => job.establishment_id === restaurante);

  const hrefTrabajo = (id: string) =>
    restaurante === undefined
      ? `/espacios/${slug}/trabajos/${id}`
      : `/espacios/${slug}/trabajos/${id}?restaurante=${restaurante}`;

  const hrefVista = (destino: "lista" | "tablero") => {
    const query = new URLSearchParams();
    if (restaurante !== undefined) query.set("restaurante", restaurante);
    if (destino === "tablero") query.set("vista", "tablero");
    const cola = query.toString();
    return cola === "" ? `/espacios/${slug}/trabajos` : `/espacios/${slug}/trabajos?${cola}`;
  };

  const { columns, unknown } = groupJobsByState(rows);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-1 text-2xl font-bold text-primary-dark">{es.teamArea.jobs.title}</h1>
      {/*
        Por qué la lista no va por fecha: el restaurante ordena sus cambios
        por importancia y eso mueve la bandeja (encargo de Bosco,
        11/09/2026). Se dice solo cuando hay algo ordenado, porque si no
        estaría explicando un orden que no está pasando.
      */}
      <p className="mb-6 text-sm text-text-secondary">
        {es.teamArea.jobs.subtitle}
        {rows.some((job) => job.priority_rank !== null) ? ` ${es.teamArea.jobs.orderHint}` : null}
      </p>

      {restaurante === undefined ? null : (
        <div className="mb-4">
          <ListFilterNotice
            establishmentName={establishmentName.get(restaurante) ?? null}
            allHref={`/espacios/${slug}/trabajos`}
          />
        </div>
      )}

      {/* M09 · lista y tablero son la misma bandeja; el conmutador no
          recarga otra consulta, solo cambia cómo se pinta lo leído. Por eso
          conserva el filtro de restaurante si lo había. */}
      <div className="mb-4 flex items-center gap-3 text-sm">
        <span className="font-semibold text-text">{es.teamArea.jobs.viewLabel}:</span>
        <Link
          href={hrefVista("lista")}
          aria-current={enTablero ? undefined : "page"}
          className={
            enTablero ? "text-cuotly-green underline" : "font-semibold text-primary-dark"
          }
        >
          {es.teamArea.jobs.viewList}
        </Link>
        <Link
          href={hrefVista("tablero")}
          aria-current={enTablero ? "page" : undefined}
          className={
            enTablero ? "font-semibold text-primary-dark" : "text-cuotly-green underline"
          }
        >
          {es.teamArea.jobs.viewBoard}
        </Link>
      </div>

      {enTablero ? <p className="mb-4 text-sm text-text-secondary">{es.teamArea.jobs.boardHint}</p> : null}

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={es.teamArea.jobs.emptyTitle}
            description={es.teamArea.jobs.emptyReason}
          />
        ) : enTablero ? (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {columns.map((columna) => (
              <section key={columna.state} className="w-64 shrink-0">
                <header className="mb-2">
                  <StatusBadge tone={jobTone(columna.state)}>
                    {es.naming.states.job[columna.state]}
                  </StatusBadge>
                  <p className="mt-1 text-xs text-text-secondary">
                    {es.teamArea.jobs.boardColumnCount(columna.jobs.length)}
                  </p>
                </header>
                {columna.jobs.length === 0 ? (
                  <p className="rounded-[10px] border border-dashed border-border p-3 text-xs text-text-secondary">
                    {es.teamArea.jobs.boardColumnEmpty}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {columna.jobs.map((job) => (
                      <li
                        key={job.id}
                        className="rounded-[10px] border border-border bg-surface p-3"
                      >
                        <Link href={hrefTrabajo(job.id)} className="text-cuotly-green underline">
                          {job.code}
                        </Link>
                        <p className="mt-1 text-xs text-text">
                          {establishmentName.get(job.establishment_id) ?? "—"}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {job.assigned_to
                            ? (personName.get(job.assigned_to) ?? "—")
                            : es.teamArea.jobs.unassigned}
                        </p>
                        {job.priority_rank === null ? null : (
                          <p className="text-xs text-text-secondary">
                            {es.teamArea.jobs.priorityColumn}:{" "}
                            {es.teamArea.jobs.priorityShort(job.priority_rank)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            {/* Un trabajo con un estado fuera de los once no debería existir
                —la base lo impide con un CHECK—, pero si existiera, esconderlo
                sería hacerlo desaparecer de la bandeja del equipo. */}
            {unknown.length === 0 ? null : (
              <section className="w-64 shrink-0">
                <header className="mb-2">
                  <StatusBadge tone="danger">{es.teamArea.jobs.boardUnknownTitle}</StatusBadge>
                  <p className="mt-1 text-xs text-text-secondary">
                    {es.teamArea.jobs.boardUnknownHint}
                  </p>
                </header>
                <ul className="space-y-2">
                  {unknown.map((job) => (
                    <li
                      key={job.id}
                      className="rounded-[10px] border border-border bg-surface p-3"
                    >
                      <Link href={hrefTrabajo(job.id)} className="text-cuotly-green underline">
                        {job.code}
                      </Link>
                      <p className="mt-1 text-xs text-text-secondary">{job.state}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.teamArea.jobs.codeColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.jobs.establishmentColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.jobs.stateColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.jobs.assigneeColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.jobs.categoryColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.jobs.priorityColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <Link href={hrefTrabajo(job.id)} className="text-cuotly-green underline">
                      {job.code}
                    </Link>
                  </TableCell>
                  <TableCell>{establishmentName.get(job.establishment_id) ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge tone={jobTone(job.state)}>
                      {es.naming.states.job[job.state as JobStateKey] ?? job.state}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {job.assigned_to
                      ? (personName.get(job.assigned_to) ?? "—")
                      : es.teamArea.jobs.unassigned}
                  </TableCell>
                  <TableCell>
                    {job.category
                      ? (es.naming.categories[job.category as CategoryKey] ?? job.category)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {job.priority_rank === null
                      ? es.teamArea.jobs.priorityShortNone
                      : es.teamArea.jobs.priorityShort(job.priority_rank)}
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
