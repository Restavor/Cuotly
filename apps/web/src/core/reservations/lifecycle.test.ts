import { describe, expect, it } from "vitest";
import {
  canCancel,
  canChangeScheduling,
  canConfirm,
  canCreateReservations,
  canCustomerCancel,
  canMarkNoShow,
  canUndoNoShow,
  customerCancelDeadline,
  visitStats,
} from "./lifecycle";

const TZ = "Europe/Madrid";
// 26/09/2026 a las 21:00 en Madrid = 19:00 UTC.
const confirmed = { status: "confirmed" as const, date: "2026-09-26", time: "21:00" };

describe("RN-RES-09 · No vino", () => {
  it("RN-RES-09 · antes de la hora no se puede y dice desde cuándo", () => {
    const r = canMarkNoShow(confirmed, new Date("2026-09-26T18:59:00Z"), TZ);
    expect(r).toEqual({ ok: false, error: { error: "not_yet_started", availableFrom: "21:00" } });
  });
  it("RN-RES-09 · desde la hora sí, solo una confirmada", () => {
    expect(canMarkNoShow(confirmed, new Date("2026-09-26T19:00:00Z"), TZ).ok).toBe(true);
    for (const status of ["pending", "cancelled", "no_show"] as const) {
      expect(canMarkNoShow({ ...confirmed, status }, new Date("2026-09-26T23:00:00Z"), TZ)).toEqual({ ok: false, error: { error: "invalid_transition" } });
    }
  });
  it("RN-RES-09 · se deshace solo el mismo día, en la zona del restaurante", () => {
    const noShow = { ...confirmed, status: "no_show" as const };
    expect(canUndoNoShow(noShow, new Date("2026-09-26T21:30:00Z"), TZ).ok).toBe(true); // 23:30 en Madrid, aún 26
    expect(canUndoNoShow(noShow, new Date("2026-09-26T22:00:00Z"), TZ)).toEqual({ ok: false, error: { error: "not_same_day" } }); // 00:00 del 27
    expect(canUndoNoShow(confirmed, new Date("2026-09-26T21:00:00Z"), TZ)).toEqual({ ok: false, error: { error: "invalid_transition" } });
  });
  it("RN-RES-09 · 'Ha venido N veces · ha fallado M veces': 24 meses, sin la reserva abierta, sin canceladas ni pendientes", () => {
    const now = new Date("2026-09-26T12:00:00Z");
    const h = (id: string, status: "pending" | "confirmed" | "cancelled" | "no_show", startsAt: string) => ({ id, status, startsAt: new Date(startsAt) });
    const stats = visitStats(
      [
        h("a", "confirmed", "2026-08-01T19:00:00Z"),
        h("b", "confirmed", "2026-07-01T19:00:00Z"),
        h("c", "no_show", "2026-06-01T19:00:00Z"),
        h("d", "cancelled", "2026-05-01T19:00:00Z"),
        h("e", "pending", "2026-04-01T19:00:00Z"),
        h("f", "confirmed", "2024-01-01T19:00:00Z"), // fuera de 24 meses
        h("g", "confirmed", "2026-10-01T19:00:00Z"), // futura: todavía no ha venido
        h("self", "confirmed", "2026-03-01T19:00:00Z"), // la reserva abierta
      ],
      "self",
      now,
    );
    expect(stats).toEqual({ came: 2, failed: 1 });
  });
});

describe("RN-RES-08 · cancelar", () => {
  it("RN-RES-08 · se cancela o rechaza una pendiente o confirmada; una cancelada es final", () => {
    expect(canCancel("pending")).toBe(true);
    expect(canCancel("confirmed")).toBe(true);
    expect(canCancel("cancelled")).toBe(false);
    expect(canCancel("no_show")).toBe(false);
  });
  it("RN-RES-05 · solo se confirma una pendiente", () => {
    expect(canConfirm("pending")).toBe(true);
    expect(canConfirm("confirmed")).toBe(false);
  });
  it("RN-RES-08 · el cliente cancela hasta hora − plazo (120 min por defecto)", () => {
    expect(customerCancelDeadline(confirmed, 120, TZ)?.toISOString()).toBe("2026-09-26T17:00:00.000Z");
    expect(canCustomerCancel(confirmed, 120, new Date("2026-09-26T17:00:00Z"), TZ)).toBe(true);
    expect(canCustomerCancel(confirmed, 120, new Date("2026-09-26T17:01:00Z"), TZ)).toBe(false);
    expect(canCustomerCancel({ ...confirmed, status: "cancelled" }, 120, new Date("2026-09-20T00:00:00Z"), TZ)).toBe(false);
  });
});

describe("RN-RES-11 · con las reservas en pausa", () => {
  it("RN-RES-11 · no se crea ni se cambia fecha, hora o personas; sí se cancela, confirma o rechaza", () => {
    expect(canCreateReservations("paused")).toBe(false);
    expect(canChangeScheduling("paused")).toBe(false);
    expect(canCreateReservations("active")).toBe(true);
    expect(canCreateReservations("ending")).toBe(true);
    expect(canCancel("confirmed")).toBe(true);
    expect(canConfirm("pending")).toBe(true);
  });
});
