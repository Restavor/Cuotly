import { describe, expect, it } from "vitest";
import type { AvailabilitySettings, OccupancyReservation } from "./availability";
import { decideBooking, lockedFields, pendingNeedsReminder, statusAfterEdit, touchesScheduling } from "./booking";
import type { BookingInput } from "./booking";
import type { Shift } from "./shifts";

const settings: AvailabilitySettings = {
  timeZone: "Europe/Madrid",
  slotInterval: 30,
  largeGroupThreshold: 9,
  minNoticeMinutes: 120,
  maxAdvanceDays: 60,
  serviceStatus: "active",
};
const cena: Shift = { id: "cena", name: "Cena", weekdays: [2, 3, 4, 5, 6, 7], startTime: "20:00", lastBookingTime: "22:30", endTime: "23:30", capacity: 60, active: true };
const NOW = new Date("2026-09-20T08:00:00Z");

const base = (over: Partial<BookingInput>): BookingInput => ({
  date: "2026-09-27",
  time: "21:00",
  partySize: 6,
  source: "manual",
  now: NOW,
  shifts: [cena],
  closedDates: [],
  reservations: [{ id: "x", shiftId: "cena", date: "2026-09-27", partySize: 57, status: "confirmed" } satisfies OccupancyReservation],
  settings,
  restaurant: { name: "Casa Pepe", localPhone: null, transferPhone: null },
  ...over,
});

describe("RN-RES-02 · quién cabe según el origen (aforo 60, ocupación 57, grupo de 6)", () => {
  it("RN-RES-02 · manual de 6 → aviso 'te pasas en 3', cuarta cena 63 de 60 si se fuerza", () => {
    const d = decideBooking(base({ source: "manual" }));
    expect(d).toMatchObject({ outcome: "needs_confirmation", overflowBy: 3, occupiedAfter: 63, capacity: 60 });
    const forced = decideBooking(base({ source: "manual", force: true }));
    expect(forced).toMatchObject({ outcome: "accepted", status: "confirmed", overCapacityBy: 3, capacityAfter: "over" });
  });
  it("RN-RES-02 · la misma desde el agente → full con la frase para el cliente", () => {
    const d = decideBooking(base({ source: "agent" }));
    expect(d).toMatchObject({ outcome: "rejected", reason: "full" });
    expect(d.outcome === "rejected" && d.message).toMatch(/no nos queda sitio para 6 personas/);
  });
  it("RN-RES-02 · y desde la web también", () => {
    expect(decideBooking(base({ source: "web" }))).toMatchObject({ outcome: "rejected", reason: "full" });
  });
  it("RN-RES-02 · desde plataforma se guarda y el turno queda 63/60 ('Aforo superado')", () => {
    expect(decideBooking(base({ source: "platform" }))).toMatchObject({ outcome: "accepted", status: "confirmed", shiftId: "cena", overCapacityBy: 3, capacityAfter: "over" });
  });
  it("RN-RES-02 · plataforma fuera de turno o en día cerrado entra con shiftId vacío ('Fuera de turno')", () => {
    expect(decideBooking(base({ source: "platform", time: "17:00" }))).toMatchObject({ outcome: "accepted", shiftId: null, outOfShift: true });
    expect(decideBooking(base({ source: "platform", closedDates: ["2026-09-27"] }))).toMatchObject({ outcome: "accepted", shiftId: null, outOfShift: true });
  });
  it("RN-RES-02 · editar: la reserva no cuenta contra sí misma", () => {
    const d = decideBooking(base({ source: "manual", partySize: 3, excludeReservationId: "x" }));
    expect(d.outcome).toBe("accepted");
  });
});

describe("RN-RES-03 · las manuales no se crean en fechas pasadas ni fuera de hueco", () => {
  it("RN-RES-03 · fecha pasada → past_date", () => {
    expect(decideBooking(base({ date: "2026-09-19", now: NOW, reservations: [] }))).toMatchObject({ outcome: "rejected", reason: "past_date" });
  });
  it("RN-RES-03 · día cerrado o hora que no es hueco → rechazada", () => {
    expect(decideBooking(base({ closedDates: ["2026-09-27"], reservations: [] }))).toMatchObject({ outcome: "rejected", reason: "closed_day" });
    expect(decideBooking(base({ time: "21:15", reservations: [] }))).toMatchObject({ outcome: "rejected", reason: "not_a_slot" });
  });
  it("RN-RES-03 · en pausa no se crea ninguna salvo la de plataforma", () => {
    const paused = { ...settings, serviceStatus: "paused" as const };
    expect(decideBooking(base({ settings: paused, reservations: [] }))).toMatchObject({ outcome: "rejected", reason: "service_paused" });
    expect(decideBooking(base({ settings: paused, source: "platform", reservations: [] })).outcome).toBe("accepted");
  });
});

describe("RN-RES-05 · grupos grandes", () => {
  it("RN-RES-05 · agente o web con personas ≥ umbral → pending (cuenta para el aforo)", () => {
    const d = decideBooking(base({ source: "agent", partySize: 9, reservations: [] }));
    expect(d).toMatchObject({ outcome: "accepted", status: "pending" });
    expect(decideBooking(base({ source: "web", partySize: 8, reservations: [] }))).toMatchObject({ status: "confirmed" });
  });
  it("RN-RES-05 · manual y plataforma → confirmed aunque sean grupo grande", () => {
    expect(decideBooking(base({ source: "manual", partySize: 12, reservations: [] }))).toMatchObject({ status: "confirmed" });
    expect(decideBooking(base({ source: "platform", partySize: 12, reservations: [] }))).toMatchObject({ status: "confirmed" });
  });
  it("RN-RES-05 · un pendiente sin respuesta se recuerda a las 2 horas, una sola vez, y nunca caduca", () => {
    const created = new Date("2026-09-26T10:00:00Z");
    expect(pendingNeedsReminder(created, null, new Date("2026-09-26T11:59:00Z"))).toBe(false);
    expect(pendingNeedsReminder(created, null, new Date("2026-09-26T12:00:00Z"))).toBe(true);
    expect(pendingNeedsReminder(created, new Date("2026-09-26T12:00:00Z"), new Date("2026-09-27T12:00:00Z"))).toBe(false);
  });
});

describe("RN-RES-07 · editar", () => {
  it("RN-RES-07 · cambiar fecha, hora o personas reaplica las reglas; el nombre o la nota no", () => {
    expect(touchesScheduling(["date"])).toBe(true);
    expect(touchesScheduling(["time"])).toBe(true);
    expect(touchesScheduling(["party_size"])).toBe(true);
    expect(touchesScheduling(["name", "phone", "notes", "language"])).toBe(false);
  });
  it("RN-RES-07 · el agente que sube una confirmada al umbral la deja pending", () => {
    expect(statusAfterEdit("confirmed", "agent", 9, 9)).toBe("pending");
    expect(statusAfterEdit("confirmed", "agent", 8, 9)).toBe("confirmed");
    expect(statusAfterEdit("confirmed", "manual", 12, 9)).toBe("confirmed");
  });
  it("RN-RES-07 · bajar una pendiente por debajo del umbral no la confirma sola", () => {
    expect(statusAfterEdit("pending", "agent", 4, 9)).toBe("pending");
    expect(statusAfterEdit("pending", "manual", 4, 9)).toBe("pending");
  });
  it("RN-RES-07 · plataforma sin conector que modifique: fecha, hora y personas bloqueadas; nombre y nota no", () => {
    expect(lockedFields("platform", null)).toEqual(["date", "time", "party_size"]);
    expect(lockedFields("platform", { canCancel: true, canModify: false })).toEqual(["date", "time", "party_size"]);
    expect(lockedFields("platform", { canCancel: true, canModify: true })).toEqual([]);
    expect(lockedFields("manual", null)).toEqual([]);
  });
});
