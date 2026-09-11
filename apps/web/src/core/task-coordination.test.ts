import { describe, expect, it } from "vitest";

import { orderJobTasks, taskPanelActions, type OrderableTask } from "./task-coordination";

function tarea(partial: Partial<OrderableTask> & { id: string }): OrderableTask {
  return {
    state: "pending",
    plannedDate: null,
    createdAt: "2026-09-11T09:00:00.000Z",
    ...partial,
  };
}

describe("orderJobTasks · el orden de 'Tareas del trabajo' (maqueta 07)", () => {
  it("ordena por fecha prevista, de la más próxima a la más lejana", () => {
    const orden = orderJobTasks([
      tarea({ id: "c", plannedDate: "2026-09-13" }),
      tarea({ id: "a", plannedDate: "2026-09-11" }),
      tarea({ id: "b", plannedDate: "2026-09-12" }),
    ]).map((t) => t.id);

    expect(orden).toEqual(["a", "b", "c"]);
  });

  it("deja al final las tareas sin fecha prevista, no al principio", () => {
    // Una tarea sin planificar no va "antes que la de mañana": va donde se
    // ve que está sin planificar.
    const orden = orderJobTasks([
      tarea({ id: "sin-fecha", plannedDate: null }),
      tarea({ id: "manana", plannedDate: "2026-09-12" }),
    ]).map((t) => t.id);

    expect(orden).toEqual(["manana", "sin-fecha"]);
  });

  it("manda al final lo cancelado aunque tenga la fecha más próxima", () => {
    // Es el mismo criterio que taskProgress(), que no cuenta una tarea
    // cancelada en ninguno de sus dos números: no es trabajo, y en medio
    // del plan obliga a recontar.
    const orden = orderJobTasks([
      tarea({ id: "cancelada", state: "cancelled", plannedDate: "2026-09-01" }),
      tarea({ id: "pendiente", plannedDate: "2026-09-30" }),
    ]).map((t) => t.id);

    expect(orden).toEqual(["pendiente", "cancelada"]);
  });

  it("desempata por fecha de creación cuando comparten fecha prevista", () => {
    const orden = orderJobTasks([
      tarea({ id: "segunda", plannedDate: "2026-09-13", createdAt: "2026-09-11T10:00:00.000Z" }),
      tarea({ id: "primera", plannedDate: "2026-09-13", createdAt: "2026-09-11T09:00:00.000Z" }),
    ]).map((t) => t.id);

    expect(orden).toEqual(["primera", "segunda"]);
  });

  it("desempata por id cuando comparten fecha prevista Y fecha de creación", () => {
    // `created_at` vale `now()`, que en PostgreSQL es la hora de la
    // TRANSACCIÓN: varias tareas creadas en un mismo bloque comparten
    // fecha al segundo. Sin este desempate la lista cambia sola entre
    // recargas, que es lo que se vio con las seis tareas de la vista 04.
    const mismaFecha = { plannedDate: "2026-09-13", createdAt: "2026-09-11T09:00:00.000Z" };
    const orden = orderJobTasks([
      tarea({ id: "bbb", ...mismaFecha }),
      tarea({ id: "aaa", ...mismaFecha }),
      tarea({ id: "ccc", ...mismaFecha }),
    ]).map((t) => t.id);

    expect(orden).toEqual(["aaa", "bbb", "ccc"]);
  });

  it("no modifica el array que recibe", () => {
    const original = [tarea({ id: "b", plannedDate: "2026-09-13" }), tarea({ id: "a", plannedDate: "2026-09-11" })];
    orderJobTasks(original);
    expect(original.map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("taskPanelActions · el panel de detalle (migración 65)", () => {
  const eva = "11111111-1111-1111-1111-111111111111";
  const hugo = "22222222-2222-2222-2222-222222222222";
  const admin = "33333333-3333-3333-3333-333333333333";

  const trabajoDeEva = {
    viewerId: eva,
    canAssignJobs: false,
    jobAssignedTo: eva,
    jobState: "in_progress",
  };

  const tareaDeEva = { state: "pending", assigneeId: eva, hasPendingReassignment: false };

  it("RN-ASG-07 · la reasignación la pide el responsable de la tarea", () => {
    expect(taskPanelActions(trabajoDeEva, tareaDeEva).canRequestReassignment).toBe(true);
  });

  it("RN-ASG-07 · no la pide quien no es el responsable de la tarea", () => {
    const hugoMirando = { ...trabajoDeEva, viewerId: hugo, jobAssignedTo: hugo };
    expect(taskPanelActions(hugoMirando, tareaDeEva).canRequestReassignment).toBe(false);
  });

  it("RN-ASG-07 · un administrador no 'pide' la reasignación: reparte", () => {
    const adminMirando = { viewerId: admin, canAssignJobs: true, jobAssignedTo: eva, jobState: "in_progress" };
    const acciones = taskPanelActions(adminMirando, tareaDeEva);
    expect(acciones.canRequestReassignment).toBe(false);
    expect(acciones.canAssign).toBe(true);
  });

  it("RN-ASG-08 · con una reasignación pendiente NO se ofrece repartir", () => {
    // Sin esto la pantalla pinta un desplegable de responsable que el
    // servidor va a rechazar, y quien lo use creerá que está roto.
    const acciones = taskPanelActions(trabajoDeEva, {
      ...tareaDeEva,
      hasPendingReassignment: true,
    });
    expect(acciones.canAssign).toBe(false);
  });

  it("RN-ASG-08 · la resuelve quien tiene assign_jobs, y solo si hay algo que resolver", () => {
    const adminMirando = { viewerId: admin, canAssignJobs: true, jobAssignedTo: eva, jobState: "in_progress" };
    const pendiente = { ...tareaDeEva, hasPendingReassignment: true };

    expect(taskPanelActions(adminMirando, pendiente).canDecideReassignment).toBe(true);
    expect(taskPanelActions(adminMirando, tareaDeEva).canDecideReassignment).toBe(false);
    expect(taskPanelActions(trabajoDeEva, pendiente).canDecideReassignment).toBe(false);
  });

  it("RN-ASG-07 · no se pide dos veces la misma reasignación", () => {
    const acciones = taskPanelActions(trabajoDeEva, {
      ...tareaDeEva,
      hasPendingReassignment: true,
    });
    expect(acciones.canRequestReassignment).toBe(false);
  });

  it("§4.2 · el responsable del trabajo reparte y planifica sus tareas", () => {
    const acciones = taskPanelActions(trabajoDeEva, { ...tareaDeEva, assigneeId: hugo });
    expect(acciones.canAssign).toBe(true);
    expect(acciones.canPlan).toBe(true);
  });

  it("§4.2 · quien no es el responsable ni administrador no reparte ni planifica", () => {
    const hugoMirando = { ...trabajoDeEva, viewerId: hugo };
    const acciones = taskPanelActions(hugoMirando, { ...tareaDeEva, assigneeId: hugo });
    expect(acciones.canAssign).toBe(false);
    expect(acciones.canPlan).toBe(false);
  });

  it("§11.2 · mueve la tarea quien la tiene asignada", () => {
    expect(taskPanelActions(trabajoDeEva, tareaDeEva).canAdvanceState).toBe(true);
  });

  it("§11.2 · el responsable del TRABAJO no mueve una tarea que no es suya", () => {
    // Es el único sitio donde las dos listas de permisos no coinciden:
    // Eva reparte y planifica todas las tareas de su trabajo, pero
    // `update_task_state()` no le deja mover la de Hugo.
    const deHugo = { ...tareaDeEva, assigneeId: hugo };
    const acciones = taskPanelActions(trabajoDeEva, deHugo);
    expect(acciones.canAssign).toBe(true);
    expect(acciones.canAdvanceState).toBe(false);
  });

  it("RN-JOB-01 · cancelar una tarea es solo de un administrador", () => {
    expect(taskPanelActions(trabajoDeEva, tareaDeEva).canCancel).toBe(false);

    const adminMirando = { viewerId: admin, canAssignJobs: true, jobAssignedTo: eva, jobState: "in_progress" };
    expect(taskPanelActions(adminMirando, tareaDeEva).canCancel).toBe(true);
  });

  it("una tarea suelta (sin trabajo) solo la toca quien tiene assign_jobs", () => {
    const suelta = { viewerId: eva, canAssignJobs: false, jobAssignedTo: null, jobState: "in_progress" };
    expect(taskPanelActions(suelta, tareaDeEva).canAssign).toBe(false);

    const adminSuelta = { viewerId: admin, canAssignJobs: true, jobAssignedTo: null, jobState: "in_progress" };
    expect(taskPanelActions(adminSuelta, tareaDeEva).canAssign).toBe(true);
  });

  it("sobre una tarea completada o cancelada no se ofrece nada", () => {
    for (const state of ["completed", "cancelled"]) {
      const acciones = taskPanelActions(trabajoDeEva, { ...tareaDeEva, state });
      expect(acciones).toEqual({
        canAssign: false,
        canPlan: false,
        canRequestReassignment: false,
        canDecideReassignment: false,
        canAdvanceState: false,
        canCancel: false,
      });
    }
  });

  it("sobre las tareas de un trabajo ya terminado no se ofrece nada", () => {
    // Los cuatro estados que enumera la migración 65. Reescribir el
    // desglose de algo publicado o cancelado sería reescribir historial.
    for (const jobState of [
      "published",
      "completed",
      "cancelled_before_start",
      "cancelled_after_start",
    ]) {
      const acciones = taskPanelActions({ ...trabajoDeEva, jobState }, tareaDeEva);
      expect(acciones).toEqual({
        canAssign: false,
        canPlan: false,
        canRequestReassignment: false,
        canDecideReassignment: false,
        canAdvanceState: false,
        canCancel: false,
      });
    }
  });
});
