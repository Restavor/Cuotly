import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  ButtonLink,
  Card,
  EmptyState,
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
import { TASK_LOAD_POINTS, loadLevel, type TaskWeight } from "@/core/load-points";
import { TASK_STATES } from "@/core/naming";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * HU-21 · las tareas del espacio (§20.2, el destino "Tareas" del menú).
 *
 * Qué tareas se ven lo decide `tasks_select`, no esta pantalla: quien
 * tiene `assign_jobs` ve las del espacio, un trabajador ve las suyas y las
 * de los trabajos que tiene autorizados, y el cliente no ve ninguna —las
 * tareas son organización interna del equipo (P7), y por eso este destino
 * cuelga del menú del espacio y no del de un restaurante.
 *
 * Aquí no se comprueba ni un permiso: si RLS no deja pasar la fila, no
 * hay fila (CLAUDE.md MUST).
 */
export const dynamic = "force-dynamic";

type TaskStateKey = keyof typeof es.naming.states.task;

function taskTone(state: string): "success" | "warning" | "info" | "neutral" | "danger" {
  if (state === "completed") return "success";
  if (state === "blocked") return "warning";
  if (state === "cancelled") return "danger";
  if (state === "in_progress") return "info";
  return "neutral";
}

/**
 * La dirección de esta pantalla con sus filtros puestos, conservando los
 * que ya había.
 *
 * Sin conservarlos, pulsar "Sin terminar" con el filtro de un restaurante
 * puesto devuelve las tareas de todos: quien llegó desde la ficha de
 * Magariños se encuentra las de los demás restaurantes sin haber pedido
 * nada.
 */
function tareasHref(
  slug: string,
  filtros: Readonly<Record<string, string | undefined>>,
): string {
  const params = new URLSearchParams();
  for (const [nombre, valor] of Object.entries(filtros)) {
    if (valor !== undefined) params.set(nombre, valor);
  }
  const query = params.toString();
  return query === "" ? `/espacios/${slug}/tareas` : `/espacios/${slug}/tareas?${query}`;
}

export default async function TeamTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    filtro?: string;
    restaurante?: string;
    responsable?: string;
    estado?: string;
  }>;
}) {
  const { slug } = await params;
  // `restaurante` es a donde llega el enlace "Ver todas" de la Operación
  // de la ficha (vista 04); `filtro` es la pestaña de la propia pantalla,
  // y `responsable` y `estado` los desplegables de M11. Todos recortan
  // filas que RLS ya dejó pasar.
  const query = await searchParams;
  const filtro = query.filtro === "mias" || query.filtro === "abiertas" ? query.filtro : undefined;
  const restaurante = query.restaurante === "" ? undefined : query.restaurante;
  const responsable = query.responsable === "" ? undefined : query.responsable;
  const estado = (TASK_STATES as readonly string[]).includes(query.estado ?? "")
    ? query.estado
    : undefined;
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

  const t = es.teamArea.tasks;

  if (!membership) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} />
        <NoPermissionState />
      </div>
    );
  }

  const { data: taskRows } = await supabase
    .from("tasks")
    .select(
      "id, title, state, weight, estimated_minutes, assignee_id, job_id, establishment_id, created_at",
    )
    .eq("space_id", space.id)
    .order("created_at", { ascending: false });

  const todas = taskRows ?? [];

  // Los filtros son de presentación y se aplican sobre lo que RLS ya dejó
  // pasar: ninguno amplía lo que se ve.
  const rows = todas.filter(
    (tarea) =>
      (restaurante === undefined || tarea.establishment_id === restaurante) &&
      (responsable === undefined || tarea.assignee_id === responsable) &&
      (estado === undefined || tarea.state === estado) &&
      (filtro !== "mias" || tarea.assignee_id === user.id) &&
      (filtro !== "abiertas" || (tarea.state !== "completed" && tarea.state !== "cancelled")),
  );
  const hasFilters = restaurante !== undefined || responsable !== undefined || estado !== undefined;

  const jobIds = [...new Set(todas.map((t) => t.job_id).filter(Boolean))] as string[];
  const [{ data: jobs }, { data: establishments }, { data: people }] = await Promise.all([
    jobIds.length
      ? supabase.from("jobs").select("id, code").in("id", jobIds)
      : Promise.resolve({ data: [] as { id: string; code: string }[] }),
    supabase.from("establishments").select("id, name").eq("space_id", space.id).order("name"),
    supabase.from("profiles").select("id, full_name, email"),
  ]);

  const jobCode = new Map((jobs ?? []).map((j) => [j.id, j.code]));
  const establishmentName = new Map((establishments ?? []).map((e) => [e.id, e.name]));
  const personName = new Map((people ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]));

  // Las personas del desplegable son las que tienen alguna tarea, no
  // todos los perfiles: un nombre sin tareas devolvería cero filas y
  // parecería un error.
  const responsables = [...new Set(todas.map((t) => t.assignee_id).filter(Boolean))].map(
    (id) => ({ value: id as string, label: personName.get(id as string) ?? "—" }),
  );

  // RN-ASG-13 · la carga que suman MIS tareas activas. Es mi propia carga,
  // no una comparación con nadie: RN-ASG-17 prohíbe el ranking entre
  // trabajadores, y por eso no se pinta la de los demás.
  const misPuntos = todas
    .filter(
      (t) => t.assignee_id === user.id && t.state !== "completed" && t.state !== "cancelled",
    )
    .reduce((total, t) => total + TASK_LOAD_POINTS[t.weight as TaskWeight], 0);

  const base = `/espacios/${slug}/tareas`;
  const conFiltros = (extra: Readonly<Record<string, string | undefined>>) =>
    tareasHref(slug, { filtro, restaurante, responsable, estado, ...extra });

  return (
    <div className="space-y-6">
      {/*
        Página 69 (M11) · título, subtítulo y las pestañas "Todas / Mis
        tareas", más "Sin terminar", que no está en el dibujo y se queda:
        es el filtro que más se usa en el día a día. El formulario "Nueva
        tarea" de la derecha no va aquí: una tarea nace desglosando un
        trabajo, desde su propia pantalla, donde ya está el formulario.
      */}
      <PageHeader title={t.title} subtitle={t.subtitle}>
        {misPuntos > 0 ? (
          <p className="mt-1 text-sm text-text">
            {t.myLoad}: {es.space.jobs.loadLevels[loadLevel(misPuntos)]} · {misPuntos}{" "}
            {t.pointsColumn.toLowerCase()}
          </p>
        ) : null}
      </PageHeader>

      <Tabs
        label={t.title}
        active={filtro ?? "todas"}
        tabs={[
          { key: "todas", label: t.filterAll, href: conFiltros({ filtro: undefined }) },
          { key: "mias", label: t.filterMine, href: conFiltros({ filtro: "mias" }) },
          { key: "abiertas", label: t.filterOpen, href: conFiltros({ filtro: "abiertas" }) },
        ]}
      />

      {todas.length === 0 && !hasFilters ? null : (
        <FilterBar action={base} hasFilters={hasFilters} hidden={{ filtro }}>
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
            options={TASK_STATES.map((state) => ({
              value: state,
              label: es.naming.states.task[state],
            }))}
          />
          <FilterSelect
            id="filtro-restaurante"
            name="restaurante"
            label={t.filterRestaurant}
            defaultValue={restaurante}
            options={(establishments ?? []).map((e) => ({ value: e.id, label: e.name }))}
          />
        </FilterBar>
      )}

      <Card>
        {todas.length === 0 && !hasFilters ? (
          <EmptyState title={t.emptyTitle} description={t.emptyReason} />
        ) : rows.length === 0 ? (
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
                <TableHeaderCell>{t.titleColumn}</TableHeaderCell>
                <TableHeaderCell>{t.establishmentColumn}</TableHeaderCell>
                <TableHeaderCell>{t.jobColumn}</TableHeaderCell>
                <TableHeaderCell>{t.assigneeColumn}</TableHeaderCell>
                <TableHeaderCell>{t.weightColumn}</TableHeaderCell>
                <TableHeaderCell>{t.stateColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <span className="font-medium">{task.title}</span>
                  </TableCell>
                  <TableCell>
                    {task.establishment_id
                      ? (establishmentName.get(task.establishment_id) ?? "—")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {task.job_id ? (
                      <Link
                        href={`/espacios/${slug}/trabajos/${task.job_id}`}
                        className="font-medium text-cuotly-green hover:underline"
                      >
                        {jobCode.get(task.job_id) ?? t.openJobLink}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {task.assignee_id ? (
                      <PersonCell name={personName.get(task.assignee_id) ?? "—"} />
                    ) : (
                      <span className="text-text-secondary">{t.unassigned}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {t.weights[task.weight as TaskWeight]} ·{" "}
                    {TASK_LOAD_POINTS[task.weight as TaskWeight]} pts
                    <span className="block text-xs text-text-secondary">
                      {task.estimated_minutes} {t.minutesSuffix}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={taskTone(task.state)}>
                      {es.naming.states.task[task.state as TaskStateKey] ?? task.state}
                    </StatusBadge>
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
