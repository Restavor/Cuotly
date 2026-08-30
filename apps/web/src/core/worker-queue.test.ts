import { describe, expect, it } from "vitest";
import { canStartQueuedJob, orderWorkerQueue, recommendedJobNow, type QueuedJob } from "./worker-queue";

function queued(overrides: Partial<QueuedJob> = {}): QueuedJob {
  return {
    jobId: "j-1",
    state: "assigned",
    outOfDeadline: false,
    remainingBusinessMinutes: 600,
    planPriority: "other",
    assignedAt: new Date("2026-08-31T07:00:00.000Z"),
    ...overrides,
  };
}

describe("worker-queue — HU-17, PRD §20.4", () => {
  it("HU-17: la cola personal propone un trabajo recomendado ahora", () => {
    const cola = [
      queued({ jobId: "holgado", remainingBusinessMinutes: 900 }),
      queued({ jobId: "apurado", remainingBusinessMinutes: 120 }),
    ];

    expect(recommendedJobNow(cola)?.jobId).toBe("apurado");
  });

  it("RN-SLA-17: un trabajo fuera de plazo se recomienda antes que cualquier otro", () => {
    const cola = [
      queued({ jobId: "en-plazo", remainingBusinessMinutes: 30 }),
      queued({ jobId: "fuera-de-plazo", remainingBusinessMinutes: 0, outOfDeadline: true }),
    ];

    expect(recommendedJobNow(cola)?.jobId).toBe("fuera-de-plazo");
  });

  it("RN-COM-03: a igualdad de urgencia, Premium tiene prioridad interna sobre Impulso", () => {
    const cola = [
      queued({ jobId: "impulso", planPriority: "impulso" }),
      queued({ jobId: "premium", planPriority: "premium" }),
      queued({ jobId: "sin-plan", planPriority: "other" }),
    ];

    expect(orderWorkerQueue(cola).map((job) => job.jobId)).toEqual(["premium", "impulso", "sin-plan"]);
  });

  it("el orden es determinista: la misma cola desordenada da siempre el mismo resultado", () => {
    const a = queued({ jobId: "aaa" });
    const b = queued({ jobId: "bbb" });

    expect(orderWorkerQueue([a, b]).map((j) => j.jobId)).toEqual(["aaa", "bbb"]);
    expect(orderWorkerQueue([b, a]).map((j) => j.jobId)).toEqual(["aaa", "bbb"]);
  });

  it("RN-JOB-08: un trabajo bloqueado espera al restaurante, no ocupa la cola del trabajador", () => {
    const cola = [
      queued({ jobId: "bloqueado", state: "blocked_by_client", remainingBusinessMinutes: 10 }),
      queued({ jobId: "asignado" }),
    ];

    expect(orderWorkerQueue(cola).map((job) => job.jobId)).toEqual(["asignado"]);
  });

  it("con la cola vacía no hay recomendación — y eso se dice, no se inventa una", () => {
    expect(recommendedJobNow([])).toBe(null);
  });

  describe("HU-17 · PRD §20.4: la recomendación no obliga", () => {
    const cola = [
      queued({ jobId: "recomendado", remainingBusinessMinutes: 60 }),
      queued({ jobId: "otro-autorizado", remainingBusinessMinutes: 900 }),
    ];

    it("puede empezar otro trabajo autorizado distinto del recomendado", () => {
      expect(recommendedJobNow(cola)?.jobId).toBe("recomendado");
      expect(canStartQueuedJob(cola, "otro-autorizado")).toBe(true);
    });

    it("pero no uno que no esté en su cola", () => {
      expect(canStartQueuedJob(cola, "de-otra-persona")).toBe(false);
    });

    it("ni uno que ya está en curso: Comenzar solo se pulsa una vez (RN-JOB-03)", () => {
      const enCurso = [queued({ jobId: "ya-empezado", state: "in_progress" })];
      expect(canStartQueuedJob(enCurso, "ya-empezado")).toBe(false);
    });
  });
});
