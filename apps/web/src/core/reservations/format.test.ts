import { describe, expect, it } from "vitest";
import { formatDateTime, formatLongDate, formatMinutes, formatMonth, formatNoticeLongDate, formatNoticeShortDate, formatShortDate, weekdayName } from "./format";

describe("RES-01 · cómo se escriben las fechas de la agenda", () => {
  it("RES-01 · el título de Hoy: «Sábado, 26 de septiembre»", () => {
    expect(formatLongDate("2026-09-26")).toBe("Sábado, 26 de septiembre");
    expect(formatLongDate("2026-12-01")).toBe("Martes, 1 de diciembre");
  });
  it("RES-09 · la fecha corta de los resultados: «Sáb 26 sept»", () => {
    expect(formatShortDate("2026-09-26")).toBe("Sáb 26 sept");
    expect(formatShortDate("2026-10-09")).toBe("Vie 9 oct");
  });
  it("RES-10 · el mes del calendario: «Septiembre 2026»", () => {
    expect(formatMonth("2026-09")).toBe("Septiembre 2026");
  });
  it("RES-12 · los días de la semana, de lunes a domingo, con su inicial para los botones", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => weekdayName(d, "narrow"))).toEqual(["L", "M", "X", "J", "V", "S", "D"]);
    expect(weekdayName(1)).toBe("Lunes");
    expect(weekdayName(7)).toBe("Domingo");
  });
  it("RES-12 · las duraciones de los límites: «2 h», «90 min», «1 h 30 min»", () => {
    expect(formatMinutes(120)).toBe("2 h");
    expect(formatMinutes(90)).toBe("1 h 30 min");
    expect(formatMinutes(45)).toBe("45 min");
  });
  it("una fecha que no existe no se escribe", () => {
    expect(() => formatLongDate("2026-02-30")).toThrow(RangeError);
  });
  it("RES-03 · el historial escribe el instante en la zona del restaurante: «24 sept, 20:42»", () => {
    expect(formatDateTime(new Date("2026-09-24T18:42:00Z"), "Europe/Madrid")).toBe("24 sept, 20:42");
    expect(formatDateTime(new Date("2026-12-24T18:42:00Z"), "Europe/Madrid")).toBe("24 dic, 19:42");
  });
});

describe("AVI-02 a AVI-04 · las fechas de los avisos a los comensales (`textos-avisos.md`)", () => {
  it("AVI-02 · `{fecha_larga}`: «sábado 26 de septiembre» y «Saturday 26 September», sin coma ni mayúscula inicial en español", () => {
    expect(formatNoticeLongDate("2026-09-26", "es")).toBe("sábado 26 de septiembre");
    expect(formatNoticeLongDate("2026-10-03", "es")).toBe("sábado 3 de octubre");
    expect(formatNoticeLongDate("2026-09-26", "en")).toBe("Saturday 26 September");
    expect(formatNoticeLongDate("2026-12-01", "en")).toBe("Tuesday 1 December");
  });

  it("AVI-04 · `{fecha_corta}`: «sáb 26/09» y «Sat 26/09», con día y mes de dos cifras", () => {
    expect(formatNoticeShortDate("2026-09-26", "es")).toBe("sáb 26/09");
    expect(formatNoticeShortDate("2026-10-03", "es")).toBe("sáb 03/10");
    expect(formatNoticeShortDate("2026-09-26", "en")).toBe("Sat 26/09");
    expect(formatNoticeShortDate("2026-12-01", "en")).toBe("Tue 01/12");
  });

  it("AVI-02 · una fecha que no existe no se escribe", () => {
    expect(() => formatNoticeLongDate("2026-02-30", "es")).toThrow(RangeError);
    expect(() => formatNoticeShortDate("nada", "en")).toThrow(RangeError);
  });
});
