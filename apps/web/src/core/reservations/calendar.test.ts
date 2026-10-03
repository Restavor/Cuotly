import { describe, expect, it } from "vitest";
import { addMonths, buildCalendarMonth, monthBounds, originBar } from "./calendar";
import type { CalendarReservation } from "./calendar";
import type { Shift } from "./shifts";

const shifts: Shift[] = [{ id: "c", name: "Cena", weekdays: [2, 3, 4, 5, 6, 7], startTime: "20:00", lastBookingTime: "22:30", endTime: "23:30", capacity: 60, active: true }];
const r = (date: string, people: number, source: CalendarReservation["source"], status: CalendarReservation["status"] = "confirmed", reservations = 1): CalendarReservation => ({ date, people, source, status, reservations });

describe("RES-10 · calendario del mes", () => {
  it("RES-10 · las semanas van de lunes a domingo y cubren el mes (septiembre de 2026 empieza en martes)", () => {
    const m = buildCalendarMonth("2026-09", [], shifts, []);
    expect(m.weeks.every((w) => w.length === 7)).toBe(true);
    expect(m.weeks[0][0].date).toBe("2026-08-31");
    expect(m.weeks[0][0].inMonth).toBe(false);
    expect(m.weeks[0][1].date).toBe("2026-09-01");
    expect(m.weeks.at(-1)?.at(-1)?.date).toBe("2026-10-04");
    expect(monthBounds("2026-09")).toEqual({ first: "2026-09-01", last: "2026-09-30" });
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
  it("RES-10 · reservas y personas por día, total del mes y barra por origen", () => {
    const m = buildCalendarMonth(
      "2026-09",
      [r("2026-09-26", 6, "agent", "confirmed", 2), r("2026-09-26", 2, "web"), r("2026-09-26", 9, "web", "cancelled"), r("2026-09-27", 3, "manual")],
      shifts,
      [],
    );
    const day = m.weeks.flat().find((d) => d.date === "2026-09-26");
    expect(day).toMatchObject({ reservations: 3, people: 8, closed: false, hasPending: false });
    expect(day?.bySource).toEqual({ agent: 2, platform: 0, web: 1, manual: 0 });
    expect(m.totalReservations).toBe(4);
    expect(m.totalPeople).toBe(11);
    expect(day && originBar(day).map((b) => [b.origin, Math.round(b.percent)])).toEqual([
      ["agent", 67],
      ["web", 33],
    ]);
  });
  it("RES-10 · días cerrados (lunes y cerrados a propósito) y punto amarillo con pendientes", () => {
    const m = buildCalendarMonth("2026-10", [r("2026-10-13", 12, "agent", "pending")], shifts, ["2026-10-12"]);
    const days = m.weeks.flat();
    expect(days.find((d) => d.date === "2026-10-12")?.closed).toBe(true); // cerrado a propósito (y lunes)
    expect(days.find((d) => d.date === "2026-10-19")?.closed).toBe(true); // lunes
    expect(days.find((d) => d.date === "2026-10-13")).toMatchObject({ closed: false, hasPending: true });
  });
  it("RES-10 · las reservas de fuera del mes no suman al total ni al día", () => {
    const m = buildCalendarMonth("2026-09", [r("2026-10-02", 4, "web")], shifts, []);
    expect(m.totalReservations).toBe(0);
    expect(m.weeks.flat().find((d) => d.date === "2026-10-02")?.reservations).toBe(0);
  });
});
