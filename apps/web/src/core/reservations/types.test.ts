import { describe, expect, it } from "vitest";
import {
  countsTowardCapacity,
  isValidTransition,
  RESERVATION_ORIGINS,
  RESERVATION_STATUSES,
  RESERVATION_TRANSITIONS,
} from "./types";

describe("RN-RES-07 · orígenes y estados de una reserva", () => {
  it("RN-RES-07 · hay cuatro orígenes y cuatro estados", () => {
    expect([...RESERVATION_ORIGINS]).toEqual(["agent", "platform", "web", "manual"]);
    expect([...RESERVATION_STATUSES]).toEqual(["pending", "confirmed", "cancelled", "no_show"]);
  });

  it("RN-RES-07 · las transiciones del PRD (sin sus condiciones, que son de la Fase C)", () => {
    expect(isValidTransition("pending", "confirmed")).toBe(true); // Confirmar
    expect(isValidTransition("pending", "cancelled")).toBe(true); // Rechazar
    expect(isValidTransition("confirmed", "cancelled")).toBe(true);
    expect(isValidTransition("confirmed", "no_show")).toBe(true);
    expect(isValidTransition("no_show", "confirmed")).toBe(true); // deshacer
    expect(isValidTransition("confirmed", "pending")).toBe(true); // el agente sube al umbral
  });

  it("RN-RES-07 · cualquier otra es un error, y una cancelada no vuelve", () => {
    expect(isValidTransition("pending", "no_show")).toBe(false);
    expect(isValidTransition("no_show", "cancelled")).toBe(false);
    expect(isValidTransition("no_show", "pending")).toBe(false);
    expect(RESERVATION_TRANSITIONS.cancelled).toEqual([]);
    for (const estado of RESERVATION_STATUSES) expect(isValidTransition(estado, estado)).toBe(false);
  });

  it("RN-RES-02 · solo las pendientes y las confirmadas cuentan para el aforo", () => {
    expect(countsTowardCapacity("pending")).toBe(true);
    expect(countsTowardCapacity("confirmed")).toBe(true);
    expect(countsTowardCapacity("cancelled")).toBe(false);
    expect(countsTowardCapacity("no_show")).toBe(false);
  });
});
