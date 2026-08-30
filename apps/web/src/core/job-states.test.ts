import { describe, expect, it } from "vitest";
import {
  FINISHED_COLUMN_DAYS,
  JOB_STATES,
  TASK_STATES,
  canTransitionJobState,
  canTransitionTaskState,
  findJobTransition,
  isWithinFinishedColumn,
} from "./job-states";

describe("job-states — RN-JOB, PRD §11", () => {
  it("PRD §11.1: los once estados de un trabajo, con un único nombre interno (RN-REQ-01, CA-21)", () => {
    expect(JOB_STATES).toEqual([
      "pending_assignment",
      "assigned",
      "reassignment_requested",
      "in_progress",
      "blocked_by_client",
      "authorized_pause",
      "published",
      "in_correction",
      "completed",
      "cancelled_before_start",
      "cancelled_after_start",
    ]);
  });

  it("PRD §11.2: los cinco estados de una tarea", () => {
    expect(TASK_STATES).toEqual(["pending", "in_progress", "blocked", "completed", "cancelled"]);
  });

  describe("HU-16 · RN-SLA-05: asignar arranca T2", () => {
    it("pending_assignment -> assigned arranca T2 y no toca T3", () => {
      const transition = findJobTransition("pending_assignment", "assigned", "staff");
      expect(transition?.t2).toBe("start");
      expect(transition?.t3).toBe(null);
    });

    it("RN-ASG-03: la asignación automática del sistema es la misma transición", () => {
      expect(canTransitionJobState("pending_assignment", "assigned", "system")).toBe(true);
    });
  });

  describe("HU-18 · RN-JOB-03: Comenzar", () => {
    it("RN-SLA-07/11: al comenzar, T2 se detiene y T3 arranca en el mismo acto", () => {
      const transition = findJobTransition("assigned", "in_progress", "worker");
      expect(transition?.t2).toBe("stop");
      expect(transition?.t3).toBe("start");
    });

    it("no se puede comenzar un trabajo que todavía no está asignado", () => {
      expect(canTransitionJobState("pending_assignment", "in_progress", "worker")).toBe(false);
    });
  });

  describe("HU-19 · RN-JOB-08/09: bloqueo por falta de información", () => {
    it("el trabajador puede marcarlo, y T3 se pausa (RN-SLA-14)", () => {
      expect(findJobTransition("in_progress", "blocked_by_client", "worker")?.t3).toBe("pause");
    });

    it("CA-13: al reanudar, T3 se reanuda (no se reinicia)", () => {
      expect(findJobTransition("blocked_by_client", "in_progress", "worker")?.t3).toBe("resume");
    });

    it("RN-JOB-09: el administrador puede revertir el bloqueo del trabajador", () => {
      expect(canTransitionJobState("blocked_by_client", "in_progress", "staff")).toBe(true);
    });

    it("RN-JOB-07: la pausa autorizada es del propietario o administrador, no del trabajador", () => {
      expect(canTransitionJobState("in_progress", "authorized_pause", "staff")).toBe(true);
      expect(canTransitionJobState("in_progress", "authorized_pause", "worker")).toBe(false);
    });
  });

  describe("HU-20 · RN-JOB-10: publicar directamente, sin aprobación previa", () => {
    it("el trabajador publica desde En curso y T3 se detiene (RN-SLA-13)", () => {
      const transition = findJobTransition("in_progress", "published", "worker");
      expect(transition?.t3).toBe("stop");
    });

    it("RN-JOB-10: no existe ningún estado intermedio de aprobación del supervisor", () => {
      // La ausencia ES la regla: ninguna transición de la máquina lleva a
      // "published" pasando por una aprobación previa.
      const hacia = ["pending_assignment", "assigned", "blocked_by_client", "authorized_pause"] as const;
      for (const from of hacia) {
        expect(canTransitionJobState(from, "published", "worker")).toBe(false);
        expect(canTransitionJobState(from, "published", "staff")).toBe(false);
      }
    });
  });

  describe("HU-22 · RN-ASG-07/08/09 · CA-12: reasignación", () => {
    it("el trabajador puede pedirla antes y después de Comenzar", () => {
      expect(canTransitionJobState("assigned", "reassignment_requested", "worker")).toBe(true);
      expect(canTransitionJobState("in_progress", "reassignment_requested", "worker")).toBe(true);
    });

    it("RN-ASG-08: la aprueba el propietario o el administrador, no el trabajador", () => {
      expect(canTransitionJobState("reassignment_requested", "assigned", "staff")).toBe(true);
      expect(canTransitionJobState("reassignment_requested", "assigned", "worker")).toBe(false);
    });

    it("CA-12 · RN-SLA-09: ni pedir ni aprobar una reasignación toca ningún contador", () => {
      const pedir = findJobTransition("assigned", "reassignment_requested", "worker");
      const aprobar = findJobTransition("reassignment_requested", "assigned", "staff");
      const aprobarEnCurso = findJobTransition("reassignment_requested", "in_progress", "staff");

      for (const transition of [pedir, aprobar, aprobarEnCurso]) {
        expect(transition?.t2).toBe(null);
        expect(transition?.t3).toBe(null);
      }
    });
  });

  describe("HU-23 · RN-COR: corrección", () => {
    it("RN-COR-06: quien la ejecuta mueve el trabajo — la petición del cliente vive en la solicitud", () => {
      expect(canTransitionJobState("published", "in_correction", "worker")).toBe(true);
      // El cliente pide la corrección (request-states.ts: published ->
      // correction_requested), no cambia el estado del trabajo por su cuenta.
      expect(canTransitionJobState("published", "in_correction", "client")).toBe(false);
    });

    it("RN-COR-07 / RN-JOB-12: el equipo también puede abrirla cuando el error es suyo", () => {
      expect(canTransitionJobState("published", "in_correction", "staff")).toBe(true);
    });

    it("RN-COR-08: al cerrarse la ventana, el trabajo queda finalizado", () => {
      expect(canTransitionJobState("published", "completed", "system")).toBe(true);
    });
  });

  describe("RN-JOB-01: el trabajador no puede cancelar una tarea", () => {
    it("puede avanzarla, bloquearla y completarla", () => {
      expect(canTransitionTaskState("pending", "in_progress", "worker")).toBe(true);
      expect(canTransitionTaskState("in_progress", "blocked", "worker")).toBe(true);
      expect(canTransitionTaskState("in_progress", "completed", "worker")).toBe(true);
    });

    it("pero no puede cancelarla desde ningún estado — debe pedírselo a un administrador", () => {
      for (const from of ["pending", "in_progress", "blocked"] as const) {
        expect(canTransitionTaskState(from, "cancelled", "worker")).toBe(false);
        expect(canTransitionTaskState(from, "cancelled", "staff")).toBe(true);
      }
    });
  });

  describe("RN-JOB-13: columna Finalizados, 30 días naturales", () => {
    const finished = new Date("2026-08-01T10:00:00Z");

    it("son 30 días naturales, no laborables", () => {
      expect(FINISHED_COLUMN_DAYS).toBe(30);
    });

    it("dentro de los 30 días sigue en la columna", () => {
      expect(isWithinFinishedColumn(finished, new Date("2026-08-01T10:00:01Z"))).toBe(true);
      expect(isWithinFinishedColumn(finished, new Date("2026-08-30T09:59:00Z"))).toBe(true);
    });

    it("pasados los 30 días deja de mostrarse ahí (queda en el historial, no se borra)", () => {
      expect(isWithinFinishedColumn(finished, new Date("2026-08-31T10:00:01Z"))).toBe(false);
      expect(isWithinFinishedColumn(finished, new Date("2026-12-01T10:00:00Z"))).toBe(false);
    });
  });
});
