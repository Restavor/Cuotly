import { describe, expect, it } from "vitest";

import { calendarDaysBetween, dueCharges, reminderSchedule } from "./finance-due";

describe("M52 · los avisos de un cobro (RN-REC-01, RN-FIN-10, RN-FIN-11)", () => {
  it("RN-REC-01 · son tres: el vencimiento, +24 h y +72 h naturales", () => {
    const vence = new Date("2026-09-10T10:00:00Z");
    const pasos = reminderSchedule(vence, new Date("2026-09-11T12:00:00Z"));
    expect(pasos.map((p) => [p.kind, p.at.toISOString(), p.reached])).toEqual([
      ["due", "2026-09-10T10:00:00.000Z", true],
      ["pause", "2026-09-11T10:00:00.000Z", true],
      ["suspension", "2026-09-13T10:00:00.000Z", false],
    ]);
  });

  it("antes del vencimiento no ha llegado ninguno", () => {
    const pasos = reminderSchedule(new Date("2026-09-30T10:00:00Z"), new Date("2026-09-23T10:00:00Z"));
    expect(pasos.every((p) => !p.reached)).toBe(true);
  });
});

describe("M52 · días hasta o desde el vencimiento", () => {
  it("cuenta días de calendario, también cruzando meses", () => {
    expect(calendarDaysBetween("2026-08-31", "2026-09-18")).toBe(18);
    expect(calendarDaysBetween("2026-09-23", "2026-09-20")).toBe(-3);
    expect(calendarDaysBetween("2026-09-23", "2026-09-23")).toBe(0);
  });
});

describe("M52 · qué cobros salen en Vencimientos (RN-FIN-02)", () => {
  const filas = [
    { id: "pagado", establishmentId: "a", status: "paid", outstanding: 0, dueAt: "2026-08-01T00:00:00Z" },
    { id: "tarde", establishmentId: "a", status: "overdue", outstanding: 100, dueAt: "2026-08-31T00:00:00Z" },
    { id: "pronto", establishmentId: "b", status: "pending", outstanding: 100, dueAt: "2026-09-30T00:00:00Z" },
    { id: "antiguo", establishmentId: "b", status: "overdue", outstanding: 50, dueAt: "2026-07-31T00:00:00Z" },
  ];

  it("solo los que tienen deuda viva, del que venció antes al que vence después", () => {
    expect(dueCharges(filas, { establishmentId: null, state: null }).map((f) => f.id)).toEqual([
      "antiguo",
      "tarde",
      "pronto",
    ]);
  });

  it("vencidos es lo que dice charge_status(); por vencer, el resto con deuda", () => {
    expect(dueCharges(filas, { establishmentId: null, state: "vencidos" }).map((f) => f.id)).toEqual(["antiguo", "tarde"]);
    expect(dueCharges(filas, { establishmentId: "b", state: "por_vencer" }).map((f) => f.id)).toEqual(["pronto"]);
  });
});
