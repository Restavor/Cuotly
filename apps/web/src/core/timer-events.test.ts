import { describe, expect, it } from "vitest";
import { contractualCalendar } from "./business-clock";
import { recalculateElapsedBusinessMinutes, type TimerEvent } from "./timer-events";

const TZ = "Europe/Madrid";
const calendar = contractualCalendar(TZ);

function madrid(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+01:00`);
}

describe("CA-10 · los contadores son reproducibles a partir de timer_events", () => {
  it("recalcular dos veces con el mismo historial da el mismo resultado", () => {
    const events: TimerEvent[] = [{ type: "started", occurredAt: madrid("2026-02-02", "09:00") }];
    const measuredAt = madrid("2026-02-02", "09:30");

    const first = recalculateElapsedBusinessMinutes(events, calendar, measuredAt);
    const second = recalculateElapsedBusinessMinutes(events, calendar, measuredAt);

    expect(first).toBe(30);
    expect(second).toBe(first);
  });

  it("el orden en que llegan las filas de la base de datos no cambia el resultado", () => {
    const sorted: TimerEvent[] = [
      { type: "started", occurredAt: madrid("2026-02-02", "09:00") },
      { type: "paused", occurredAt: madrid("2026-02-02", "09:10") },
      { type: "resumed", occurredAt: madrid("2026-02-02", "09:40") },
      { type: "stopped", occurredAt: madrid("2026-02-02", "09:50") },
    ];
    const shuffled = [sorted[2], sorted[0], sorted[3], sorted[1]];

    const fromSorted = recalculateElapsedBusinessMinutes(sorted, calendar, madrid("2026-02-02", "10:00"));
    const fromShuffled = recalculateElapsedBusinessMinutes(shuffled, calendar, madrid("2026-02-02", "10:00"));

    expect(fromShuffled).toBe(fromSorted);
  });

  it("las pausas no cuentan minutos laborables, y reanudar continúa sumando desde donde se quedó", () => {
    const events: TimerEvent[] = [
      { type: "started", occurredAt: madrid("2026-02-02", "09:00") },
      { type: "paused", occurredAt: madrid("2026-02-02", "09:10") }, // 10 min
      { type: "resumed", occurredAt: madrid("2026-02-02", "09:40") }, // 30 min de pausa, no cuentan
      { type: "stopped", occurredAt: madrid("2026-02-02", "09:50") }, // 10 min más
    ];

    expect(recalculateElapsedBusinessMinutes(events, calendar, madrid("2026-02-02", "12:00"))).toBe(20);
  });

  it("un contador todavía sin detener usa la fecha de corte, y ese cálculo también es reproducible", () => {
    const events: TimerEvent[] = [{ type: "started", occurredAt: madrid("2026-02-02", "09:00") }];
    const measuredAt = madrid("2026-02-02", "10:00");

    const first = recalculateElapsedBusinessMinutes(events, calendar, measuredAt);
    const second = recalculateElapsedBusinessMinutes(events, calendar, measuredAt);

    expect(first).toBe(60);
    expect(second).toBe(60);
  });

  it("sin eventos, el contador recalculado es 0", () => {
    expect(recalculateElapsedBusinessMinutes([], calendar, madrid("2026-02-02", "10:00"))).toBe(0);
  });

  it("una pausa de fin de semana no consume minutos laborables aunque pasen muchas horas reales", () => {
    const events: TimerEvent[] = [
      { type: "started", occurredAt: madrid("2026-02-07", "13:00") }, // sábado 13:00
      { type: "paused", occurredAt: madrid("2026-02-07", "14:30") }, // cierre del sábado: 90 min laborables
      { type: "resumed", occurredAt: madrid("2026-02-09", "09:00") }, // lunes 09:00, sin coste por la pausa
      { type: "stopped", occurredAt: madrid("2026-02-09", "09:20") }, // 20 min más
    ];

    expect(recalculateElapsedBusinessMinutes(events, calendar, madrid("2026-02-09", "12:00"))).toBe(90 + 20);
  });
});
