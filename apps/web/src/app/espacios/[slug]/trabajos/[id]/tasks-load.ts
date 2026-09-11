import type { SupabaseClient } from "@supabase/supabase-js";

import { orderJobTasks } from "@/core/task-coordination";
import type { TaskWeight } from "@/core/load-points";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Las tareas de un trabajo: **una sola definición**, de la que leen las
 * dos pantallas que las enseñan.
 *
 * Es el mismo motivo por el que `loadTeamJobs()` acabó siendo el único
 * sitio donde se decide qué trabajos hay y en qué orden. Aquí hay dos
 * consumidores —el recuento "Tareas (2/4)" de la ficha del trabajo
 * (maqueta 06) y la pantalla de coordinación (maqueta 07)— y dos consultas
 * separadas acabarían discrepando: primero en el orden, después en qué
 * columnas se piden, y un día en qué cuenta como tarea viva.
 *
 * **Aquí no se autoriza nada.** Las filas las filtra `tasks_select`: un
 * trabajador ve las de sus trabajos autorizados y las suyas, y el cliente
 * no ve ninguna (P7 · las tareas son organización interna del equipo).
 */
export interface JobTaskRow {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly state: string;
  readonly weight: TaskWeight;
  readonly estimatedMinutes: number;
  readonly plannedDate: string | null;
  readonly createdAt: string;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  /** RN-ASG-07: hay una solicitud de reasignación sin resolver. */
  readonly hasPendingReassignment: boolean;
}

export interface TaskReassignmentRow {
  readonly id: string;
  readonly taskId: string;
  readonly state: string;
  readonly reason: string;
  readonly requestedAt: string;
  readonly requestedById: string;
  readonly requestedByName: string | null;
  readonly decidedAt: string | null;
  readonly decidedByName: string | null;
  readonly decisionReason: string | null;
}

export interface JobTasks {
  readonly tasks: readonly JobTaskRow[];
  readonly reassignments: readonly TaskReassignmentRow[];
}

export async function loadJobTasks(
  supabase: SupabaseClient<Database>,
  jobId: string,
): Promise<JobTasks> {
  const { data: taskRows } = await supabase
    .from("tasks")
    .select(
      "id, title, description, state, weight, estimated_minutes, planned_date, created_at, assignee_id",
    )
    .eq("job_id", jobId);

  const tasks = taskRows ?? [];
  const taskIds = tasks.map((task) => task.id);

  /*
    Las solicitudes de reasignación de estas tareas. Las filtra
    `task_reassignment_requests_select`, que exige ser del espacio Y poder
    leer la tarea: `can_read_task()` sola incluiría al restaurante a través
    de `can_read_job()`, que fue el bloqueante B2 de la cuarta revisión.
  */
  const { data: requestRows } = taskIds.length
    ? await supabase
        .from("task_reassignment_requests")
        .select("id, task_id, state, reason, requested_at, requested_by, decided_at, decided_by, decision_reason")
        .in("task_id", taskIds)
        .order("requested_at", { ascending: false })
    : { data: [] };

  const requests = requestRows ?? [];

  /*
    Los nombres del equipo salen de `profiles`, en una sola consulta para
    los tres papeles (responsable, quien pide, quien decide). Es
    información interna y nunca llega al cliente: estas filas ya se las ha
    negado RLS antes de llegar aquí.
  */
  const personIds = [
    ...new Set(
      [
        ...tasks.map((task) => task.assignee_id),
        ...requests.map((request) => request.requested_by),
        ...requests.map((request) => request.decided_by),
      ].filter((id): id is string => id !== null),
    ),
  ];

  const { data: people } = personIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", personIds)
    : { data: [] };

  const nameById = new Map(
    (people ?? []).map((person) => [person.id, person.full_name?.trim() || person.email]),
  );

  const pendingByTask = new Set(
    requests.filter((request) => request.state === "pending").map((request) => request.task_id),
  );

  return {
    // El orden lo decide `orderJobTasks()` en `src/core/`, con sus tests, y
    // no un `.order()` de la consulta: la regla —lo cancelado al final, lo
    // sin fecha después de lo fechado— no se puede escribir en PostgREST
    // sin repetirla, y repetida es como se desincronizan las dos pantallas.
    tasks: orderJobTasks(
      tasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        state: task.state,
        weight: task.weight as TaskWeight,
        estimatedMinutes: task.estimated_minutes,
        plannedDate: task.planned_date,
        createdAt: task.created_at,
        assigneeId: task.assignee_id,
        assigneeName: task.assignee_id ? (nameById.get(task.assignee_id) ?? null) : null,
        hasPendingReassignment: pendingByTask.has(task.id),
      })),
    ),
    reassignments: requests.map((request) => ({
      id: request.id,
      taskId: request.task_id,
      state: request.state,
      reason: request.reason,
      requestedAt: request.requested_at,
      requestedById: request.requested_by,
      requestedByName: nameById.get(request.requested_by) ?? null,
      decidedAt: request.decided_at,
      decidedByName: request.decided_by ? (nameById.get(request.decided_by) ?? null) : null,
      decisionReason: request.decision_reason,
    })),
  };
}
