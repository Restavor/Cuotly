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
