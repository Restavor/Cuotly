"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { TaskActionState } from "./task-action-state";

/**
 * HU-21 · desglosar un trabajo en tareas y repartirlas.
 *
 * Ninguna de estas acciones autoriza nada: cada una llama a la función del
 * servidor que hace cumplir su regla, y si el estado o el permiso no la
 * admiten se enseña el error que devuelve (CLAUDE.md MUST). En concreto,
 * `cancelTask` la puede invocar cualquiera desde aquí y `cancel_task()`
 * se la niega a un trabajador (RN-JOB-01) — la pantalla no enseña el
 * botón, pero lo que lo impide de verdad es el servidor.
 */
async function run(
  fn: (
    supabase: Awaited<ReturnType<typeof createClient>>,
  ) => PromiseLike<{ error: { message: string } | null }>,
): Promise<TaskActionState> {
  const supabase = await createClient();
  const { error } = await fn(supabase);
  if (error) return { error: error.message, done: false };
  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}

/**
 * Alta de una tarea del trabajo. El peso (§14.4) no lo manda el
 * formulario: lo deduce `create_job_task()` de la duración con
 * `task_weight_for_minutes()`, que es la misma regla que
 * `src/core/load-points.ts`. Si pasa de 4 h, RN-ASG-16 dice que la tarea
 * debe dividirse y la función lanza — no se inventa una categoría nueva.
 */
export async function createTask(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const assigneeId = String(formData.get("assigneeId") ?? "");
  const minutes = Number(formData.get("estimatedMinutes"));

  // El servidor vuelve a validar las tres cosas; esto solo evita un viaje
  // para decir lo que ya se sabe aquí.
  if (!title) return { error: "Escribe qué hay que hacer.", done: false };
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { error: "La duración estimada tiene que ser un número de minutos mayor que cero.", done: false };
  }

  return run((s) =>
    s.rpc("create_job_task", {
      p_job_id: jobId,
      p_title: title,
      p_estimated_minutes: Math.trunc(minutes),
      p_assignee_id: assigneeId || undefined,
      p_description: description || undefined,
    }),
  );
}

/** HU-21 · "y repartirlas". La segunda mitad, para una tarea ya creada. */
export async function assignTask(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const taskId = String(formData.get("taskId") ?? "");
  const assigneeId = String(formData.get("assigneeId") ?? "");
  return run((s) => s.rpc("assign_task", { p_task_id: taskId, p_assignee_id: assigneeId }));
}

/**
 * §11.2 · el avance de la tarea. Las transiciones válidas las hace cumplir
 * `update_task_state()`, que reproduce `TASK_TRANSITIONS` de
 * `src/core/job-states.ts`. `cancelled` no pasa por aquí: la propia
 * función lo rechaza y remite a `cancel_task()` (RN-JOB-01).
 */
export async function updateTaskState(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const taskId = String(formData.get("taskId") ?? "");
  const state = String(formData.get("state") ?? "");
  return run((s) => s.rpc("update_task_state", { p_task_id: taskId, p_state: state }));
}

/** RN-JOB-01 · cancelar es cosa de un administrador, y lo comprueba el servidor. */
export async function cancelTask(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const taskId = String(formData.get("taskId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  return run((s) => s.rpc("cancel_task", { p_task_id: taskId, p_reason: reason || undefined }));
}

/**
 * Maqueta 07 · "Fecha estimada". Planificación, no plazo: la casilla vacía
 * QUITA la fecha, que es una respuesta legítima ("ya no sé cuándo") y
 * mejor que dejar una que nadie sostiene.
 *
 * Por eso la cadena vacía viaja como `undefined` y no como `""`: el
 * parámetro tiene `default null` en el servidor y es así como se le dice
 * "ninguna".
 */
export async function setTaskPlannedDate(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const taskId = String(formData.get("taskId") ?? "");
  const plannedDate = String(formData.get("plannedDate") ?? "").trim();

  return run((s) =>
    s.rpc("set_task_planned_date", {
      p_task_id: taskId,
      p_planned_date: plannedDate || undefined,
    }),
  );
}

/**
 * RN-ASG-07 · la pide el responsable de la tarea explicando el motivo. El
 * motivo lo exige también el servidor (y un CHECK de la tabla): esto solo
 * evita un viaje para decir lo que ya se sabe aquí.
 */
export async function requestTaskReassignment(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const taskId = String(formData.get("taskId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!reason) {
    return { error: "Explica por qué pides la reasignación.", done: false };
  }

  return run((s) => s.rpc("request_task_reassignment", { p_task_id: taskId, p_reason: reason }));
}

/**
 * RN-ASG-08 · la aprueba el propietario o un administrador, y RN-ASG-09
 * dice que no se reinicia ningún contador — de eso se encarga la función,
 * que no escribe ni un `timer_event`.
 */
export async function approveTaskReassignment(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const taskId = String(formData.get("taskId") ?? "");
  const assigneeId = String(formData.get("assigneeId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  return run((s) =>
    s.rpc("approve_task_reassignment", {
      p_task_id: taskId,
      p_new_assignee_id: assigneeId,
      p_reason: reason || undefined,
    }),
  );
}

/** Rechazarla no la borra: la fila se queda con su motivo (CLAUDE.md MUST NOT). */
export async function rejectTaskReassignment(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const taskId = String(formData.get("taskId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  return run((s) =>
    s.rpc("reject_task_reassignment", { p_task_id: taskId, p_reason: reason || undefined }),
  );
}
