import { describe, expect, it } from "vitest";

import { contractualCalendar } from "./business-clock";
import {
  deadlinesByJob,
  groupJobsByState,
  jobHeadline,
  matchesDeadlineFilter,
  projectDeadline,
  upcomingDeadlines,
} from "./job-board";
import { JOB_STATES } from "./job-states";

const trabajo = (id: string, state: string) => ({ id, state });

describe("groupJobsByState · el tablero de trabajos (M09)", () => {
  it("devuelve las once columnas de PRD §11.1, en el orden del documento", () => {
    const { columns } = groupJobsByState([]);
    expect(columns.map((c) => c.state)).toEqual([...JOB_STATES]);
  });

  it("pinta también las columnas vacías: una columna sin trabajos es un dato", () => {
    const { columns } = groupJobsByState([trabajo("a", "in_progress")]);
    expect(columns).toHaveLength(JOB_STATES.length);
    expect(columns.find((c) => c.state === "pending_assignment")?.jobs).toEqual([]);
  });

  it("reparte cada trabajo en la columna de su estado", () => {
    const { columns } = groupJobsByState([
      trabajo("a", "in_progress"),
      trabajo("b", "published"),
      trabajo("c", "in_progress"),
    ]);
    expect(columns.find((c) => c.state === "in_progress")?.jobs.map((j) => j.id)).toEqual([
      "a",
      "c",
    ]);
    expect(columns.find((c) => c.state === "published")?.jobs.map((j) => j.id)).toEqual(["b"]);
  });

  it("conserva dentro de cada columna el orden en que le llegaron", () => {
    const entrada = ["z", "m", "a"].map((id) => trabajo(id, "assigned"));
    const { columns } = groupJobsByState(entrada);
    expect(columns.find((c) => c.state === "assigned")?.jobs.map((j) => j.id)).toEqual([
      "z",
      "m",
      "a",
    ]);
  });

  it("no hace desaparecer un trabajo con un estado que no es de los once", () => {
    const { columns, unknown } = groupJobsByState([
      trabajo("a", "assigned"),
      trabajo("raro", "inventado"),
    ]);
    expect(unknown.map((j) => j.id)).toEqual(["raro"]);
    expect(columns.every((c) => c.jobs.every((j) => j.id !== "raro"))).toBe(true);
  });

  it("no suma ni pierde trabajos: lo que entra sale", () => {
    const entrada = [
      trabajo("a", "assigned"),
      trabajo("b", "completed"),
      trabajo("c", "cancelled_after_start"),
      trabajo("d", "inventado"),
    ];
    const { columns, unknown } = groupJobsByState(entrada);
    const salida = columns.flatMap((c) => c.jobs).length + unknown.length;
    expect(salida).toBe(entrada.length);
  });
});

describe("deadlinesByJob · el aviso de plazo de cada tarjeta (M09, RN-SLA-17)", () => {
  it("RN-SLA-17 · fuera de plazo y a punto de vencer salen del cálculo del reloj, por trabajo", () => {
    const mapa = deadlinesByJob([
      { kind: "job_out_of_deadline", id: "a", remainingMinutes: null, counter: "t3" },
      { kind: "job_about_to_expire", id: "b", remainingMinutes: 90, counter: "t2" },
      // Lo que no es de plazo no se convierte en aviso de plazo.
      { kind: "job_pending_assignment", id: "c", remainingMinutes: null, counter: null },
      { kind: "request_pending_validation", id: "d", remainingMinutes: null, counter: null },
    ]);
    expect(mapa.get("a")).toEqual({ kind: "out_of_deadline" });
    expect(mapa.get("b")).toEqual({ kind: "about_to_expire", remainingMinutes: 90, counter: "t2" });
    expect(mapa.has("c")).toBe(false);
    expect(mapa.has("d")).toBe(false);
  });
});

describe("projectDeadline · cuándo vence lo que corre (M09, RN-SLA-14, RN-SLA-17)", () => {
  const calendario = contractualCalendar("Europe/Madrid", []);
  const estado = (remaining: number, overdue = false) => ({
    elapsedMinutes: 0,
    totalMinutes: 600,
    remainingMinutes: remaining,
    percentUsed: 0,
    overdue,
  });

  it("RN-SLA-17 · vencido no tiene fecha inventada", () => {
    expect(projectDeadline(estado(0, true), true, new Date(), calendario)).toEqual({ kind: "overdue" });
  });

  it("RN-SLA-14 · en pausa no se proyecta: la fecha cambiaría en cada recarga", () => {
    expect(projectDeadline(estado(120), false, new Date(), calendario)).toEqual({ kind: "paused" });
  });

  it("corriendo, suma los minutos laborables que quedan a partir de ahora", () => {
    // Martes 15/09/2026 a las 10:00 en Madrid (08:00 UTC), dentro de ventana.
    const ahora = new Date("2026-09-15T08:00:00Z");
    const p = projectDeadline(estado(60), true, ahora, calendario);
    expect(p).toEqual({ kind: "at", at: new Date("2026-09-15T09:00:00Z") });
  });

  it("primero lo vencido, después por fecha, y lo que está en pausa no entra", () => {
    const filas = [
      { id: "tarde", deadline: { kind: "at" as const, at: new Date("2026-09-20T10:00:00Z") } },
      { id: "pausa", deadline: { kind: "paused" as const } },
      { id: "pronto", deadline: { kind: "at" as const, at: new Date("2026-09-16T10:00:00Z") } },
      { id: "vencido", deadline: { kind: "overdue" as const } },
    ];
    expect(upcomingDeadlines(filas).map((f) => f.id)).toEqual(["vencido", "pronto", "tarde"]);
  });
});

describe("jobHeadline · el título de un trabajo en la bandeja", () => {
  it("prefiere el resumen validado, luego lo que escribió el restaurante, y si no hay nada no inventa", () => {
    expect(jobHeadline({ summary: " Cambiar horario ", description: "Texto largo" })).toBe("Cambiar horario");
    expect(jobHeadline({ summary: null, description: "Subir la carta de otoño" })).toBe("Subir la carta de otoño");
    expect(jobHeadline({ summary: "  ", description: null })).toBeNull();
  });
});

describe("matchesDeadlineFilter · el filtro Plazo de la bandeja (M09, RN-SLA-14, RN-SLA-17)", () => {
  const vencido = { kind: "overdue" as const };
  const corre = { kind: "at" as const, at: new Date("2026-09-20T10:00:00Z") };
  const pausa = { kind: "paused" as const };

  it("RN-SLA-17 · fuera de plazo es solo lo que el reloj da por vencido", () => {
    expect(matchesDeadlineFilter(vencido, "fuera_de_plazo")).toBe(true);
    expect(matchesDeadlineFilter(corre, "fuera_de_plazo")).toBe(false);
  });

  it("RN-SLA-14 · en pausa no es corriendo, y corriendo no es en pausa", () => {
    expect(matchesDeadlineFilter(pausa, "en_pausa")).toBe(true);
    expect(matchesDeadlineFilter(pausa, "corriendo")).toBe(false);
    expect(matchesDeadlineFilter(corre, "corriendo")).toBe(true);
  });

  it("sin plazo es el trabajo que no tiene ningún contador que mande", () => {
    expect(matchesDeadlineFilter(undefined, "sin_plazo")).toBe(true);
    expect(matchesDeadlineFilter(pausa, "sin_plazo")).toBe(false);
  });
});
