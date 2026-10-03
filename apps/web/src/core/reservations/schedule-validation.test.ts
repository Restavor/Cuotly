import { describe, expect, it } from "vitest";
import { affectedReservations, setWeekdayOpen, validateSchedule } from "./schedule-validation";
import type { FutureReservation } from "./schedule-validation";
import type { Shift } from "./shifts";

const s = (id: string, weekdays: number[], start: string, last: string, end: string, active = true): Shift => ({ id, name: id, weekdays, startTime: start, lastBookingTime: last, endTime: end, capacity: 30, active });
const comida = s("comida", [2, 3, 4, 5, 6, 7], "13:00", "15:00", "16:00");
const cena = s("cena", [2, 3, 4, 5, 6], "20:00", "22:30", "23:30");
const res = (id: string, shiftId: string | null, date: string, status: FutureReservation["status"] = "confirmed"): FutureReservation => ({ id, shiftId, date, status });

describe("RN-RES-01 · guardar horarios", () => {
  it("RN-RES-01 · un conjunto correcto no tiene problemas", () => {
    expect(validateSchedule([comida, cena])).toEqual([]);
  });
  it("RN-RES-01 · apertura < última reserva ≤ cierre, y aforo > 0", () => {
    expect(validateSchedule([s("x", [2], "20:00", "20:00", "23:00")])).toContainEqual({ kind: "shift", shiftId: "x", issue: "start_not_before_last_booking" });
    expect(validateSchedule([s("x", [2], "20:00", "23:30", "23:00")])).toContainEqual({ kind: "shift", shiftId: "x", issue: "last_booking_after_end" });
  });
  it("RN-RES-01 · dos turnos del mismo día no se solapan en horas de reserva", () => {
    const issues = validateSchedule([comida, s("tarde", [2], "15:00", "17:00", "18:00")]);
    expect(issues).toEqual([{ kind: "overlap", shiftIds: ["comida", "tarde"] }]);
  });
  it("RN-RES-01 · turnos que se tocan en días distintos no se solapan", () => {
    expect(validateSchedule([s("a", [2], "13:00", "15:00", "16:00"), s("b", [3], "13:00", "15:00", "16:00")])).toEqual([]);
  });
  it("RN-RES-01 · un turno desactivado no se valida", () => {
    expect(validateSchedule([comida, s("viejo", [2], "13:00", "15:00", "16:00", false)])).toEqual([]);
  });
});

describe("RN-RES-01 · no quitar turnos con reservas futuras", () => {
  const futuras = [res("r1", "cena", "2026-10-02"), res("r2", "cena", "2026-10-03", "cancelled"), res("r3", "comida", "2026-10-04"), res("r4", null, "2026-10-04")];
  const base = { before: [comida, cena], closedBefore: [] as string[] };

  it("RN-RES-01 · quitar un turno afecta a sus reservas activas (la cancelada no cuenta)", () => {
    const out = affectedReservations({ ...base, after: [comida], closedAfter: [] }, futuras);
    expect(out.map((x) => x.id)).toEqual(["r1"]);
  });
  it("RN-RES-01 · desactivar un turno también", () => {
    expect(affectedReservations({ ...base, after: [comida, { ...cena, active: false }], closedAfter: [] }, futuras).map((x) => x.id)).toEqual(["r1"]);
  });
  it("RN-RES-01 · quitarle un día: solo las de ese día de la semana (02/10/2026 es viernes = 5)", () => {
    const sinViernes = { ...cena, weekdays: [2, 3, 4, 6] };
    expect(affectedReservations({ ...base, after: [comida, sinViernes], closedAfter: [] }, futuras).map((x) => x.id)).toEqual(["r1"]);
    const sinMartes = { ...cena, weekdays: [3, 4, 5, 6] };
    expect(affectedReservations({ ...base, after: [comida, sinMartes], closedAfter: [] }, futuras)).toEqual([]);
  });
  it("RN-RES-01 · marcar un día cerrado afecta a las reservas de ese día, no a las de siempre cerradas", () => {
    const out = affectedReservations({ ...base, after: [comida, cena], closedAfter: ["2026-10-04"] }, futuras);
    // r4 es de "Fuera de turno" (sin turno): cerrar el día también la afecta.
    expect(out.map((x) => x.id)).toEqual(["r3", "r4"]);
    expect(affectedReservations({ ...base, closedBefore: ["2026-10-04"], after: [comida, cena], closedAfter: ["2026-10-04"] }, futuras)).toEqual([]);
  });
  it("RN-RES-01 · cerrar un día afecta también a las de 'Fuera de turno' (sin turno)", () => {
    const out = affectedReservations({ ...base, after: [comida, cena], closedAfter: ["2026-10-04"] }, [res("fuera", null, "2026-10-04"), res("otra", null, "2026-10-05")]);
    expect(out.map((x) => x.id)).toEqual(["fuera"]);
  });
  it("RN-RES-01 · una reserva afectada por dos motivos se cuenta una sola vez", () => {
    const out = affectedReservations({ ...base, after: [comida], closedAfter: ["2026-10-02"] }, futuras);
    expect(out.filter((x) => x.id === "r1")).toHaveLength(1);
  });
  it("RN-RES-01 · 'Días que abrís' marca o desmarca un día en todos los turnos activos", () => {
    const sinDomingo = setWeekdayOpen([comida, cena], 7, false);
    expect(sinDomingo[0].weekdays).toEqual([2, 3, 4, 5, 6]);
    const conLunes = setWeekdayOpen([comida, cena], 1, true);
    expect(conLunes.map((x) => x.weekdays[0])).toEqual([1, 1]);
    expect(setWeekdayOpen([{ ...comida, active: false }], 1, true)[0].weekdays).toEqual(comida.weekdays);
  });
});
