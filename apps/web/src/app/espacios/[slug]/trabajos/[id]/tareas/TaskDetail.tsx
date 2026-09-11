"use client";

import { useActionState } from "react";

import { Button, Field, Select, StatusBadge, TextArea } from "@/components/ui";
import { TASK_LOAD_POINTS, type TaskWeight } from "@/core/load-points";
import type { TaskPanelActions } from "@/core/task-coordination";
import { es } from "@/i18n/es";

import { INITIAL_TASK_ACTION } from "../task-action-state";
import {
  approveTaskReassignment,
  assignTask,
  cancelTask,
  rejectTaskReassignment,
  requestTaskReassignment,
  setTaskPlannedDate,
  updateTaskState,
} from "../tasks-actions";

/**
 * Maqueta 07 · el panel "Detalle de la tarea".
 *
 * Qué se ofrece lo decide `taskPanelActions()` en `src/core/`, con sus
 * tests, y no un `if` repartido por la plantilla: las cuatro acciones
 * dependen de cinco cosas a la vez (quién mira, si administra, si es el
 * responsable del trabajo, el estado de la tarea y si hay una reasignación
 * abierta) y ese cruce es donde se cuela el botón que no debía estar.
 *
 * **Nada de esto autoriza.** `approve_task_reassignment()` le niega la
 * aprobación a un trabajador aunque llame por RPC (RN-ASG-08), y
 * `assign_task()` rechaza el reparto de una tarea con reasignación
 * pendiente. Aquí solo se decide qué se pinta.
 *
 * Los tres formularios son de servidor: sin JavaScript siguen funcionando
 * (CA-22).
 */

export type DetailTask = {
  id: string;
  title: string;
  description: string | null;
  state: string;
  weight: TaskWeight;
  estimatedMinutes: number;
  plannedDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
};

export type DetailCandidate = {
  workerId: string;
  name: string;
  /** RN-ASG-17: nulo para quien no puede ver la carga de sus compañeros. */
  loadPoints: number | null;
};

export type PendingReassignment = {
  reason: string;
  requestedAt: string;
  requestedByName: string | null;
};

export type ResolvedReassignment = {
  id: string;
  state: string;
  reason: string;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionReason: string | null;
};

type TaskStateKey = keyof typeof es.naming.states.task;

function taskTone(state: string): "success" | "warning" | "info" | "neutral" | "danger" {
  if (state === "completed") return "success";
  if (state === "blocked") return "warning";
  if (state === "cancelled") return "danger";
  if (state === "in_progress") return "info";
  return "neutral";
}

function fechaYHora(value: string): string {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function Error({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  ) : null;
}

/** §11.2 · un botón que solo mueve el estado de la tarea. */
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

/** RN-JOB-01 · cancelar es cosa de un administrador, y lo comprueba el servidor. */
function CancelForm({ taskId }: { taskId: string }) {
  const [state, action, pending] = useActionState(cancelTask, INITIAL_TASK_ACTION);
  return (
    <form action={action} className="border-t border-border pt-4">
      <Field label={es.teamArea.tasks.cancelReasonLabel} name="reason" />
      <input type="hidden" name="taskId" value={taskId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? es.teamArea.tasks.cancelPending : es.teamArea.tasks.cancelSubmit}
      </Button>
      <Error message={state.error} />
    </form>
  );
}

/** Maqueta 07 · "Responsable", con el reparto de puntos de cada candidato. */
function AssignForm({
  taskId,
  candidates,
  current,
}: {
  taskId: string;
  candidates: readonly DetailCandidate[];
  current: string | null;
}) {
  const [state, action, pending] = useActionState(assignTask, INITIAL_TASK_ACTION);

  if (candidates.length === 0) {
    return <p className="text-sm text-text-secondary">{es.teamArea.tasks.assignEmptyReason}</p>;
  }

  return (
    <form action={action}>
      <input type="hidden" name="taskId" value={taskId} />
      <Select
        label={es.teamArea.tasks.assigneeColumn}
        name="assigneeId"
        required
        defaultValue={current ?? ""}
        options={candidates.map((candidate) => ({
          value: candidate.workerId,
          // RN-ASG-17: los puntos solo se enseñan a quien el servidor se
          // los ha devuelto; al resto, el nombre a secas.
          label:
            candidate.loadPoints === null
              ? candidate.name
              : `${candidate.name} · ${candidate.loadPoints} pts`,
        }))}
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? es.teamArea.tasks.assignPending : es.teamArea.tasks.assignSubmit}
      </Button>
      <Error message={state.error} />
    </form>
  );
}

/**
 * Maqueta 07 · "Fecha estimada". Con su explicación debajo, que no es
 * adorno: una fecha en una pantalla de operación se lee como un plazo, y
 * ésta no lo es.
 */
function PlannedDateForm({ taskId, current }: { taskId: string; current: string | null }) {
  const [state, action, pending] = useActionState(setTaskPlannedDate, INITIAL_TASK_ACTION);

  return (
    <form action={action}>
      <input type="hidden" name="taskId" value={taskId} />
      <Field
        label={es.teamArea.tasks.coordination.plannedDateLabel}
        name="plannedDate"
        type="date"
        defaultValue={current ?? ""}
        hint={es.teamArea.tasks.coordination.plannedDateHint}
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending
          ? es.teamArea.tasks.coordination.plannedDatePending
          : es.teamArea.tasks.coordination.plannedDateSubmit}
      </Button>
      <Error message={state.error} />
    </form>
  );
}

/** RN-ASG-07 · pedirla, explicando el motivo. */
function RequestForm({ taskId }: { taskId: string }) {
  const [state, action, pending] = useActionState(requestTaskReassignment, INITIAL_TASK_ACTION);

  return (
    <form action={action}>
      <TextArea
        label={es.teamArea.tasks.coordination.reassignReasonLabel}
        name="reason"
        required
        rows={3}
        placeholder={es.teamArea.tasks.coordination.reassignReasonPlaceholder}
      />
      <input type="hidden" name="taskId" value={taskId} />
      <Button type="submit" disabled={pending}>
        {pending
          ? es.teamArea.tasks.coordination.reassignPending
          : es.teamArea.tasks.coordination.reassignSubmit}
      </Button>
      <Error message={state.error} />
    </form>
  );
}

/** RN-ASG-08 · resolverla: a quién se le pasa, o por qué no se pasa. */
function DecideForm({
  taskId,
  candidates,
  currentAssigneeId,
}: {
  taskId: string;
  candidates: readonly DetailCandidate[];
  currentAssigneeId: string | null;
}) {
  const [approveState, approveAction, approving] = useActionState(
    approveTaskReassignment,
    INITIAL_TASK_ACTION,
  );
  const [rejectState, rejectAction, rejecting] = useActionState(
    rejectTaskReassignment,
    INITIAL_TASK_ACTION,
  );

  /*
    Aprobar tiene que CAMBIAR de responsable: el servidor rechaza una
    aprobación que deja a la misma persona y remite a rechazarla, con su
    motivo. Así que quien la pidió no está en la lista — ofrecerlo sería
    ofrecer un error.
  */
  const destinos = candidates.filter((candidate) => candidate.workerId !== currentAssigneeId);

  return (
    <div className="space-y-4">
      {destinos.length === 0 ? (
        <p className="text-sm text-text-secondary">{es.teamArea.tasks.assignEmptyReason}</p>
      ) : (
        <form action={approveAction}>
          <input type="hidden" name="taskId" value={taskId} />
          <Select
            label={es.teamArea.tasks.coordination.reassignApproveLabel}
            name="assigneeId"
            required
            options={destinos.map((candidate) => ({
              value: candidate.workerId,
              label:
                candidate.loadPoints === null
                  ? candidate.name
                  : `${candidate.name} · ${candidate.loadPoints} pts`,
            }))}
          />
          <Field
            label={es.teamArea.tasks.coordination.reassignDecisionReasonLabel}
            name="reason"
          />
          <Button type="submit" disabled={approving}>
            {approving
              ? es.teamArea.tasks.coordination.reassignApprovePending
              : es.teamArea.tasks.coordination.reassignApproveSubmit}
          </Button>
          <Error message={approveState.error} />
        </form>
      )}

      <form action={rejectAction} className="border-t border-border pt-4">
        <input type="hidden" name="taskId" value={taskId} />
        <Field label={es.teamArea.tasks.coordination.reassignDecisionReasonLabel} name="reason" />
        <Button type="submit" variant="secondary" disabled={rejecting}>
          {rejecting
            ? es.teamArea.tasks.coordination.reassignRejectPending
            : es.teamArea.tasks.coordination.reassignRejectSubmit}
        </Button>
        <Error message={rejectState.error} />
      </form>
    </div>
  );
}

export function TaskDetail({
  task,
  actions,
  candidates,
  pending,
  history,
  closeHref,
}: {
  task: DetailTask;
  actions: TaskPanelActions;
  candidates: readonly DetailCandidate[];
  /** La solicitud abierta, si la hay (RN-ASG-07). */
  pending: PendingReassignment | null;
  /** Las ya resueltas: no se borran, se conservan (CLAUDE.md MUST NOT). */
  history: readonly ResolvedReassignment[];
  closeHref: string;
}) {
  const nadaQueHacer =
    !actions.canAssign &&
    !actions.canPlan &&
    !actions.canRequestReassignment &&
    !actions.canDecideReassignment &&
    !actions.canAdvanceState &&
    !actions.canCancel;

  return (
    <section
      aria-label={es.teamArea.tasks.coordination.detailTitle}
      className="rounded-xl border border-border bg-surface p-5"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-secondary">
            {es.teamArea.tasks.coordination.detailTitle}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-primary-dark">{task.title}</h2>
        </div>
        <StatusBadge tone={taskTone(task.state)}>
          {es.naming.states.task[task.state as TaskStateKey] ?? task.state}
        </StatusBadge>
      </div>

      <h3 className="text-sm font-semibold text-text">
        {es.teamArea.tasks.coordination.descriptionTitle}
      </h3>
      <p className="mb-4 mt-1 text-sm text-text-secondary">
        {/* CA-20: si no la tiene se dice, no se deja el hueco. */}
        {task.description ?? es.teamArea.tasks.coordination.descriptionEmpty}
      </p>

      <dl className="mb-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-text-secondary">{es.teamArea.tasks.assigneeColumn}</dt>
          <dd className="text-right font-medium text-text">
            {task.assigneeName ?? es.teamArea.tasks.unassigned}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-secondary">{es.teamArea.tasks.weightColumn}</dt>
          <dd className="text-right font-medium text-text">
            {es.teamArea.tasks.weights[task.weight]} · {TASK_LOAD_POINTS[task.weight]} pts ·{" "}
            {task.estimatedMinutes} {es.teamArea.tasks.minutesSuffix}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-secondary">
            {es.teamArea.tasks.coordination.plannedDateLabel}
          </dt>
          <dd className="text-right font-medium text-text">
            {task.plannedDate ?? (
              <span className="text-text-secondary">
                {es.teamArea.tasks.coordination.plannedDateEmpty}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {/*
        §11.2 · el avance de la tarea. Las transiciones válidas las hace
        cumplir `update_task_state()`, que reproduce `TASK_TRANSITIONS` de
        `src/core/job-states.ts`; aquí solo se ofrece la que toca.
      */}
      {actions.canAdvanceState ? (
        <div className="mb-4 flex flex-wrap gap-2">
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
        </div>
      ) : null}

      {actions.canPlan ? <PlannedDateForm taskId={task.id} current={task.plannedDate} /> : null}

      {actions.canAssign ? (
        <AssignForm taskId={task.id} candidates={candidates} current={task.assigneeId} />
      ) : null}

      {/*
        RN-ASG-08 · por qué no hay desplegable de responsable. Sin decirlo,
        el panel parece que ha perdido una opción.
      */}
      {pending !== null && !actions.canAssign && actions.canPlan ? (
        <p className="mb-4 text-sm text-text-secondary">
          {es.teamArea.tasks.coordination.reassignBlocksAssign}
        </p>
      ) : null}

      {pending !== null ? (
        <div className="mb-4 rounded-[10px] border border-border bg-soft-surface p-4">
          <p className="text-sm font-semibold text-text">
            {es.teamArea.tasks.coordination.reassignPendingTitle}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {es.teamArea.tasks.coordination.reassignPendingBy(
              pending.requestedByName ?? "—",
              fechaYHora(pending.requestedAt),
            )}
          </p>
          <p className="mt-2 text-sm text-text">{pending.reason}</p>
        </div>
      ) : null}

      {actions.canRequestReassignment ? (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-text">
            {es.teamArea.tasks.coordination.reassignRequest}
          </h3>
          <RequestForm taskId={task.id} />
        </div>
      ) : null}

      {actions.canDecideReassignment ? (
        <DecideForm
          taskId={task.id}
          candidates={candidates}
          currentAssigneeId={task.assigneeId}
        />
      ) : null}

      {/*
        RN-ASG-08 · a quien la ha pedido y no puede resolverla se le dice
        qué falta, en vez de dejarle el panel sin nada.
      */}
      {pending !== null && !actions.canDecideReassignment && !actions.canAssign ? (
        <p className="text-sm text-text-secondary">
          {es.teamArea.tasks.coordination.reassignWaitingDecision}
        </p>
      ) : null}

      {history.length > 0 ? (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-text">
            {es.teamArea.tasks.coordination.reassignHistoryTitle}
          </h3>
          <ul className="mt-2 space-y-3">
            {history.map((resolved) => (
              <li key={resolved.id} className="text-sm">
                <StatusBadge tone={resolved.state === "approved" ? "success" : "neutral"}>
                  {resolved.state === "approved"
                    ? es.teamArea.tasks.coordination.reassignApprovedBadge
                    : es.teamArea.tasks.coordination.reassignRejectedBadge}
                </StatusBadge>
                <p className="mt-1 text-text">{resolved.reason}</p>
                {resolved.decidedAt !== null ? (
                  <p className="text-text-secondary">
                    {es.teamArea.tasks.coordination.reassignHistoryLine(
                      fechaYHora(resolved.decidedAt),
                      resolved.decidedByName ?? "—",
                    )}
                  </p>
                ) : null}
                {resolved.decisionReason ? (
                  <p className="text-text-secondary">{resolved.decisionReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/*
        RN-JOB-01 · al trabajador se le dice que tiene que pedirlo, en vez
        de enseñarle un botón que el servidor le va a negar.
      */}
      {actions.canCancel ? (
        <CancelForm taskId={task.id} />
      ) : actions.canAdvanceState ? (
        <p className="mt-4 border-t border-border pt-4 text-sm text-text-secondary">
          {es.teamArea.tasks.cancelOnlyStaff}
        </p>
      ) : null}

      {nadaQueHacer && pending === null ? (
        <p className="text-sm text-text-secondary">{es.teamArea.tasks.coordination.noActions}</p>
      ) : null}

      <a
        href={closeHref}
        className="mt-4 inline-block text-sm font-medium text-text-secondary underline underline-offset-2 hover:text-text"
      >
        {es.teamArea.tasks.coordination.closeDetail}
      </a>
    </section>
  );
}
