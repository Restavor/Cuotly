import { describe, expect, it } from "vitest";
import {
  canCancel,
  canChangeScheduling,
  canCloseByHand,
  canConfirm,
  canCreateReservations,
  canCustomerCancel,
  canMarkNoShow,
  canReactivateClosed,
  canRequestCancellation,
  canUndoCancellation,
  canUndoNoShow,
  customerCancelDeadline,
  daysLeftOfGrace,
  daysLeftToDownload,
  graceDeadline,
  isLifecycleSweepHour,
  purgeDate,
  showsPausedBar,
  showsPaymentBar,
  sweepOutcome,
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

// ---------------------------------------------------------------------------
// RN-RES-11 · el ciclo de vida del servicio (los números de la migración 174)
// ---------------------------------------------------------------------------
describe("RN-RES-11 · margen y pausa", () => {
  const due = new Date("2026-10-01T08:00:00Z");

  it("RN-RES-11 · 7 días desde el vencimiento más antiguo", () => {
    expect(graceDeadline(due).toISOString()).toBe("2026-10-08T08:00:00.000Z");
    expect(graceDeadline(due, 3).toISOString()).toBe("2026-10-04T08:00:00.000Z");
  });

  it("RN-RES-11 · «quedan N días»: enteros, hacia arriba, nunca negativos", () => {
    expect(daysLeftOfGrace(due, new Date("2026-10-01T08:00:00Z"))).toBe(7);
    expect(daysLeftOfGrace(due, new Date("2026-10-02T09:00:00Z"))).toBe(6);
    expect(daysLeftOfGrace(due, new Date("2026-10-07T08:00:00Z"))).toBe(1);
    expect(daysLeftOfGrace(due, new Date("2026-10-08T08:00:00Z"))).toBe(0);
    expect(daysLeftOfGrace(due, new Date("2026-10-20T08:00:00Z"))).toBe(0);
  });

  it("RN-RES-11 · activa con un cobro vencido pasa a past_due; con la deuda saldada, no", () => {
    const base = { status: "active", endingAt: null, closedAt: null, dataPurged: false };
    expect(sweepOutcome({ ...base, overdueSince: due }, new Date("2026-10-02T08:00:00Z"))).toEqual({ status: "past_due", purge: false });
    expect(sweepOutcome({ ...base, overdueSince: null }, new Date("2026-10-02T08:00:00Z"))).toEqual({ status: "active", purge: false });
  });

  it("RN-RES-11 · past_due pasa a paused justo a los 7 días, no antes", () => {
    const base = { status: "past_due", endingAt: null, closedAt: null, dataPurged: false, overdueSince: due };
    expect(sweepOutcome(base, new Date("2026-10-08T07:59:00Z")).status).toBe("past_due");
    expect(sweepOutcome(base, new Date("2026-10-08T08:00:00Z")).status).toBe("paused");
  });

  it("RN-RES-11 · una activa que ya pasó el margen cruza past_due y paused en el mismo barrido", () => {
    const base = { status: "active", endingAt: null, closedAt: null, dataPurged: false, overdueSince: due };
    expect(sweepOutcome(base, new Date("2026-10-09T08:00:00Z")).status).toBe("paused");
  });

  it("RN-RES-11 · past_due con la deuda saldada vuelve a active", () => {
    expect(sweepOutcome({ status: "past_due", overdueSince: null, endingAt: null, closedAt: null, dataPurged: false }, new Date()).status).toBe("active");
  });

  it("RN-RES-11 · el barrido nunca saca a paused por sí solo: la pausa no termina sola", () => {
    const paused = { status: "paused", endingAt: null, closedAt: null, dataPurged: false, overdueSince: due };
    expect(sweepOutcome(paused, new Date("2027-01-01T00:00:00Z")).status).toBe("paused");
  });

  it("RN-RES-11 · approved_pending_payment no se barre", () => {
    const s = { status: "approved_pending_payment", overdueSince: due, endingAt: null, closedAt: null, dataPurged: false };
    expect(sweepOutcome(s, new Date("2027-01-01T00:00:00Z"))).toEqual({ status: "approved_pending_payment", purge: false });
  });
});

describe("RN-RES-11 · baja, cierre y borrado", () => {
  const endingAt = new Date("2026-11-01T00:00:00Z");

  it("RN-RES-11 · ending pasa a closed al acabar el periodo pagado", () => {
    const s = { status: "ending", overdueSince: null, endingAt, closedAt: null, dataPurged: false };
    expect(sweepOutcome(s, new Date("2026-10-31T23:59:00Z"))).toEqual({ status: "ending", purge: false });
    expect(sweepOutcome(s, endingAt)).toEqual({ status: "closed", purge: false });
  });

  it("RN-RES-11 · cerrada, a los 30 días se anonimiza y no antes", () => {
    const closedAt = new Date("2026-11-01T00:00:00Z");
    const s = { status: "closed", overdueSince: null, endingAt: null, closedAt, dataPurged: false };
    expect(purgeDate(closedAt).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(sweepOutcome(s, new Date("2026-11-30T23:59:00Z")).purge).toBe(false);
    expect(sweepOutcome(s, new Date("2026-12-01T00:00:00Z")).purge).toBe(true);
    expect(sweepOutcome({ ...s, dataPurged: true }, new Date("2027-06-01T00:00:00Z")).purge).toBe(false);
  });

  it("RN-RES-11 · días que quedan para descargar", () => {
    const closedAt = new Date("2026-11-01T00:00:00Z");
    expect(daysLeftToDownload(closedAt, new Date("2026-11-01T00:00:00Z"))).toBe(30);
    expect(daysLeftToDownload(closedAt, new Date("2026-11-24T00:00:00Z"))).toBe(7);
    expect(daysLeftToDownload(closedAt, new Date("2026-12-05T00:00:00Z"))).toBe(0);
  });

  it("RN-RES-11 · quién puede qué en cada estado", () => {
    for (const ok of ["active", "past_due", "paused"]) expect(canRequestCancellation(ok)).toBe(true);
    for (const no of ["approved_pending_payment", "ending", "closed"]) expect(canRequestCancellation(no)).toBe(false);

    expect(canUndoCancellation("ending", endingAt, new Date("2026-10-31T00:00:00Z"))).toBe(true);
    expect(canUndoCancellation("ending", endingAt, endingAt)).toBe(false);
    expect(canUndoCancellation("active", null, new Date())).toBe(false);

    expect(canCloseByHand("paused")).toBe(true);
    for (const no of ["active", "past_due", "ending", "closed"]) expect(canCloseByHand(no)).toBe(false);

    const closedAt = new Date("2026-11-01T00:00:00Z");
    expect(canReactivateClosed("closed", closedAt, false, new Date("2026-11-30T00:00:00Z"))).toBe(true);
    expect(canReactivateClosed("closed", closedAt, false, new Date("2026-12-01T00:00:00Z"))).toBe(false);
    expect(canReactivateClosed("closed", closedAt, true, new Date("2026-11-02T00:00:00Z"))).toBe(false);
    expect(canReactivateClosed("paused", null, false, new Date())).toBe(false);
  });

  it("RN-RES-11 · las barras de Hoy salen solo en su estado", () => {
    expect(showsPaymentBar("past_due")).toBe(true);
    expect(showsPaymentBar("paused")).toBe(false);
    expect(showsPausedBar("paused")).toBe(true);
    expect(showsPausedBar("past_due")).toBe(false);
  });
});

describe("RN-RES-11 · la hora del barrido diario", () => {
  it("RN-RES-11 · 08:00 de Madrid, en verano (UTC+2) y en invierno (UTC+1)", () => {
    expect(isLifecycleSweepHour(new Date("2026-07-15T06:00:00Z"), "Europe/Madrid")).toBe(true);
    expect(isLifecycleSweepHour(new Date("2026-07-15T07:00:00Z"), "Europe/Madrid")).toBe(false);
    expect(isLifecycleSweepHour(new Date("2026-12-15T07:00:00Z"), "Europe/Madrid")).toBe(true);
    expect(isLifecycleSweepHour(new Date("2026-12-15T06:00:00Z"), "Europe/Madrid")).toBe(false);
  });
});
