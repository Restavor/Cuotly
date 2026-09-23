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
  PersonCell,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
} from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { deadlinesByJob, groupJobsByState } from "@/core/job-board";
import { JOB_STATES } from "@/core/naming";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadSpaceAttention } from "../home-load";
import { JobBoard } from "./JobBoard";
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
  searchParams: Promise<{
    restaurante?: string;
    vista?: string;
    responsable?: string;
    estado?: string;
  }>;
}) {
  const { slug } = await params;
  // A `restaurante` llega el enlace "Ver todos" de la Operación de la ficha
  // (vista 04). Los tres filtros recortan filas que RLS ya dejó pasar.
  const query = await searchParams;
  const restaurante = query.restaurante === "" ? undefined : query.restaurante;
  const responsable = query.responsable === "" ? undefined : query.responsable;
  const estado = (JOB_STATES as readonly string[]).includes(query.estado ?? "")
    ? query.estado
    : undefined;
  // M09 · el tablero es la misma bandeja agrupada por estado, no otra
  // pantalla ni otra consulta. Por eso vive en la misma ruta y solo
  // cambia cómo se pinta lo que ya se ha leído.
  const enTablero = query.vista === "tablero";
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

  const t = es.teamArea.jobs;

  if (!membership) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} />
        <NoPermissionState />
      </div>
    );
  }

  // Qué filas y en qué orden lo decide `loadTeamJobs()`, el mismo sitio
  // del que lo lee el paginador del detalle: así el "siguiente" de un
  // trabajo no puede llevar a otro sitio que el siguiente de esta tabla.
  const [jobs, { data: establishments }, { data: people }, atencion] = await Promise.all([
    loadTeamJobs(supabase, space.id),
    supabase.from("establishments").select("id, name").eq("space_id", space.id).order("name"),
    supabase.from("profiles").select("id, full_name, email"),
    // El aviso de plazo de cada tarjeta lo calcula el reloj laborable en
    // `loadSpaceAttention()`, la misma cuenta que "Necesita atención" del
    // Inicio. Solo hace falta en el tablero; si falla, las tarjetas salen
    // sin aviso en vez de dejar la bandeja en blanco.
    enTablero ? loadSpaceAttention(supabase, space.id, slug).catch(() => null) : Promise.resolve(null),
  ]);

  const establishmentName = new Map((establishments ?? []).map((e) => [e.id, e.name]));
  const personName = new Map(
    (people ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]),
  );

  const todos = jobs ?? [];
  const rows = todos.filter(
    (job) =>
      (restaurante === undefined || job.establishment_id === restaurante) &&
      (responsable === undefined || job.assigned_to === responsable) &&
      (estado === undefined || job.state === estado),
  );
  const hasFilters = restaurante !== undefined || responsable !== undefined || estado !== undefined;

  // Las personas del desplegable "Responsable" son las que llevan algún
  // trabajo del espacio, no todos los perfiles que RLS deja leer: un
  // nombre que no lleva ninguno devolvería cero filas y parecería un error.
  const responsables = [...new Set(todos.map((job) => job.assigned_to).filter(Boolean))].map(
    (id) => ({ value: id as string, label: personName.get(id as string) ?? "—" }),
  );

  const base = `/espacios/${slug}/trabajos`;
  const conFiltros = (extra: Readonly<Record<string, string | undefined>>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ restaurante, responsable, estado, ...extra })) {
      if (v !== undefined) q.set(k, v);
    }
    const cola = q.toString();
    return cola === "" ? base : `${base}?${cola}`;
  };
  const hrefTrabajo = (id: string) =>
    restaurante === undefined ? `${base}/${id}` : `${base}/${id}?restaurante=${restaurante}`;

  const { columns, unknown } = groupJobsByState(rows);

  return (
    <div className="space-y-6">
      {/*
        Página 65 (M09) · título, subtítulo y las pestañas Lista / Tablero.
        El "+ Nuevo trabajo" de la maqueta no va: un trabajo nace de una
        solicitud aceptada (RN-JOB), no de un botón; un botón que abriera
        un formulario que no existe prometería lo que la regla no da.

        Por qué la lista no va por fecha: el restaurante ordena sus cambios
        por importancia y eso mueve la bandeja (encargo de Bosco,
        11/09/2026). Se dice solo cuando hay algo ordenado, porque si no
        estaría explicando un orden que no está pasando.
      */}
      <PageHeader
        title={t.title}
        subtitle={`${t.subtitle}${
          rows.some((job) => job.priority_rank !== null) ? ` ${t.orderHint}` : ""
        }`}
      />

      {/* M09 · lista y tablero son la misma bandeja; el conmutador no
          recarga otra consulta, solo cambia cómo se pinta lo leído. Por eso
          conserva los filtros que hubiera. */}
      <Tabs
        label={t.viewLabel}
        active={enTablero ? "tablero" : "lista"}
        tabs={[
          { key: "lista", label: t.viewList, href: conFiltros({ vista: undefined }) },
          { key: "tablero", label: t.viewBoard, href: conFiltros({ vista: "tablero" }) },
        ]}
      />

      {todos.length === 0 && !hasFilters ? null : (
        <FilterBar
          action={base}
          hasFilters={hasFilters}
          hidden={{ vista: enTablero ? "tablero" : undefined }}
        >
          <FilterSelect
            id="filtro-restaurante"
            name="restaurante"
            label={t.filterRestaurant}
            defaultValue={restaurante}
            options={(establishments ?? []).map((e) => ({ value: e.id, label: e.name }))}
          />
          <FilterSelect
            id="filtro-responsable"
            name="responsable"
            label={t.filterAssignee}
            defaultValue={responsable}
            options={responsables}
          />
          <FilterSelect
            id="filtro-estado"
            name="estado"
            label={t.filterState}
            defaultValue={estado}
            options={JOB_STATES.map((state) => ({
              value: state,
              label: es.naming.states.job[state],
            }))}
          />
        </FilterBar>
      )}

      {enTablero ? <p className="text-sm text-text-secondary">{t.boardHint}</p> : null}

      <Card>
        {todos.length === 0 && !hasFilters ? (
          <EmptyState title={t.emptyTitle} description={t.emptyReason} />
        ) : rows.length === 0 ? (
          // Un filtro que no casa con nada NO es "no hay trabajos" (CA-20).
          <EmptyState title={t.filteredEmptyTitle} description={t.filteredEmptyReason} />
        ) : enTablero ? (
          <JobBoard
            columns={columns}
            unknown={unknown}
            deadlines={deadlinesByJob(atencion?.items ?? [])}
            establishmentName={establishmentName}
            personName={personName}
            href={hrefTrabajo}
            tone={jobTone}
          />
        ) : (
          <Table
            footer={
              <TableFooter>
                <span>{es.ui.table.showing(rows.length, todos.length, t.rowsNoun)}</span>
              </TableFooter>
            }
          >
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t.codeColumn}</TableHeaderCell>
                <TableHeaderCell>{t.establishmentColumn}</TableHeaderCell>
                <TableHeaderCell>{t.assigneeColumn}</TableHeaderCell>
                <TableHeaderCell>{t.stateColumn}</TableHeaderCell>
                <TableHeaderCell>{t.priorityColumn}</TableHeaderCell>
                <TableHeaderCell>{es.ui.table.actions}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <EntityCell
                      media={
                        <span
                          aria-hidden="true"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-cuotly-green/10 text-cuotly-green"
                        >
                          <Icon name="job" className="h-[18px] w-[18px]" />
                        </span>
                      }
                      title={job.code}
                      subtitle={
                        job.category
                          ? (es.naming.categories[job.category as CategoryKey] ?? job.category)
                          : null
                      }
                    />
                  </TableCell>
                  <TableCell>{establishmentName.get(job.establishment_id) ?? "—"}</TableCell>
                  <TableCell>
                    {job.assigned_to ? (
                      <PersonCell name={personName.get(job.assigned_to) ?? "—"} />
                    ) : (
                      <span className="text-text-secondary">{t.unassigned}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={jobTone(job.state)}>
                      {es.naming.states.job[job.state as JobStateKey] ?? job.state}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {job.priority_rank === null
                      ? t.priorityShortNone
                      : t.priorityShort(job.priority_rank)}
                  </TableCell>
                  <TableCell>
                    <ButtonLink href={hrefTrabajo(job.id)} variant="outline" size="sm">
                      {t.viewJob}
                    </ButtonLink>
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
