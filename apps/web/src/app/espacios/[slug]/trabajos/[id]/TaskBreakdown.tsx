"use client";

import { useActionState } from "react";

import {
  Button,
  Card,
  EmptyState,
  Field,
  Select,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextArea,
} from "@/components/ui";
import { TASK_LOAD_POINTS, type TaskWeight } from "@/core/load-points";
import { es } from "@/i18n/es";

import { INITIAL_TASK_ACTION } from "./task-action-state";
import { assignTask, cancelTask, createTask, updateTaskState } from "./tasks-actions";

/**
 * HU-21 · el desglose de un trabajo en tareas, dentro del detalle del
 * trabajo, que es donde está quien lo desglosa.
 *
 * Ninguna de estas vistas autoriza nada. Que un botón no se pinte es
 * comodidad, no control: `cancel_task()` le niega la cancelación a un
 * trabajador aunque llame por RPC (RN-JOB-01), y `assign_task()` rechaza a
 * quien no puede recibir la tarea (RN-ASG-01).
 */

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  state: string;
  weight: TaskWeight;
  estimatedMinutes: number;
  assigneeId: string | null;
  assigneeName: string | null;
};

export type TaskCandidate = {
  workerId: string;
  name: string;
  /** RN-ASG-17: nulo para quien no puede ver la carga de sus compañeros. */
  loadPoints: number | null;
};

type TaskStateKey = keyof typeof es.naming.states.task;

function Error({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  ) : null;
}

function taskTone(state: string): "success" | "warning" | "info" | "neutral" | "danger" {
  if (state === "completed") return "success";
  if (state === "blocked") return "warning";
  if (state === "cancelled") return "danger";
  if (state === "in_progress") return "info";
  return "neutral";
}

/** Un botón que solo mueve el estado de la tarea (§11.2). */
function StateButton({
  taskId,
  state,
  label,
  pendingLabel,
  variant,
}: {
  taskId: string;
  state: string;
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
}) {
  const [actionState, action, pending] = useActionState(updateTaskState, INITIAL_TASK_ACTION);
  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="state" value={state} />
      <Button type="submit" variant={variant ?? "secondary"} disabled={pending}>
        {pending ? pendingLabel : label}
      </Button>
      <Error message={actionState.error} />
    </form>
  );
}

function AssignTaskForm({
  taskId,
  candidates,
  current,
}: {
  taskId: string;
  candidates: readonly TaskCandidate[];
  current: string | null;
}) {
  const [state, action, pending] = useActionState(assignTask, INITIAL_TASK_ACTION);

  if (candidates.length === 0) {
    return <p className="text-sm text-text-secondary">{es.teamArea.tasks.assignEmptyReason}</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="taskId" value={taskId} />
      <Select
        label={es.teamArea.tasks.assigneeColumn}
        name="assigneeId"
        required
        defaultValue={current ?? ""}
        options={candidates.map((c) => ({
          value: c.workerId,
          // RN-ASG-17: los puntos solo se enseñan a quien el servidor se
          // los ha devuelto; al resto, el nombre a secas.
          label: c.loadPoints === null ? c.name : `${c.name} · ${c.loadPoints} pts`,
        }))}
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? es.teamArea.tasks.assignPending : es.teamArea.tasks.assignSubmit}
      </Button>
      <Error message={state.error} />
    </form>
  );
}

function CancelTaskForm({ taskId }: { taskId: string }) {
  const [state, action, pending] = useActionState(cancelTask, INITIAL_TASK_ACTION);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="taskId" value={taskId} />
      <Field label={es.teamArea.tasks.cancelReasonLabel} name="reason" />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? es.teamArea.tasks.cancelPending : es.teamArea.tasks.cancelSubmit}
      </Button>
      <Error message={state.error} />
    </form>
  );
}

function AddTaskForm({
  jobId,
  candidates,
}: {
  jobId: string;
  candidates: readonly TaskCandidate[];
}) {
  const [state, action, pending] = useActionState(createTask, INITIAL_TASK_ACTION);
  return (
    <form action={action} className="mt-4 space-y-3 border-t border-border pt-4">
      <input type="hidden" name="jobId" value={jobId} />
      <h3 className="text-sm font-semibold text-primary-dark">{es.teamArea.tasks.addTitle}</h3>
      <Field label={es.teamArea.tasks.addTitleLabel} name="title" required />
      <TextArea label={es.teamArea.tasks.addDescriptionLabel} name="description" />
      <Field
        label={es.teamArea.tasks.addMinutesLabel}
        name="estimatedMinutes"
        type="number"
        min={1}
        // RN-ASG-16: el tope de 4 h no es una preferencia de la pantalla,
        // es que por encima no existe categoría de puntos. El CHECK de la
        // tabla lo rechaza igual si alguien envía el formulario a mano.
        max={240}
        required
        hint={es.teamArea.tasks.addMinutesHint}
      />
      <Select
        label={es.teamArea.tasks.addAssigneeLabel}
        name="assigneeId"
        options={[
          { value: "", label: es.teamArea.tasks.addAssigneeNobody },
          ...candidates.map((c) => ({ value: c.workerId, label: c.name })),
        ]}
      />
      <Error message={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? es.teamArea.tasks.addPending : es.teamArea.tasks.addSubmit}
      </Button>
    </form>
  );
}

/**
 * RN-ASG-14 · "si un trabajo **sí** está desglosado entre varias personas,
 * los puntos generales del trabajo dejan de sumar y cada participante
 * recibe los de sus tareas".
 *
 * El reparto se calcula aquí a partir de las tareas que ya están en la
 * pantalla, con la tabla de §14.4 que vive en `src/core/load-points.ts`.
 * No se le pide al servidor la carga de nadie: eso sería la carga TOTAL de
 * cada persona (todos sus trabajos y tareas), que es una comparación entre
 * trabajadores y RN-ASG-17 la reserva a propietario y administradores.
 * Esto es solo el reparto de ESTE trabajo.
 */
function PointsDistribution({ tasks }: { tasks: readonly TaskRow[] }) {
  // RN-ASG-13: lo cancelado y lo completado deja de sumar.
  const activas = tasks.filter((t) => t.state !== "cancelled" && t.state !== "completed");
  const porPersona = new Map<string, number>();
  let sinRepartir = false;

  for (const task of activas) {
    if (!task.assigneeId) {
      sinRepartir = true;
      continue;
    }
    const nombre = task.assigneeName ?? task.assigneeId;
    porPersona.set(nombre, (porPersona.get(nombre) ?? 0) + TASK_LOAD_POINTS[task.weight]);
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <h3 className="text-sm font-semibold text-primary-dark">{es.teamArea.tasks.pointsTitle}</h3>
      <p className="mt-1 text-sm text-text-secondary">{es.teamArea.tasks.pointsBrokenDown}</p>

      {porPersona.size > 0 ? (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{es.teamArea.tasks.pointsPersonColumn}</TableHeaderCell>
              <TableHeaderCell>{es.teamArea.tasks.pointsColumnLabel}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[...porPersona.entries()].map(([nombre, puntos]) => (
              <TableRow key={nombre}>
                <TableCell>{nombre}</TableCell>
                <TableCell>{puntos}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {sinRepartir ? (
        <p className="mt-2 text-sm text-text-secondary">
          {es.teamArea.tasks.pointsUnassignedWarning}
        </p>
      ) : null}
    </div>
  );
}

export function TaskBreakdown({
  jobId,
  tasks,
  candidates,
  canAdd,
  canCancel,
}: {
  jobId: string;
  tasks: readonly TaskRow[];
  candidates: readonly TaskCandidate[];
  /** Si el servidor va a admitir un alta: el responsable o `assign_jobs`. */
  canAdd: boolean;
  /** RN-JOB-01: solo un administrador cancela una tarea. */
  canCancel: boolean;
}) {
  const vivas = tasks.filter((t) => t.state !== "cancelled");

  return (
    <Card title={es.teamArea.tasks.breakdownTitle}>
      <p className="mb-3 text-sm text-text-secondary">{es.teamArea.tasks.breakdownHint}</p>

      {tasks.length === 0 ? (
        <EmptyState
          title={es.teamArea.tasks.breakdownEmptyTitle}
          description={es.teamArea.tasks.breakdownEmptyReason}
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{es.teamArea.tasks.titleColumn}</TableHeaderCell>
              <TableHeaderCell>{es.teamArea.tasks.weightColumn}</TableHeaderCell>
              <TableHeaderCell>{es.teamArea.tasks.assigneeColumn}</TableHeaderCell>
              <TableHeaderCell>{es.teamArea.tasks.stateColumn}</TableHeaderCell>
              <TableHeaderCell>{es.teamArea.jobs.assignTitle}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell>
                  <span className="font-medium text-text">{task.title}</span>
                  {task.description ? (
                    <span className="block text-sm text-text-secondary">{task.description}</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  {es.teamArea.tasks.weights[task.weight]} · {TASK_LOAD_POINTS[task.weight]} pts
                  <span className="block text-sm text-text-secondary">
                    {task.estimatedMinutes} {es.teamArea.tasks.minutesSuffix}
                  </span>
                </TableCell>
                <TableCell>
                  {task.assigneeName ?? (
                    <span className="text-text-secondary">{es.teamArea.tasks.unassigned}</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge tone={taskTone(task.state)}>
                    {es.naming.states.task[task.state as TaskStateKey] ?? task.state}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  {task.state === "completed" || task.state === "cancelled" ? null : (
                    <div className="flex flex-col gap-2">
                      <AssignTaskForm
                        taskId={task.id}
                        candidates={candidates}
                        current={task.assigneeId}
                      />
                      {task.state === "pending" ? (
                        <StateButton
                          taskId={task.id}
                          state="in_progress"
                          label={es.teamArea.tasks.startSubmit}
                          pendingLabel={es.teamArea.tasks.startPending}
                        />
                      ) : null}
                      {task.state === "in_progress" ? (
                        <>
                          <StateButton
                            taskId={task.id}
                            state="completed"
                            label={es.teamArea.tasks.completeSubmit}
                            pendingLabel={es.teamArea.tasks.completePending}
                            variant="primary"
                          />
                          <StateButton
                            taskId={task.id}
                            state="blocked"
                            label={es.teamArea.tasks.blockSubmit}
                            pendingLabel={es.teamArea.tasks.blockPending}
                          />
                        </>
                      ) : null}
                      {task.state === "blocked" ? (
                        <StateButton
                          taskId={task.id}
                          state="in_progress"
                          label={es.teamArea.tasks.resumeSubmit}
                          pendingLabel={es.teamArea.tasks.resumePending}
                        />
                      ) : null}
                      {canCancel ? (
                        <CancelTaskForm taskId={task.id} />
                      ) : (
                        <p className="text-sm text-text-secondary">
                          {es.teamArea.tasks.cancelOnlyStaff}
                        </p>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {vivas.length > 0 ? <PointsDistribution tasks={vivas} /> : null}

      {canAdd ? <AddTaskForm jobId={jobId} candidates={candidates} /> : null}
    </Card>
  );
}
