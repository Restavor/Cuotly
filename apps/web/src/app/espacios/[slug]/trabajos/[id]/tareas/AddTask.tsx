"use client";

import { useActionState } from "react";

import { Button, Card, Field, Select, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_TASK_ACTION } from "../task-action-state";
import { createTask } from "../tasks-actions";
import type { DetailCandidate } from "./TaskDetail";

/**
 * HU-21 · el alta de una tarea del trabajo.
 *
 * Vive en esta pantalla y no en la ficha del trabajo porque es aquí donde
 * se reparte: desglosar y repartir son el mismo gesto, y tenerlos en dos
 * sitios distintos obligaba a ir y volver.
 *
 * El peso (§14.4) no lo manda el formulario: lo deduce `create_job_task()`
 * de la duración con `task_weight_for_minutes()`, que es la misma regla que
 * `src/core/load-points.ts`. Si pasa de 4 h, RN-ASG-16 dice que la tarea
 * debe dividirse y la función lanza — no se inventa una categoría nueva.
 */
export function AddTask({
  jobId,
  candidates,
}: {
  jobId: string;
  candidates: readonly DetailCandidate[];
}) {
  const [state, action, pending] = useActionState(createTask, INITIAL_TASK_ACTION);

  return (
    <Card title={es.teamArea.tasks.addTitle}>
      <form action={action}>
        <input type="hidden" name="jobId" value={jobId} />
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
            ...candidates.map((candidate) => ({
              value: candidate.workerId,
              label: candidate.name,
            })),
          ]}
        />
        {state.error ? (
          <p role="alert" className="mb-2 text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? es.teamArea.tasks.addPending : es.teamArea.tasks.addSubmit}
        </Button>
      </form>
    </Card>
  );
}
