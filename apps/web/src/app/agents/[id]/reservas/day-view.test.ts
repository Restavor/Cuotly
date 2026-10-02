import { describe, expect, it } from "vitest";

import type { Shift } from "@/core/reservations/shifts";
import type { ReservationRecord } from "@/services/reservations-gateway";

import { buildDayView, cancelledNote } from "./day-view";

const TZ = "Europe/Madrid";
const EST = "e5200000-0000-0000-0000-000000000001";

const comida: Shift = { id: "comida", name: "Comida", weekdays: [2, 3, 4, 5, 6, 7], startTime: "13:00", lastBookingTime: "15:00", endTime: "16:00", capacity: 40, active: true };
const cena: Shift = { id: "cena", name: "Cena", weekdays: [2, 3, 4, 5, 6, 7], startTime: "20:00", lastBookingTime: "22:30", endTime: "23:30", capacity: 60, active: true };

const rec = (over: Partial<ReservationRecord> & Pick<ReservationRecord, "id" | "customerName">): ReservationRecord => ({
  shiftId: "cena",
  date: "2026-09-26",
  time: "21:00",
  startsAt: new Date("2026-09-26T19:00:00Z"),
  partySize: 2,
  phoneE164: null,
  email: null,
  notes: null,
  language: "es",
  status: "confirmed",
  source: "manual",
  platformName: null,
  isNew: false,
  duplicate: false,
  cancelReason: null,
  cancelledAt: null,
  pendingPlatformCancel: false,
  ...over,
});

const view = (records: ReservationRecord[], over: { closedDates?: string[]; date?: string } = {}) =>
  buildDayView({ establishmentId: EST, records, shifts: [comida, cena], closedDates: over.closedDates ?? [], date: over.date ?? "2026-09-26", timeZone: TZ, largeGroupThreshold: 9 });

describe("RES-01 · lo que enseña Hoy un día", () => {
  it("RES-01 · un bloque por turno que abre ese día, aunque no tenga reservas", () => {
    const v = view([]);
    expect(v.blocks.map((b) => b.shift?.name)).toEqual(["Comida", "Cena"]);
    expect(v.blocks.map((b) => b.shift?.range)).toEqual(["13:00 – 16:00", "20:00 – 23:30"]);
    expect(v.summary).toEqual({ reservations: 0, people: 0, pending: 0 });
    expect(v.closed).toBe(false);
  });
  it("RES-01 · las filas van por turno y por hora, y la ocupación es la del día entero", () => {
    const v = view([
      rec({ id: "a", customerName: "A", shiftId: "cena", time: "21:30", partySize: 4 }),
      rec({ id: "b", customerName: "B", shiftId: "cena", time: "20:30", partySize: 3 }),
      rec({ id: "c", customerName: "C", shiftId: "comida", time: "14:00", partySize: 5 }),
    ]);
    expect(v.blocks[1].rows.map((r) => r.id)).toEqual(["b", "a"]);
    expect(v.blocks[1].occupied).toBe(7);
    expect(v.blocks[0].occupied).toBe(5);
    expect(v.summary).toEqual({ reservations: 3, people: 12, pending: 0 });
  });
  it("RN-RES-02 · una plataforma sin turno sale en «Fuera de turno», con su aviso", () => {
    const v = view([rec({ id: "x", customerName: "X", shiftId: null, source: "platform", platformName: "TheFork", time: "18:00" })]);
    expect(v.blocks.at(-1)?.shift).toBeNull();
    expect(v.blocks.at(-1)?.rows.map((r) => r.id)).toEqual(["x"]);
  });
  it("RN-RES-01 · un día cerrado a propósito no tiene turnos, y un día de la semana sin turnos tampoco", () => {
    expect(view([], { closedDates: ["2026-09-26"] }).closed).toBe(true);
    expect(view([], { closedDates: ["2026-09-26"] }).blocks).toEqual([]);
    expect(view([], { date: "2026-09-28" }).closed).toBe(true); // lunes
  });
  it("RN-RES-05 · un grupo pendiente de 9 o más sale como «Grupo grande»; uno confirmado, no", () => {
    const v = view([
      rec({ id: "p", customerName: "P", status: "pending", partySize: 12, source: "agent" }),
      rec({ id: "q", customerName: "Q", status: "confirmed", partySize: 12 }),
    ]);
    const rows = Object.fromEntries(v.blocks[1].rows.map((r) => [r.id, r]));
    expect(rows.p.largeGroup).toBe(true);
    expect(rows.q.largeGroup).toBe(false);
  });
  it("RN-RES-06 · una posible duplicada trae la otra del par para «No es duplicada»", () => {
    const v = view([
      rec({ id: "d1", customerName: "Laura", phoneE164: "+34600000001", duplicate: true, time: "21:00" }),
      rec({ id: "d2", customerName: "Laura V.", phoneE164: "+34600000001", duplicate: true, time: "22:00" }),
      rec({ id: "otra", customerName: "Otra", phoneE164: "+34600000002" }),
    ]);
    const rows = Object.fromEntries(v.blocks[1].rows.map((r) => [r.id, r]));
    expect(rows.d1.duplicatePartnerId).toBe("d2");
    expect(rows.d2.duplicatePartnerId).toBe("d1");
    expect(rows.otra.duplicatePartnerId).toBeNull();
  });
  it("RES-01 · los contadores y el resumen no cuentan canceladas ni «No vino»", () => {
    const v = view([
      rec({ id: "1", customerName: "1", source: "web" }),
      rec({ id: "2", customerName: "2", source: "web", status: "no_show" }),
      rec({ id: "3", customerName: "3", source: "agent", status: "cancelled", cancelReason: "customer", cancelledAt: new Date("2026-09-26T09:20:00Z") }),
    ]);
    expect(v.counters).toEqual({ all: 1, agent: 0, platform: 0, web: 1, manual: 0 });
  });
});

describe("RES-01 · «Cancelada por X · 11:20»", () => {
  const cancelada = (reason: string | null, platformName: string | null = null) =>
    rec({ id: "c", customerName: "C", status: "cancelled", cancelReason: reason, platformName, source: platformName ? "platform" : "manual", cancelledAt: new Date("2026-09-26T09:20:00Z") });
  it("RES-01 · dice quién y a qué hora, en la zona del restaurante, sin nombres de personas", () => {
    expect(cancelledNote(cancelada("platform", "CoverManager"), TZ)).toBe("Cancelada por CoverManager · 11:20");
    expect(cancelledNote(cancelada("customer"), TZ)).toBe("Cancelada por el cliente · 11:20");
    expect(cancelledNote(cancelada("error"), TZ)).toBe("Cancelada por error al apuntarla · 11:20");
    expect(cancelledNote(cancelada("rejected"), TZ)).toBe("Grupo rechazado · 11:20");
    expect(cancelledNote(cancelada(null), TZ)).toBe("Cancelada · 11:20");
  });
  it("RES-01 · una reserva que no está cancelada no lleva nota", () => {
    expect(cancelledNote(rec({ id: "k", customerName: "K" }), TZ)).toBeNull();
  });
});
