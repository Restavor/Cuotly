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
import { TASK_LOAD_POINTS, loadLevel, type TaskWeight } from "@/core/load-points";
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

export default async function TeamTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { slug } = await params;
  const { filtro } = await searchParams;
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
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{es.teamArea.tasks.title}</h1>
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

  // Los tres filtros son de presentación y se aplican sobre lo que RLS ya
  // dejó pasar: ninguno amplía lo que se ve.
  const rows =
    filtro === "mias"
      ? todas.filter((t) => t.assignee_id === user.id)
      : filtro === "abiertas"
        ? todas.filter((t) => t.state !== "completed" && t.state !== "cancelled")
        : todas;

  const jobIds = [...new Set(todas.map((t) => t.job_id).filter(Boolean))] as string[];
  const [{ data: jobs }, { data: establishments }, { data: people }] = await Promise.all([
    jobIds.length
      ? supabase.from("jobs").select("id, code").in("id", jobIds)
      : Promise.resolve({ data: [] as { id: string; code: string }[] }),
    supabase.from("establishments").select("id, name").eq("space_id", space.id),
    supabase.from("profiles").select("id, full_name, email"),
  ]);

  const jobCode = new Map((jobs ?? []).map((j) => [j.id, j.code]));
  const establishmentName = new Map((establishments ?? []).map((e) => [e.id, e.name]));
  const personName = new Map((people ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]));

  // RN-ASG-13 · la carga que suman MIS tareas activas. Es mi propia carga,
  // no una comparación con nadie: RN-ASG-17 prohíbe el ranking entre
  // trabajadores, y por eso no se pinta la de los demás.
  const misPuntos = todas
    .filter(
      (t) => t.assignee_id === user.id && t.state !== "completed" && t.state !== "cancelled",
    )
    .reduce((total, t) => total + TASK_LOAD_POINTS[t.weight as TaskWeight], 0);

  const filtros = [
    { key: undefined, label: es.teamArea.tasks.filterAll },
    { key: "abiertas", label: es.teamArea.tasks.filterOpen },
    { key: "mias", label: es.teamArea.tasks.filterMine },
  ] as const;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-1 text-2xl font-bold text-primary-dark">{es.teamArea.tasks.title}</h1>
      <p className="mb-4 text-sm text-text-secondary">{es.teamArea.tasks.subtitle}</p>

      <nav className="mb-6 flex flex-wrap gap-2" aria-label={es.teamArea.tasks.title}>
        {filtros.map((f) => {
          const activo = filtro === f.key || (f.key === undefined && !filtro);
          return (
            <Link
              key={f.label}
              href={f.key ? `/espacios/${slug}/tareas?filtro=${f.key}` : `/espacios/${slug}/tareas`}
              aria-current={activo ? "page" : undefined}
              className={
                activo
                  ? "rounded-[10px] border border-cuotly-green bg-soft-surface px-3 py-1.5 text-sm font-semibold text-primary-dark"
                  : "rounded-[10px] border border-border px-3 py-1.5 text-sm text-text-secondary"
              }
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {misPuntos > 0 ? (
        <p className="mb-4 text-sm text-text-secondary">
          {es.space.jobs.loadLevels[loadLevel(misPuntos)]} · {misPuntos}{" "}
          {es.teamArea.tasks.pointsColumn.toLowerCase()}
        </p>
      ) : null}

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={es.teamArea.tasks.emptyTitle}
            description={es.teamArea.tasks.emptyReason}
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.teamArea.tasks.titleColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.tasks.jobColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.tasks.establishmentColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.tasks.assigneeColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.tasks.weightColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.tasks.stateColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>{task.title}</TableCell>
                  <TableCell>
                    {task.job_id ? (
                      <Link
                        href={`/espacios/${slug}/trabajos/${task.job_id}`}
                        className="text-cuotly-green underline"
                      >
                        {jobCode.get(task.job_id) ?? es.teamArea.tasks.openJobLink}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {task.establishment_id
                      ? (establishmentName.get(task.establishment_id) ?? "—")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {task.assignee_id ? (
                      (personName.get(task.assignee_id) ?? "—")
                    ) : (
                      <span className="text-text-secondary">{es.teamArea.tasks.unassigned}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {es.teamArea.tasks.weights[task.weight as TaskWeight]} ·{" "}
                    {TASK_LOAD_POINTS[task.weight as TaskWeight]} pts
                    <span className="block text-sm text-text-secondary">
                      {task.estimated_minutes} {es.teamArea.tasks.minutesSuffix}
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
