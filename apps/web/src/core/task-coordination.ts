/**
 * `src/core/task-coordination.ts` — las dos decisiones de la maqueta 07
 * ("Tareas — asignación y coordinación") que no son de presentación:
 * **en qué orden se leen las tareas de un trabajo** y **qué ofrece el
 * panel de detalle a quien lo está mirando**.
 *
 * Las dos parecen de plantilla y no lo son. El orden decide qué se lee
 * primero en una pantalla que existe para repartir trabajo, y la segunda
 * reproduce las guardas del servidor (migración 65): si se equivoca, se
 * pinta un botón que al pulsarlo da error, o —peor— se esconde uno que la
 * persona sí podía usar.
 *
 * **Esto no autoriza nada.** Que un botón no se pinte es comodidad, no
 * control: `approve_task_reassignment()` le niega la aprobación a un
 * trabajador aunque llame por RPC (RN-ASG-08), y `assign_task()` rechaza
 * el reparto de una tarea con reasignación pendiente. Lo que hay aquí es
 * la misma decisión escrita en el sitio donde se puede probar sin
 * navegador.
 */
import type { TaskState } from "./job-states";

/** Lo que hace falta de una tarea para ordenarla. Nada más. */
export interface OrderableTask {
  readonly id: string;
  readonly state: string;
  /** Maqueta 07 · "Fecha estimada". `null` mientras nadie la ponga. */
  readonly plannedDate: string | null;
  readonly createdAt: string;
}

/**
 * El orden de "Tareas del trabajo".
 *
 * Tres reglas, y cada una tiene su motivo:
 *
 * 1. **Lo cancelado, al final.** Una tarea cancelada no es trabajo:
 *    dejarla en medio del plan obliga a recontar para saber qué queda.
 *    Es el mismo criterio que `taskProgress()`, que no la cuenta en
 *    ninguno de sus dos números.
 * 2. **Por fecha prevista, y las que no tienen, después.** La pantalla es
 *    un plan de trabajo y se lee como tal. Una tarea sin fecha no va
 *    "antes que la de mañana": va donde se ve que está sin planificar.
 * 3. **Desempate por fecha de creación y por `id`.** No es adorno:
 *    `created_at` vale `now()`, que en PostgreSQL es la hora de la
 *    TRANSACCIÓN, así que varias tareas sembradas o creadas en un mismo
 *    bloque comparten fecha al segundo. Sin desempate esas filas salen en
 *    el orden físico de la tabla y la lista cambia sola entre recargas.
 *    Se aprendió en la vista 04, con las seis tareas del reportaje.
 */
export function orderJobTasks<T extends OrderableTask>(tasks: readonly T[]): readonly T[] {
  return [...tasks].sort((a, b) => {
    const canceladaA = a.state === "cancelled" ? 1 : 0;
    const canceladaB = b.state === "cancelled" ? 1 : 0;
    if (canceladaA !== canceladaB) return canceladaA - canceladaB;

    if (a.plannedDate !== b.plannedDate) {
      if (a.plannedDate === null) return 1;
      if (b.plannedDate === null) return -1;
      return a.plannedDate < b.plannedDate ? -1 : 1;
    }

    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

/**
 * Estados de trabajo en los que ya no se toca su desglose. Son los mismos
 * que enumeran `assign_task()` y `set_task_planned_date()` en la migración
 * 65: repartir o replanificar las tareas de algo terminado sería reescribir
 * historial.
 */
const JOB_STATES_CERRADOS: readonly string[] = [
  "published",
  "completed",
  "cancelled_before_start",
  "cancelled_after_start",
];

/** Una tarea terminada o cancelada tampoco cambia de manos (CLAUDE.md MUST NOT). */
const TASK_STATES_CERRADOS: readonly TaskState[] = ["completed", "cancelled"];

export interface TaskViewer {
  readonly viewerId: string;
  /** `has_capability(space_id, 'assign_jobs')`: propietario o administrador. */
  readonly canAssignJobs: boolean;
  /** Responsable del trabajo al que pertenece la tarea, si lo hay. */
  readonly jobAssignedTo: string | null;
  readonly jobState: string;
}

export interface TaskForPanel {
  readonly state: string;
  readonly assigneeId: string | null;
  /** Si hay una solicitud de reasignación sin resolver sobre esta tarea. */
  readonly hasPendingReassignment: boolean;
}

export interface TaskPanelActions {
  /** Cambiar el responsable directamente (`assign_task`). */
  readonly canAssign: boolean;
  /** Poner o quitar la fecha prevista (`set_task_planned_date`). */
  readonly canPlan: boolean;
  /** RN-ASG-07: pedirla es del responsable de la tarea. */
  readonly canRequestReassignment: boolean;
  /** RN-ASG-08: la resuelve quien tiene `assign_jobs`. */
  readonly canDecideReassignment: boolean;
  /**
   * §11.2 · mover la tarea (Comenzar, Bloquear, Reanudar, Marcar hecha).
   * `update_task_state()` lo reserva a quien la tiene asignada o a
   * `assign_jobs` — no al responsable del trabajo por serlo.
   */
  readonly canAdvanceState: boolean;
  /** RN-JOB-01 · cancelar una tarea es solo de un administrador. */
  readonly canCancel: boolean;
}

/**
 * Qué puede hacer quien mira, sobre esta tarea, ahora mismo.
 *
 * Reproduce las guardas de la migración 65 una por una:
 *
 * - **Repartir y planificar** son del responsable del trabajo o de quien
 *   tiene `assign_jobs` (§4.2). Una tarea suelta —sin trabajo del que
 *   colgarse— solo la toca `assign_jobs`.
 * - **Con una reasignación pendiente no se reparte** (RN-ASG-08): decide
 *   quien aprueba, no quien reparte. Ésta es la que se olvida: sin ella la
 *   pantalla ofrece un desplegable de responsable que el servidor va a
 *   rechazar, y quien lo use creerá que la aplicación está rota.
 * - **Pedirla** es del responsable de la tarea y de nadie más (RN-ASG-07).
 *   Un administrador no "pide": reparte.
 * - **Mover la tarea** es de quien la tiene asignada o de `assign_jobs`, y
 *   NO del responsable del trabajo por serlo: `update_task_state()` no le
 *   da esa puerta. Es el único sitio donde las dos listas de permisos no
 *   coinciden, y por eso se escribe aparte en vez de reutilizar
 *   `reparteElTrabajo`.
 * - **Cancelar** es solo de un administrador (RN-JOB-01): el trabajador
 *   tiene que pedírselo.
 * - Sobre una tarea completada o cancelada, o de un trabajo terminado, no
 *   se hace nada.
 */
export function taskPanelActions(viewer: TaskViewer, task: TaskForPanel): TaskPanelActions {
  const trabajoCerrado = JOB_STATES_CERRADOS.includes(viewer.jobState);
  const tareaCerrada = TASK_STATES_CERRADOS.includes(task.state as TaskState);
  const viva = !trabajoCerrado && !tareaCerrada;

  const reparteElTrabajo =
    viewer.canAssignJobs ||
    (viewer.jobAssignedTo !== null && viewer.jobAssignedTo === viewer.viewerId);

  return {
    canAssign: viva && reparteElTrabajo && !task.hasPendingReassignment,
    canPlan: viva && reparteElTrabajo,
    canRequestReassignment:
      viva && task.assigneeId === viewer.viewerId && !task.hasPendingReassignment,
    canDecideReassignment: viva && viewer.canAssignJobs && task.hasPendingReassignment,
    canAdvanceState:
      viva && (viewer.canAssignJobs || task.assigneeId === viewer.viewerId),
    canCancel: viva && viewer.canAssignJobs,
  };
}
