import { describe, expect, it } from "vitest";
import {
  isValidLocalDate,
  isValidLocalTime,
  dayDiff,
  isoWeekday,
  localDateOf,
  localDateTimeOf,
  tryLocalDateOf,
  utcOffsetMinutes,
  zonedTimeToUtc,
} from "./local-time.ts";

const MADRID = "Europe/Madrid";

/*
 * Los valores esperados salen de PostgreSQL (`(fecha + hora) at time zone 'Europe/Madrid'`), el mismo cálculo que usa
 * `menu_publish_by_at` en la base. Contrastados el 03/10/2026 en «Restavor pruebas» (solo cálculo, sin leer tablas).
 */
describe("local-time · zonedTimeToUtc contra PostgreSQL (Europe/Madrid)", () => {
  const casos: [string, [number, number, number, number, number], string][] = [
    ["invierno 07:00 (CET)", [2026, 2, 11, 7, 0], "2026-02-11T06:00:00.000Z"],
    ["verano 07:00 (CEST)", [2026, 6, 11, 7, 0], "2026-06-11T05:00:00.000Z"],
    ["sábado antes del cambio de marzo", [2026, 3, 28, 7, 0], "2026-03-28T06:00:00.000Z"],
    ["domingo del cambio de marzo", [2026, 3, 29, 7, 0], "2026-03-29T05:00:00.000Z"],
    ["lunes después del cambio de marzo", [2026, 3, 30, 7, 0], "2026-03-30T05:00:00.000Z"],
    ["sábado antes del cambio de octubre", [2026, 10, 24, 7, 0], "2026-10-24T05:00:00.000Z"],
    ["domingo del cambio de octubre", [2026, 10, 25, 7, 0], "2026-10-25T06:00:00.000Z"],
    ["lunes después del cambio de octubre", [2026, 10, 26, 7, 0], "2026-10-26T06:00:00.000Z"],
    ["1 de marzo", [2026, 3, 1, 7, 0], "2026-03-01T06:00:00.000Z"],
    ["1 de marzo de un año bisiesto", [2028, 3, 1, 7, 0], "2028-03-01T06:00:00.000Z"],
    ["1 de enero", [2027, 1, 1, 7, 0], "2027-01-01T06:00:00.000Z"],
    ["20:30 en invierno", [2026, 2, 11, 20, 30], "2026-02-11T19:30:00.000Z"],
    ["hora que no existe (02:30 del 29/03/2026) se desplaza hacia delante", [2026, 3, 29, 2, 30], "2026-03-29T01:30:00.000Z"],
    ["02:00 del 29/03/2026 (primera hora que no existe)", [2026, 3, 29, 2, 0], "2026-03-29T01:00:00.000Z"],
    ["hora repetida (02:30 del 25/10/2026) es la segunda", [2026, 10, 25, 2, 30], "2026-10-25T01:30:00.000Z"],
    ["02:30 un día sin cambio", [2026, 2, 10, 2, 30], "2026-02-10T01:30:00.000Z"],
  ];
  it.each(casos)("%s", (_nombre, [y, mo, d, h, mi], esperado) => {
    expect(zonedTimeToUtc(y, mo, d, h, mi, MADRID).toISOString()).toBe(esperado);
  });
});

/*
 * Valores de PostgreSQL (`(fecha + hora) at time zone zona`, solo cálculo) el 03/10/2026, en 15 zonas: al este y al oeste de
 * Greenwich, de hemisferio norte y sur, con cambios de 30 y 45 minutos y a medianoche. La versión copiada de
 * `apps/web/src/core/business-clock.ts` fallaba aquí con las zonas de desfase negativo (America/New_York y compañía).
 */
describe("local-time · zonedTimeToUtc contra PostgreSQL en 15 zonas (horas normales, huecos y repeticiones)", () => {
  const casos: [string, string, string, string, string][] = [
    ["America/New_York", "2026-03-08", "01:59", "2026-03-08T06:59:00.000Z", "normal, justo antes del salto"],
    ["America/New_York", "2026-03-08", "02:00", "2026-03-08T07:00:00.000Z", "hueco: desfase de antes del salto"],
    ["America/New_York", "2026-03-08", "02:30", "2026-03-08T07:30:00.000Z", "hueco: 02:30 no existe, cae a las 03:30 EDT"],
    ["America/New_York", "2026-03-08", "03:00", "2026-03-08T07:00:00.000Z", "normal, justo después del salto"],
    ["America/New_York", "2026-03-08", "07:00", "2026-03-08T11:00:00.000Z", "la hora por defecto el día del salto"],
    ["America/New_York", "2026-11-01", "00:59", "2026-11-01T04:59:00.000Z", "normal, antes de la repetición"],
    ["America/New_York", "2026-11-01", "01:00", "2026-11-01T06:00:00.000Z", "repetida: la segunda (EST)"],
    ["America/New_York", "2026-11-01", "01:30", "2026-11-01T06:30:00.000Z", "repetida: la segunda (EST)"],
    ["America/New_York", "2026-11-01", "02:00", "2026-11-01T07:00:00.000Z", "normal, justo después de la repetición"],
    ["America/New_York", "2026-11-01", "07:00", "2026-11-01T12:00:00.000Z", "la hora por defecto el día del cambio"],
    ["America/Los_Angeles", "2026-03-08", "02:30", "2026-03-08T10:30:00.000Z", "hueco"],
    ["America/Los_Angeles", "2026-11-01", "01:30", "2026-11-01T09:30:00.000Z", "repetida"],
    ["America/Chicago", "2026-03-08", "02:30", "2026-03-08T08:30:00.000Z", "hueco"],
    ["America/Chicago", "2026-11-01", "01:30", "2026-11-01T07:30:00.000Z", "repetida"],
    ["America/Havana", "2026-03-08", "00:30", "2026-03-08T05:30:00.000Z", "hueco a medianoche"],
    ["America/Havana", "2026-11-01", "00:30", "2026-11-01T05:30:00.000Z", "repetida a medianoche"],
    ["America/Havana", "2026-11-01", "01:00", "2026-11-01T06:00:00.000Z", "normal tras la repetición"],
    ["America/Santiago", "2026-04-04", "23:30", "2026-04-05T03:30:00.000Z", "repetida a medianoche (hemisferio sur)"],
    ["America/Santiago", "2026-04-05", "23:30", "2026-04-06T03:30:00.000Z", "normal"],
    ["America/Santiago", "2026-09-06", "00:30", "2026-09-06T04:30:00.000Z", "hueco a medianoche (hemisferio sur)"],
    ["America/St_Johns", "2026-03-08", "02:30", "2026-03-08T06:00:00.000Z", "hueco, desfase de media hora"],
    ["America/St_Johns", "2026-11-01", "01:30", "2026-11-01T05:00:00.000Z", "repetida, desfase de media hora"],
    ["Australia/Sydney", "2026-10-04", "02:30", "2026-10-03T16:30:00.000Z", "hueco (hemisferio sur)"],
    ["Australia/Sydney", "2026-04-05", "02:30", "2026-04-04T16:30:00.000Z", "repetida (hemisferio sur)"],
    ["Australia/Lord_Howe", "2026-10-04", "02:15", "2026-10-03T15:45:00.000Z", "hueco de solo 30 minutos"],
    ["Australia/Lord_Howe", "2026-04-05", "01:45", "2026-04-04T15:15:00.000Z", "repetida de solo 30 minutos"],
    ["Pacific/Chatham", "2026-09-27", "02:45", "2026-09-26T14:00:00.000Z", "hueco, desfase de +12:45"],
    ["Pacific/Chatham", "2026-04-05", "03:15", "2026-04-04T14:30:00.000Z", "repetida, desfase de +12:45"],
    ["Pacific/Auckland", "2026-09-27", "02:30", "2026-09-26T14:30:00.000Z", "hueco"],
    ["Pacific/Auckland", "2026-04-05", "02:30", "2026-04-04T14:30:00.000Z", "repetida"],
    ["Europe/London", "2026-03-29", "01:30", "2026-03-29T01:30:00.000Z", "hueco"],
    ["Europe/London", "2026-10-25", "01:30", "2026-10-25T01:30:00.000Z", "repetida"],
    ["Europe/Madrid", "2026-03-29", "02:30", "2026-03-29T01:30:00.000Z", "hueco"],
    ["Europe/Madrid", "2026-10-25", "02:30", "2026-10-25T01:30:00.000Z", "repetida"],
    ["Asia/Kolkata", "2026-03-29", "02:30", "2026-03-28T21:00:00.000Z", "sin cambio de hora"],
    ["America/Sao_Paulo", "2026-11-01", "01:30", "2026-11-01T04:30:00.000Z", "sin cambio de hora"],
  ];
  it.each(casos)("%s %s %s → %s (%s)", (zona, fecha, hora, esperado) => {
    const [y, mo, d] = fecha.split("-").map(Number) as [number, number, number];
    const [h, mi] = hora.split(":").map(Number) as [number, number];
    expect(zonedTimeToUtc(y, mo, d, h, mi, zona).toISOString()).toBe(esperado);
  });
});

describe("local-time · «hoy» en la zona del espacio contra PostgreSQL", () => {
  const casos: [string, string, string, string][] = [
    ["00:00 local en invierno", "2026-02-09T23:00:00.000Z", "2026-02-10", "00:00"],
    ["11:00 en invierno", "2026-02-10T10:00:00.000Z", "2026-02-10", "11:00"],
    ["último milisegundo del día", "2026-02-10T22:59:59.999Z", "2026-02-10", "23:59"],
    ["primer instante del día siguiente", "2026-02-10T23:00:00.000Z", "2026-02-11", "00:00"],
    ["23:59 en verano", "2026-06-10T21:59:00.000Z", "2026-06-10", "23:59"],
    ["00:00 local en verano (en UTC aún es el 10)", "2026-06-10T22:00:00.000Z", "2026-06-11", "00:00"],
    ["00:30 del domingo del cambio de marzo", "2026-03-28T23:30:00.000Z", "2026-03-29", "00:30"],
    ["01:59:59 antes del salto de marzo", "2026-03-29T00:59:59.000Z", "2026-03-29", "01:59"],
    ["03:00 justo tras el salto de marzo", "2026-03-29T01:00:00.000Z", "2026-03-29", "03:00"],
    ["23:59 del día de 23 horas", "2026-03-29T21:59:00.000Z", "2026-03-29", "23:59"],
    ["00:00 del lunes tras el cambio de marzo", "2026-03-29T22:00:00.000Z", "2026-03-30", "00:00"],
    ["00:30 del domingo del cambio de octubre", "2026-10-24T22:30:00.000Z", "2026-10-25", "00:30"],
    ["primera 02:30 (CEST)", "2026-10-25T00:30:00.000Z", "2026-10-25", "02:30"],
    ["segunda 02:30 (CET)", "2026-10-25T01:30:00.000Z", "2026-10-25", "02:30"],
    ["23:30 del día de 25 horas", "2026-10-25T22:30:00.000Z", "2026-10-25", "23:30"],
    ["00:00 del lunes tras el cambio de octubre", "2026-10-25T23:00:00.000Z", "2026-10-26", "00:00"],
  ];
  it.each(casos)("%s", (_nombre, instante, fecha, hora) => {
    expect(localDateTimeOf(new Date(instante), MADRID)).toEqual({ date: fecha, time: hora });
    expect(localDateOf(new Date(instante), MADRID)).toBe(fecha);
  });
});

describe("local-time · desfase y validadores", () => {
  it("el desfase de Madrid es 60 en invierno y 120 en verano, también con milisegundos", () => {
    expect(utcOffsetMinutes(new Date("2026-02-10T10:00:00.000Z"), MADRID)).toBe(60);
    expect(utcOffsetMinutes(new Date("2026-06-10T10:00:00.000Z"), MADRID)).toBe(120);
    expect(utcOffsetMinutes(new Date("2026-06-10T21:59:59.999Z"), MADRID)).toBe(120);
  });

  it("fechas y horas válidas e inválidas", () => {
    expect(isValidLocalDate("2026-02-28")).toBe(true);
    expect(isValidLocalDate("2028-02-29")).toBe(true);
    expect(isValidLocalDate("2026-02-29")).toBe(false);
    expect(isValidLocalDate("2026-02-30")).toBe(false);
    expect(isValidLocalDate("10/02/2026")).toBe(false);
    expect(isValidLocalDate("")).toBe(false);
    expect(isValidLocalTime("00:00")).toBe(true);
    expect(isValidLocalTime("23:59")).toBe(true);
    expect(isValidLocalTime("24:00")).toBe(false);
    expect(isValidLocalTime("9:00")).toBe(false);
    expect(isValidLocalTime("")).toBe(false);
  });

  it("día de la semana: 1 lunes … 7 domingo", () => {
    expect(isoWeekday("2026-10-03")).toBe(6); // sábado
    expect(isoWeekday("2026-10-25")).toBe(7); // domingo del cambio de hora
    expect(isoWeekday("2026-03-30")).toBe(1); // lunes
    expect(() => isoWeekday("2026-02-30")).toThrow(RangeError);
  });

  it("tryLocalDateOf devuelve error explícito, sin lanzar, con zona o instante inválidos", () => {
    expect(tryLocalDateOf(new Date("2026-02-10T10:00:00Z"), "No/Existe")).toEqual({ ok: false, error: "invalid_time_zone" });
    expect(tryLocalDateOf(new Date("x"), MADRID)).toEqual({ ok: false, error: "invalid_now" });
    expect(tryLocalDateOf(new Date("2026-02-10T10:00:00Z"), MADRID)).toEqual({ ok: true, value: "2026-02-10" });
  });

  it("tryLocalDateOf rechaza como reloj inválido un año que no se escribe con 4 cifras (no es un reloj real)", () => {
    expect(tryLocalDateOf(new Date("0999-06-01T12:00:00Z"), MADRID)).toEqual({ ok: false, error: "invalid_now" });
    expect(tryLocalDateOf(new Date("+010000-01-01T12:00:00Z"), MADRID)).toEqual({ ok: false, error: "invalid_now" });
  });
});

describe("local-time · diferencia en días de calendario", () => {
  it("cuenta días de calendario, también por los días de cambio de hora, fin de mes y año bisiesto", () => {
    expect(dayDiff("2026-10-03", "2026-10-03")).toBe(0);
    expect(dayDiff("2026-10-03", "2026-10-04")).toBe(1);
    expect(dayDiff("2026-10-04", "2026-10-03")).toBe(-1);
    expect(dayDiff("2026-10-24", "2026-10-26")).toBe(2); // por encima del cambio de hora de octubre
    expect(dayDiff("2026-03-28", "2026-03-30")).toBe(2); // por encima del cambio de hora de marzo
    expect(dayDiff("2028-02-28", "2028-03-01")).toBe(2); // bisiesto
    expect(dayDiff("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("una fecha inválida lanza RangeError (solo se llama con fechas ya validadas)", () => {
    expect(() => dayDiff("2026-02-30", "2026-03-01")).toThrow(RangeError);
  });
});
