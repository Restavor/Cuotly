import Link from "next/link";

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
import { TASK_LOAD_POINTS } from "@/core/load-points";
import { taskProgress } from "@/core/job-execution";
import { es } from "@/i18n/es";

import type { JobTaskRow } from "./tasks-load";

/**
 * Maqueta 06 · "Tareas (2/4)" dentro de la ficha del trabajo: el desglose
 * **para leerlo**.
 *
 * Hasta la maqueta 07 esta tarjeta llevaba dentro todos los formularios
 * —repartir, mover, cancelar, dar de alta—, apretados en una columna de
 * tabla. Ahora eso vive en la pantalla de coordinación, que es donde el
 * dibujo definitivo lo pone y donde cabe: el panel de detalle de una tarea
 * no entra en una celda.
 *
 * Lo que queda aquí es lo que la maqueta 06 enseña, y ni una cosa más: qué
 * tareas hay, quién lleva cada una, cómo va y para cuándo. Con **un solo
 * enlace** a la pantalla que las reparte, para que no haya dos sitios
 * donde se hace lo mismo.
 *
 * Las filas y su orden salen de `loadJobTasks()`, el mismo sitio del que
 * los lee la pantalla de coordinación. Dos consultas separadas acabarían
 * discrepando.
 */
type TaskStateKey = keyof typeof es.naming.states.task;

function taskTone(state: string): "success" | "warning" | "info" | "neutral" | "danger" {
  if (state === "completed") return "success";
  if (state === "blocked") return "warning";
  if (state === "cancelled") return "danger";
  if (state === "in_progress") return "info";
  return "neutral";
}

function fechaCorta(value: string): string {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(
    new Date(`${value}T00:00:00`),
  );
}

/**
 * RN-ASG-14 · "si un trabajo **sí** está desglosado entre varias personas,
 * los puntos generales del trabajo dejan de sumar y cada participante
 * recibe los de sus tareas".
 *
 * El reparto se calcula a partir de las tareas que ya están en la pantalla,
 * con la tabla de §14.4 que vive en `src/core/load-points.ts`. No se le
 * pide al servidor la carga de nadie: eso sería la carga TOTAL de cada
 * persona, que es una comparación entre trabajadores y RN-ASG-17 la
 * reserva a propietario y administradores. Esto es solo el reparto de ESTE
 * trabajo.
 */
function PointsDistribution({ tasks }: { tasks: readonly JobTaskRow[] }) {
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
  tasks,
  coordinationHref,
  /** Si el servidor va a admitir cambios: el responsable o `assign_jobs`. */
  canCoordinate,
}: {
  tasks: readonly JobTaskRow[];
  coordinationHref: string;
  canCoordinate: boolean;
}) {
  const vivas = tasks.filter((t) => t.state !== "cancelled");

  /*
    Maqueta 06 · "Tareas (2/4)" en el propio título. Lo cuenta
    `taskProgress()` en `src/core/`, con sus tests: una tarea cancelada no
    cuenta en NINGUNO de los dos números, y hacerlo a ojo en la plantilla
    es como un trabajo con dos hechas y dos canceladas acaba leyéndose
    "2/4" y pareciendo a medias cuando no queda nada.

    Sin tareas no se pinta contador: "(0/0)" no dice nada que no diga ya el
    estado vacío de debajo.
  */
  const progreso = taskProgress(tasks);

  return (
    <Card
      title={
        progreso.total === 0
          ? es.teamArea.tasks.breakdownTitle
          : es.teamArea.tasks.breakdownTitleWithCount(progreso.done, progreso.total)
      }
      action={
        canCoordinate ? (
          <Link
            href={coordinationHref}
            className="text-sm font-medium text-cuotly-green underline-offset-2 hover:underline focus:outline focus:outline-2 focus:outline-cuotly-green"
          >
            {es.teamArea.tasks.coordination.link}
          </Link>
        ) : undefined
      }
    >
      {tasks.length === 0 ? (
        <EmptyState
          title={es.teamArea.tasks.breakdownEmptyTitle}
          description={es.teamArea.tasks.breakdownEmptyReason}
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.teamArea.tasks.titleColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.tasks.assigneeColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.tasks.stateColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.tasks.coordination.dateColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <span className="font-medium text-text">{task.title}</span>
                    <span className="block text-sm text-text-secondary">
                      {es.teamArea.tasks.weights[task.weight]} · {TASK_LOAD_POINTS[task.weight]} pts
                      · {task.estimatedMinutes} {es.teamArea.tasks.minutesSuffix}
                    </span>
                  </TableCell>
                  <TableCell>
                    {task.assigneeName ?? (
                      <span className="text-text-secondary">{es.teamArea.tasks.unassigned}</span>
                    )}
                    {/*
                      RN-ASG-07 · una reasignación esperando decisión se ve
                      desde la ficha, no solo entrando a coordinar.
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

          {canCoordinate ? (
            <p className="mt-3 text-sm text-text-secondary">
              {es.teamArea.tasks.coordination.linkHint}
            </p>
          ) : null}
        </>
      )}

      {vivas.length > 0 ? <PointsDistribution tasks={vivas} /> : null}
    </Card>
  );
}
