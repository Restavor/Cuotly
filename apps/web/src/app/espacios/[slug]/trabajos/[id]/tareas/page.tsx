import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Card,
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { TASK_LOAD_POINTS } from "@/core/load-points";
import { taskPanelActions } from "@/core/task-coordination";
import { fechaCorta } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { loadJobTasks } from "../tasks-load";
import { AddTask } from "./AddTask";
import {
  TaskDetail,
  type DetailCandidate,
  type ResolvedReassignment,
} from "./TaskDetail";

/**
 * Maqueta 07 · "Tareas — asignación y coordinación".
 *
 * La ficha del trabajo (maqueta 06) enseña el desglose para leerlo:
 * "Tareas (2/4)" y quién lleva cada una. Ésta es donde se reparte,
 * se planifica y se resuelven las reasignaciones, que es otra cosa y
 * necesita sitio.
 *
 * **La tarea elegida viaja en la dirección** (`?tarea=<id>`), no en un
 * estado del navegador. Tres motivos, y el tercero es el que manda:
 * "la tarea de los enlaces" es un enlace que se pasa a un compañero, el
 * botón de volver cierra el panel, y la pantalla entera es de servidor,
 * así que funciona sin JavaScript (CA-22).
 *
 * **Aquí no se autoriza nada.** Las tareas las filtra `tasks_select` —el
 * cliente no ve ninguna (P7)— y cada acción la comprueba su función del
 * servidor. Lo que se pregunta con `has_capability` es solo para no pintar
 * un formulario que va a ser rechazado.
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

export default async function JobTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ tarea?: string; restaurante?: string }>;
}) {
  const { slug, id } = await params;
  const { tarea, restaurante } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: job } = await supabase
    .from("jobs")
    .select("id, space_id, code, state, assigned_to, establishment_id, request_id")
    .eq("id", id)
    .maybeSingle();

  if (!job) notFound();

  const [{ data: request }, { data: puedeAsignar }, { data: esDelEquipo }] = await Promise.all([
    supabase.from("requests").select("description").eq("id", job.request_id).maybeSingle(),
    supabase.rpc("has_capability", { p_space_id: job.space_id, p_capability: "assign_jobs" }),
    supabase.rpc("is_space_member", { p_space_id: job.space_id }),
  ]);

  /*
    P7 · esta pantalla es organización interna del equipo. El restaurante
    puede abrir la ficha de SU trabajo por URL —`can_read_job()` se lo
    permite a propósito, ve el estado del suyo—, y entrar aquí le
    devolvería una lista vacía porque `tasks_select` no le da ninguna fila.
    Una lista vacía no es la respuesta correcta: la respuesta es que esta
    pantalla no existe para él.
  */
  if (!esDelEquipo) notFound();

  const { tasks, reassignments } = await loadJobTasks(supabase, id);

  const sufijoRestaurante = restaurante === undefined ? "" : `&restaurante=${restaurante}`;
  const volverHref = `/espacios/${slug}/trabajos/${id}${
    restaurante === undefined ? "" : `?restaurante=${restaurante}`
  }`;

  // La tarea del panel es la de `?tarea=`, y solo si está en esta lista:
  // un uuid ajeno en la dirección no abre nada, porque esa fila no ha
  // llegado hasta aquí.
  const seleccionada = tasks.find((task) => task.id === tarea) ?? null;

  /*
    Los candidatos solo se piden si va a hacer falta un desplegable:
    `list_task_candidates()` exige ser el responsable del trabajo o tener
    `assign_jobs`, y llamarla sin eso devuelve un error que nadie
    necesita ver.
  */
  const puedeRepartir = Boolean(puedeAsignar) || job.assigned_to === user.id;

  const terminado =
    job.state === "published" ||
    job.state === "completed" ||
    job.state === "cancelled_before_start" ||
    job.state === "cancelled_after_start";

  let candidatos: DetailCandidate[] = [];
  if (puedeRepartir && (seleccionada !== null || !terminado)) {
    const { data: filas } = await supabase.rpc("list_task_candidates", { p_job_id: id });
    const ids = (filas ?? []).map((fila) => fila.worker_id);
    const { data: personas } = ids.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] };
    const nombre = new Map(
      (personas ?? []).map((persona) => [persona.id, persona.full_name?.trim() || persona.email]),
    );
    candidatos = (filas ?? []).map((fila) => ({
      workerId: fila.worker_id,
      name: nombre.get(fila.worker_id) ?? fila.worker_id,
      loadPoints: fila.active_load_points,
    }));
  }

  const acciones =
    seleccionada === null
      ? null
      : taskPanelActions(
          {
            viewerId: user.id,
            canAssignJobs: Boolean(puedeAsignar),
            jobAssignedTo: job.assigned_to,
            jobState: job.state,
          },
          seleccionada,
        );

  const solicitudesDeLaTarea = reassignments.filter(
    (solicitud) => solicitud.taskId === seleccionada?.id,
  );
  const abierta = solicitudesDeLaTarea.find((solicitud) => solicitud.state === "pending") ?? null;
  const historial: ResolvedReassignment[] = solicitudesDeLaTarea
    .filter((solicitud) => solicitud.state !== "pending")
    .map((solicitud) => ({
      id: solicitud.id,
      state: solicitud.state,
      reason: solicitud.reason,
      decidedAt: solicitud.decidedAt,
      decidedByName: solicitud.decidedByName,
      decisionReason: solicitud.decisionReason,
    }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <Link
        href={volverHref}
        className="inline-flex items-center gap-2 rounded-[10px] border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-soft-surface hover:text-text focus:outline focus:outline-2 focus:outline-cuotly-green"
      >
        <Icon name="arrowLeft" aria-hidden="true" className="h-[18px] w-[18px]" />
        {es.teamArea.tasks.coordination.backToJob}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card title={es.teamArea.tasks.coordination.title}>
          <p className="mb-3 text-sm text-text-secondary">
            {es.teamArea.tasks.coordination.subtitle(job.code, request?.description ?? "—")}
          </p>

          {/*
            Un trabajo terminado conserva sus tareas como historial de cómo
            se repartió (RN-JOB-13). Se dice, en vez de dejar los
            formularios fuera sin explicación.
          */}
          {terminado && tasks.length > 0 ? (
            <p className="mb-3 rounded-[10px] border border-border bg-soft-surface p-3 text-sm text-text-secondary">
              {es.teamArea.tasks.coordination.readOnlyReason}
            </p>
          ) : null}

          {tasks.length === 0 ? (
            <EmptyState
              title={es.teamArea.tasks.coordination.emptyTitle}
              description={es.teamArea.tasks.coordination.emptyReason}
            />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{es.teamArea.tasks.titleColumn}</TableHeaderCell>
                  <TableHeaderCell>{es.teamArea.tasks.assigneeColumn}</TableHeaderCell>
                  <TableHeaderCell>{es.teamArea.tasks.stateColumn}</TableHeaderCell>
                  <TableHeaderCell>
                    {es.teamArea.tasks.coordination.dateColumn}
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Link
                        href={`/espacios/${slug}/trabajos/${id}/tareas?tarea=${task.id}${sufijoRestaurante}`}
                        aria-current={task.id === seleccionada?.id ? "true" : undefined}
                        className={`font-medium underline-offset-2 hover:underline focus:outline focus:outline-2 focus:outline-cuotly-green ${
                          task.id === seleccionada?.id ? "text-cuotly-green" : "text-text"
                        }`}
                      >
                        {task.title}
                      </Link>
                      <span className="block text-sm text-text-secondary">
                        {es.teamArea.tasks.weights[task.weight]} ·{" "}
                        {TASK_LOAD_POINTS[task.weight]} pts
                      </span>
                    </TableCell>
                    <TableCell>
                      {task.assigneeName ?? (
                        <span className="text-text-secondary">{es.teamArea.tasks.unassigned}</span>
                      )}
                      {/*
                        RN-ASG-07 · que hay una reasignación esperando se ve
                        en la lista, no solo al abrir la tarea: quien tiene
                        que resolverla llega a esta pantalla sin saber
                        cuál es.
                      */}
                      {task.hasPendingReassignment ? (
                        <span className="mt-1 block">
                          <StatusBadge tone="warning">
                            {es.teamArea.tasks.coordination.reassignPendingTitle}
                          </StatusBadge>
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={taskTone(task.state)}>
                        {es.naming.states.task[task.state as TaskStateKey] ?? task.state}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      {task.plannedDate === null ? (
                        <span className="text-text-secondary">
                          {es.teamArea.tasks.coordination.plannedDateEmpty}
                        </span>
                      ) : (
                        fechaCorta(task.plannedDate)
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {seleccionada === null || acciones === null ? (
          <section
            aria-label={es.teamArea.tasks.coordination.detailTitle}
            className="rounded-xl border border-border bg-surface p-5"
          >
            <EmptyState
              title={es.teamArea.tasks.coordination.detailEmptyTitle}
              description={es.teamArea.tasks.coordination.detailEmptyReason}
            />
          </section>
        ) : (
          <TaskDetail
            task={seleccionada}
            actions={acciones}
            candidates={candidatos}
            pending={
              abierta === null
                ? null
                : {
                    reason: abierta.reason,
                    requestedAt: abierta.requestedAt,
                    requestedByName: abierta.requestedByName,
                  }
            }
            history={historial}
            closeHref={`/espacios/${slug}/trabajos/${id}/tareas${
              restaurante === undefined ? "" : `?restaurante=${restaurante}`
            }`}
          />
        )}
      </div>

      {/*
        HU-21 · el alta. Solo mientras el trabajo sigue vivo, que es lo que
        admite `create_job_task()`: añadirle una tarea a algo publicado
        sería reescribir cómo se hizo.
      */}
      {puedeRepartir && !terminado ? <AddTask jobId={id} candidates={candidatos} /> : null}
    </div>
  );
}
