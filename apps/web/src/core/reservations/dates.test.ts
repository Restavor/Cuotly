import { describe, expect, it } from "vitest";
import {
  addDays,
  isoWeekday,
  isValidLocalDate,
  isValidLocalTime,
  localDateOf,
  localDateTimeOf,
  localToUtc,
  minutesOfDay,
  timeFromMinutes,
} from "./dates";

const MADRID = "Europe/Madrid";

function utc(date: string, time: string, zone = MADRID): string {
  const r = localToUtc(date, time, zone);
  if (!r.ok) throw new Error(`no se esperaba ${r.error}`);
  return r.value.toISOString();
}

describe("RN-RES-01 · fechas en la zona del restaurante", () => {
  it("RN-RES-01 · el «hoy» de un restaurante sale de su zona, no de UTC", () => {
    // A las 21:59 UTC del 26/09/2026 en Madrid son las 23:59 del 26/09 (verano, UTC+2).
    expect(localDateOf(new Date("2026-09-26T21:59:00Z"), MADRID)).toBe("2026-09-26");
    // Un minuto después ya es el 27/09 en Madrid, aunque en UTC siga siendo el 26.
    expect(localDateOf(new Date("2026-09-26T22:00:00Z"), MADRID)).toBe("2026-09-27");
    // A las 23:30 UTC ya es la 01:30 del día siguiente.
    expect(localDateTimeOf(new Date("2026-09-26T23:30:00Z"), MADRID)).toEqual({ date: "2026-09-27", time: "01:30" });
  });

  it("RN-RES-01 · la medianoche local es 00:00, nunca 24:00", () => {
    expect(localDateTimeOf(new Date("2026-09-26T22:00:00Z"), MADRID)).toEqual({ date: "2026-09-27", time: "00:00" });
  });

  it("RN-RES-01 · la hora de una reserva se guarda en UTC con el desfase de ese día (verano e invierno)", () => {
    // 26/09/2026 es verano (CEST, UTC+2): las 21:00 son las 19:00 UTC.
    expect(utc("2026-09-26", "21:00")).toBe("2026-09-26T19:00:00.000Z");
    // 26/10/2026 es invierno (CET, UTC+1): las 21:00 son las 20:00 UTC.
    expect(utc("2026-10-26", "21:00")).toBe("2026-10-26T20:00:00.000Z");
    // Canarias va una hora por detrás de la península.
    expect(utc("2026-09-26", "21:00", "Atlantic/Canary")).toBe("2026-09-26T20:00:00.000Z");
  });

  it("RN-RES-01 · el salto de primavera (29/03/2026): las 02:30 no existen y se rechazan", () => {
    const r = localToUtc("2026-03-29", "02:30", MADRID);
    expect(r).toEqual({ ok: false, error: "nonexistent_local_time" });
    // Una hora antes y una hora después, sí: con el desfase de cada lado del salto.
    expect(utc("2026-03-29", "01:30")).toBe("2026-03-29T00:30:00.000Z"); // CET, UTC+1
    expect(utc("2026-03-29", "03:30")).toBe("2026-03-29T01:30:00.000Z"); // CEST, UTC+2
  });

  it("RN-RES-01 · el cambio de otoño (25/10/2026): las 02:30 ocurren dos veces y vale la primera", () => {
    // La primera, en horario de verano (UTC+2): 00:30 UTC. La segunda sería 01:30 UTC.
    expect(utc("2026-10-25", "02:30")).toBe("2026-10-25T00:30:00.000Z");
    expect(utc("2026-10-25", "01:30")).toBe("2026-10-24T23:30:00.000Z");
    // Pasada la repetición, ya en invierno (UTC+1).
    expect(utc("2026-10-25", "03:30")).toBe("2026-10-25T02:30:00.000Z");
  });

  it("RN-RES-01 · el día del cambio de otoño dura 25 horas y el de primavera, 23", () => {
    const horas = (de: string, a: string) =>
      (new Date(utc(a, "00:00")).getTime() - new Date(utc(de, "00:00")).getTime()) / 3_600_000;
    expect(horas("2026-10-25", "2026-10-26")).toBe(25);
    expect(horas("2026-03-29", "2026-03-30")).toBe(23);
    expect(horas("2026-09-26", "2026-09-27")).toBe(24);
  });

  it("RN-RES-01 · una fecha o una hora imposibles se rechazan con su motivo", () => {
    expect(localToUtc("2026-02-30", "21:00", MADRID)).toEqual({ ok: false, error: "invalid_date" });
    expect(localToUtc("26/09/2026", "21:00", MADRID)).toEqual({ ok: false, error: "invalid_date" });
    expect(localToUtc("2026-09-26", "25:00", MADRID)).toEqual({ ok: false, error: "invalid_time" });
    expect(localToUtc("2026-09-26", "9:00", MADRID)).toEqual({ ok: false, error: "invalid_time" });
  });

  it("RN-RES-01 · ida y vuelta: la hora local de un instante vuelve a dar el mismo instante", () => {
    for (const [date, time] of [
      ["2026-01-15", "13:00"],
      ["2026-03-29", "03:00"],
      ["2026-07-01", "22:30"],
      ["2026-10-25", "03:00"],
      ["2026-12-31", "23:30"],
    ]) {
      const instant = new Date(utc(date, time));
      expect(localDateTimeOf(instant, MADRID)).toEqual({ date, time });
    }
  });
});

describe("RN-RES-01 · calendario puro", () => {
  it("RN-RES-01 · valida fechas y horas locales", () => {
    expect(isValidLocalDate("2026-09-26")).toBe(true);
    expect(isValidLocalDate("2028-02-29")).toBe(true);
    expect(isValidLocalDate("2026-02-29")).toBe(false);
    expect(isValidLocalDate("2026-13-01")).toBe(false);
    expect(isValidLocalTime("00:00")).toBe(true);
    expect(isValidLocalTime("23:59")).toBe(true);
    expect(isValidLocalTime("24:00")).toBe(false);
    expect(isValidLocalTime("12:60")).toBe(false);
  });

  it("RN-RES-01 · suma días de calendario cruzando mes, año y febrero bisiesto", () => {
    expect(addDays("2026-09-26", 1)).toBe("2026-09-27");
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-10-25", -1)).toBe("2026-10-24");
    expect(addDays("2026-09-26", 14)).toBe("2026-10-10");
  });

  it("RN-RES-01 · el día de la semana va de 1 (lunes) a 7 (domingo)", () => {
    expect(isoWeekday("2026-09-26")).toBe(6); // sábado
    expect(isoWeekday("2026-09-27")).toBe(7); // domingo
    expect(isoWeekday("2026-09-28")).toBe(1); // lunes
    expect(isoWeekday("2026-10-12")).toBe(1); // 12/10/2026, un lunes
  });

  it("RN-RES-01 · minutos del día y de vuelta", () => {
    expect(minutesOfDay("00:00")).toBe(0);
    expect(minutesOfDay("21:30")).toBe(1290);
    expect(timeFromMinutes(1290)).toBe("21:30");
    expect(timeFromMinutes(0)).toBe("00:00");
    expect(() => minutesOfDay("9:00")).toThrow(RangeError);
    expect(() => timeFromMinutes(1440)).toThrow(RangeError);
  });
});
