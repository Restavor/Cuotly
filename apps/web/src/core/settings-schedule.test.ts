import { describe, expect, it } from "vitest";

import { contractualCalendar, isWithinBusinessWindow, zonedTimeToUtc } from "./business-clock";
import { contractualWeek, menuDiarioWeek, upcomingHolidays, weeklyHours } from "./settings-schedule";

describe("RN-CLK-05 · la semana contractual que enseña Horarios", () => {
  it("suma 125,5 h, las mismas que cuenta el reloj", () => {
    expect(weeklyHours(contractualWeek())).toBe(125.5);
  });

  it("RN-CLK-01 · empieza el lunes a las 09:00 y acaba el sábado a las 14:30, como el reloj", () => {
    const cal = contractualCalendar("Europe/Madrid");
    // Semana del 21 de septiembre de 2026 (lunes).
    const at = (day: string, time: string) => {
      const [y, mo, d] = day.split("-").map(Number);
      const [h, mi] = time.split(":").map(Number);
      return zonedTimeToUtc(y, mo, d, h, mi, "Europe/Madrid");
    };
    expect(isWithinBusinessWindow(at("2026-09-21", "08:59"), cal)).toBe(false);
    expect(isWithinBusinessWindow(at("2026-09-21", "09:00"), cal)).toBe(true);
    expect(isWithinBusinessWindow(at("2026-09-23", "03:00"), cal)).toBe(true);
    expect(isWithinBusinessWindow(at("2026-09-26", "14:29"), cal)).toBe(true);
    expect(isWithinBusinessWindow(at("2026-09-26", "14:30"), cal)).toBe(false);
    expect(isWithinBusinessWindow(at("2026-09-27", "12:00"), cal)).toBe(false);

    const semana = contractualWeek();
    expect(semana[0].ranges).toEqual([{ from: "09:00", to: "24:00" }]);
    expect(semana[5].ranges).toEqual([{ from: "00:00", to: "14:30" }]);
    expect(semana[6].ranges).toEqual([]);
  });

  it("RN-CLK-09 · Menú Diario trabaja todos los días", () => {
    expect(weeklyHours(menuDiarioWeek())).toBe(168);
  });
});

describe("upcomingHolidays", () => {
  it("deja los de hoy en adelante, del más cercano al más lejano", () => {
    const lista = upcomingHolidays(
      [
        { id: "a", date: "2026-12-25", name: "Navidad" },
        { id: "b", date: "2026-09-01", name: "Pasado" },
        { id: "c", date: "2026-10-12", name: "Pilar" },
        { id: "d", date: "2026-09-23", name: "Hoy" },
      ],
      "2026-09-23",
    );
    expect(lista.map((h) => h.id)).toEqual(["d", "c", "a"]);
  });
});
