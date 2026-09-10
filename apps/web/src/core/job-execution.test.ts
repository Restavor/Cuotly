/**
 * Lo que la ficha de un trabajo afirma sobre su ejecución (maqueta 06):
 * el recuento del desglose y la fecha de fin.
 *
 * Los dos casos que de verdad importan y que un `null` opcional habría
 * dejado pasar: que una tarea cancelada no infle el total, y que un
 * trabajo en pausa NO dé fecha aunque tenga contador arrancado y minutos
 * restantes (RN-JOB-08, RN-SLA-14).
 */
import { describe, expect, it } from "vitest";

import { jobEnd, taskProgress } from "./job-execution";
import { JOB_STATES, type JobState } from "./job-states";
import { isCounterRunning } from "./timer-events";

const AHORA = new Date("2026-09-11T09:00:00.000Z");
const VENCE = new Date("2026-09-13T09:00:00.000Z");

describe("taskProgress · el recuento del desglose (HU-21)", () => {
  it("cuenta las completadas sobre las que siguen vivas", () => {
    expect(
      taskProgress([
        { state: "completed" },
        { state: "completed" },
        { state: "in_progress" },
        { state: "pending" },
      ]),
    ).toEqual({ done: 2, total: 4 });
  });

  it("una tarea cancelada no cuenta ni como hecha ni en el total (RN-ASG-13)", () => {
    // Sin esto el trabajo se leería "2/4" y parecería a medias cuando ya
    // no queda nada por hacer.
    expect(
      taskProgress([
        { state: "completed" },
        { state: "completed" },
        { state: "cancelled" },
        { state: "cancelled" },
      ]),
    ).toEqual({ done: 2, total: 2 });
  });

  it("sin tareas, el recuento es cero y no falla", () => {
    expect(taskProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe("jobEnd · qué se puede afirmar sobre el fin (CA-20)", () => {
  const base = {
    publishedAt: null,
    t3Started: true,
    deadlineAt: VENCE,
    hasDeadline: true,
  } as const;

  it("con el contador corriendo, la fecha estimada es la del plazo", () => {
    expect(jobEnd({ ...base, state: "in_progress" })).toEqual({ kind: "estimated", at: VENCE });
  });

  it("bloqueado NO da fecha, aunque el plazo esté calculado (RN-JOB-08)", () => {
    // Mutación que este test caza: preguntar por `deadlineAt` antes que
    // por la pausa. El plazo existe y está bien calculado; lo que no es
    // cierto es que el trabajo vaya a terminar ese día.
    expect(jobEnd({ ...base, state: "blocked_by_client" })).toEqual({ kind: "paused" });
    expect(jobEnd({ ...base, state: "authorized_pause" })).toEqual({ kind: "paused" });
  });

  it("sin haber comenzado se dice eso, no una fecha (RN-JOB-03)", () => {
    expect(jobEnd({ ...base, state: "assigned", t3Started: false })).toEqual({
      kind: "not_started",
    });
  });

  it("publicado deja de ser una estimación: es la fecha en que ocurrió", () => {
    expect(jobEnd({ ...base, state: "published", publishedAt: AHORA })).toEqual({
      kind: "published",
      at: AHORA,
    });
  });

  it("en corrección sigue enseñando la fecha de publicación (RN-COR-02)", () => {
    // A `in_correction` solo se llega desde `published`, así que la fecha
    // existe y no se vuelve a estimar nada.
    expect(jobEnd({ ...base, state: "in_correction", publishedAt: AHORA })).toEqual({
      kind: "published",
      at: AHORA,
    });
  });

  it("cancelado no tiene fin que estimar", () => {
    expect(jobEnd({ ...base, state: "cancelled_before_start" })).toEqual({ kind: "cancelled" });
    expect(jobEnd({ ...base, state: "cancelled_after_start" })).toEqual({ kind: "cancelled" });
  });

  it("sin categoría no hay plazo de ejecución que calcular (RN-SLA-12)", () => {
    expect(jobEnd({ ...base, state: "in_progress", hasDeadline: false })).toEqual({
      kind: "no_deadline",
    });
  });

  it("publicado sin fecha guardada no afirma que se publicó", () => {
    expect(jobEnd({ ...base, state: "published", publishedAt: null })).toEqual({
      kind: "no_deadline",
    });
  });

  /**
   * El mismo barrido que la maqueta 05 hace con los tres pasos de la
   * validación: recorrer TODOS los estados del catálogo y exigir que
   * ninguno deje la pantalla sin nada que decir. Un estado nuevo que no se
   * contemple aquí hace fallar el test en vez de pintar un hueco.
   */
  it("los once estados del catálogo tienen respuesta", () => {
    for (const state of JOB_STATES as readonly JobState[]) {
      const respuesta = jobEnd({ ...base, state, publishedAt: AHORA });
      expect(respuesta.kind, `estado sin respuesta: ${state}`).toBeTruthy();
    }
  });
});

describe("isCounterRunning · si el contador corre ahora mismo", () => {
  it("un tramo abierto por started o resumed está corriendo", () => {
    expect(isCounterRunning([{ type: "started", occurredAt: AHORA }])).toBe(true);
    expect(
      isCounterRunning([
        { type: "started", occurredAt: AHORA },
        { type: "paused", occurredAt: VENCE },
        { type: "resumed", occurredAt: new Date("2026-09-14T09:00:00.000Z") },
      ]),
    ).toBe(true);
  });

  it("paused y stopped lo cierran", () => {
    expect(
      isCounterRunning([
        { type: "started", occurredAt: AHORA },
        { type: "paused", occurredAt: VENCE },
      ]),
    ).toBe(false);
    expect(
      isCounterRunning([
        { type: "started", occurredAt: AHORA },
        { type: "stopped", occurredAt: VENCE },
      ]),
    ).toBe(false);
  });

  it("el orden en que lleguen los eventos da igual (CA-10)", () => {
    expect(
      isCounterRunning([
        { type: "paused", occurredAt: VENCE },
        { type: "started", occurredAt: AHORA },
      ]),
    ).toBe(false);
  });

  it("sin eventos no hay contador que corra", () => {
    expect(isCounterRunning([])).toBe(false);
  });
});
