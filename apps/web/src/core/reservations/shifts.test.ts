import { describe, expect, it } from "vitest";
import {
  classifyRequestedTime,
  isOpenDay,
  overlappingShifts,
  shiftsOverlap,
  slotsOfDay,
  slotsOfShift,
  validateShift,
  type Shift,
} from "./shifts";

function turno(parcial: Partial<Shift> & Pick<Shift, "id" | "name">): Shift {
  return {
    weekdays: [2, 3, 4, 5, 6, 7],
    startTime: "20:00",
    endTime: "23:30",
    lastBookingTime: "22:30",
    capacity: 60,
    active: true,
    ...parcial,
  };
}

// Casa Pepe (PRD §16): cierra los lunes; Comida 13:00–16:00 (última 15:00, aforo 40) y
// Cena 20:00–23:30 (última 22:30, aforo 60) de martes a domingo.
const comida = turno({ id: "comida", name: "Comida", startTime: "13:00", endTime: "16:00", lastBookingTime: "15:00", capacity: 40 });
const cena = turno({ id: "cena", name: "Cena" });
const casaPepe = [comida, cena];

// Taberna Sol (PRD §16): dos tandas de martes a sábado.
const tanda1 = turno({ id: "t1", name: "Cena 1ª tanda", weekdays: [2, 3, 4, 5, 6], startTime: "20:00", endTime: "21:30", lastBookingTime: "21:00", capacity: 30 });
const tanda2 = turno({ id: "t2", name: "Cena 2ª tanda", weekdays: [2, 3, 4, 5, 6], startTime: "22:00", endTime: "23:30", lastBookingTime: "23:00", capacity: 30 });

describe("RN-RES-01 · un turno es válido", () => {
  it("RN-RES-01 · la cena y la comida de Casa Pepe son válidas", () => {
    expect(validateShift(cena)).toEqual([]);
    expect(validateShift(comida)).toEqual([]);
  });

  it("RN-RES-01 · apertura antes de la última hora de reserva, y esta no pasa del cierre", () => {
    expect(validateShift(turno({ id: "x", name: "X", startTime: "20:00", lastBookingTime: "20:00" }))).toContain("start_not_before_last_booking");
    expect(validateShift(turno({ id: "x", name: "X", startTime: "23:00", lastBookingTime: "22:00" }))).toContain("start_not_before_last_booking");
    expect(validateShift(turno({ id: "x", name: "X", lastBookingTime: "23:45" }))).toContain("last_booking_after_end");
    // La última hora puede ser el propio cierre.
    expect(validateShift(turno({ id: "x", name: "X", lastBookingTime: "23:30" }))).toEqual([]);
  });

  it("RN-RES-01 · un turno no cruza la medianoche: un cierre «antes» de la apertura no vale", () => {
    expect(validateShift(turno({ id: "x", name: "X", startTime: "22:00", lastBookingTime: "23:00", endTime: "01:00" }))).toContain("last_booking_after_end");
  });

  it("RN-RES-01 · nombre, días y aforo", () => {
    expect(validateShift(turno({ id: "x", name: "  " }))).toContain("name_empty");
    expect(validateShift(turno({ id: "x", name: "X", weekdays: [] }))).toContain("weekdays_empty");
    expect(validateShift(turno({ id: "x", name: "X", weekdays: [0, 8] }))).toContain("weekday_out_of_range");
    expect(validateShift(turno({ id: "x", name: "X", capacity: 0 }))).toContain("capacity_not_positive");
    expect(validateShift(turno({ id: "x", name: "X", startTime: "25:00" }))).toEqual(["time_invalid"]);
  });
});

describe("RN-RES-01 · huecos", () => {
  it("RN-RES-01 · la cena 20:00–23:30, última 22:30, cada 30 da seis huecos: 20:00 a 22:30", () => {
    expect(slotsOfShift(cena, 30)).toEqual(["20:00", "20:30", "21:00", "21:30", "22:00", "22:30"]);
  });

  it("RN-RES-01 · cada 15 minutos hay once huecos y la comida, cinco cada 30", () => {
    expect(slotsOfShift(cena, 15)).toHaveLength(11);
    expect(slotsOfShift(cena, 15).slice(0, 3)).toEqual(["20:00", "20:15", "20:30"]);
    expect(slotsOfShift(comida, 30)).toEqual(["13:00", "13:30", "14:00", "14:30", "15:00"]);
  });

  it("RN-RES-01 · las dos tandas de Taberna Sol son huecos distintos", () => {
    expect(slotsOfShift(tanda1, 30)).toEqual(["20:00", "20:30", "21:00"]);
    expect(slotsOfShift(tanda2, 30)).toEqual(["22:00", "22:30", "23:00"]);
  });

  it("RN-RES-01 · un sábado con comida y cena tiene sus once huecos, por orden de hora y con su turno", () => {
    const huecos = slotsOfDay("2026-09-26", casaPepe, [], 30); // sábado
    expect(huecos).toHaveLength(11);
    expect(huecos[0]).toEqual({ time: "13:00", shiftId: "comida" });
    expect(huecos[4]).toEqual({ time: "15:00", shiftId: "comida" });
    expect(huecos[5]).toEqual({ time: "20:00", shiftId: "cena" });
    expect(huecos.map((h) => h.time)).toEqual([...huecos.map((h) => h.time)].sort());
  });

  it("RN-RES-01 · un día cerrado no tiene huecos: el lunes sin turnos y un día cerrado a propósito", () => {
    expect(slotsOfDay("2026-09-28", casaPepe, [], 30)).toEqual([]); // lunes
    expect(isOpenDay("2026-09-28", casaPepe, [])).toBe(false);
    expect(isOpenDay("2026-09-29", casaPepe, [])).toBe(true); // martes
    expect(isOpenDay("2026-10-13", casaPepe, ["2026-10-13"])).toBe(false); // martes cerrado
    expect(slotsOfDay("2026-10-13", casaPepe, ["2026-10-13"], 30)).toEqual([]);
  });

  it("RN-RES-01 · un turno desactivado no abre el día", () => {
    expect(isOpenDay("2026-09-29", [{ ...cena, active: false }], [])).toBe(false);
    expect(slotsOfDay("2026-09-29", [{ ...cena, active: false }, comida], [], 30)).toHaveLength(5);
  });

  it("RN-RES-01 · una fecha que no existe no está abierta", () => {
    expect(isOpenDay("2026-02-30", casaPepe, [])).toBe(false);
  });

  it("RN-RES-01 · la hora pedida: hueco, día cerrado o una hora que no es hueco", () => {
    // 21:15 con huecos cada 30 no es un hueco (not_a_slot)…
    expect(classifyRequestedTime("2026-09-26", "21:15", casaPepe, [], 30)).toEqual({ status: "not_a_slot" });
    // …pero con huecos cada 15 sí.
    expect(classifyRequestedTime("2026-09-26", "21:15", casaPepe, [], 15)).toEqual({ status: "slot", shiftId: "cena" });
    expect(classifyRequestedTime("2026-09-26", "21:00", casaPepe, [], 30)).toEqual({ status: "slot", shiftId: "cena" });
    // Entre turnos, tampoco: a las 18:00 no se reserva.
    expect(classifyRequestedTime("2026-09-26", "18:00", casaPepe, [], 30)).toEqual({ status: "not_a_slot" });
    // La última hora de reserva sí; pasada, no.
    expect(classifyRequestedTime("2026-09-26", "22:30", casaPepe, [], 30).status).toBe("slot");
    expect(classifyRequestedTime("2026-09-26", "23:00", casaPepe, [], 30).status).toBe("not_a_slot");
    // El lunes es un día cerrado, sea cual sea la hora.
    expect(classifyRequestedTime("2026-09-28", "21:00", casaPepe, [], 30)).toEqual({ status: "closed_day" });
  });
});

describe("RN-RES-01 · turnos que no se solapan", () => {
  it("RN-RES-01 · las dos tandas de Taberna Sol y la comida y cena de Casa Pepe no se solapan", () => {
    expect(shiftsOverlap(tanda1, tanda2)).toBe(false);
    expect(overlappingShifts([tanda1, tanda2])).toEqual([]);
    expect(overlappingShifts(casaPepe)).toEqual([]);
  });

  it("RN-RES-01 · dos turnos del mismo día cuyas horas de reserva se tocan se solapan", () => {
    const otro = turno({ id: "otro", name: "Otro", startTime: "21:00", lastBookingTime: "22:00", endTime: "23:00" });
    expect(shiftsOverlap(cena, otro)).toBe(true);
    // Tocarse en el extremo también cuenta: el mismo hueco no puede ser de dos turnos.
    const pegado = turno({ id: "pegado", name: "Pegado", startTime: "22:30", lastBookingTime: "23:00", endTime: "23:30" });
    expect(shiftsOverlap(cena, pegado)).toBe(true);
    expect(overlappingShifts([cena, otro]).map(([a, b]) => [a.id, b.id])).toEqual([["cena", "otro"]]);
  });

  it("RN-RES-01 · si no comparten día de la semana no se solapan, y un turno inactivo no cuenta", () => {
    const domingo = turno({ id: "dom", name: "Domingo", weekdays: [7], startTime: "20:00", lastBookingTime: "22:00" });
    const lunes = turno({ id: "lun", name: "Lunes", weekdays: [1], startTime: "20:00", lastBookingTime: "22:00" });
    expect(shiftsOverlap(domingo, lunes)).toBe(false);
    const inactivo = turno({ id: "off", name: "Off", active: false });
    expect(overlappingShifts([cena, inactivo])).toEqual([]);
  });
});
