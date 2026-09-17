import { describe, expect, it } from "vitest";

import { groupJobsByState } from "./job-board";
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
