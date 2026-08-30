import { describe, expect, it } from "vitest";
import { contractualCalendar } from "./business-clock";
import { crossesT1Threshold, t1DurationHours, t1Status, T1_WARNING_THRESHOLDS_PERCENT } from "./sla-timers";
import type { TimerEvent } from "./timer-events";

const MADRID = "Europe/Madrid";

describe("sla-timers — RN-SLA-01 a 04, RN-SLA-10", () => {
  it("RN-SLA-02: 48 h laborables para Básico o un establecimiento sin plan (RN-COM-12)", () => {
    expect(t1DurationHours(false)).toBe(48);
  });

  it("RN-SLA-02: 24 h laborables para Impulso y Premium", () => {
    expect(t1DurationHours(true)).toBe(24);
  });

  it("RN-SLA-10: los tres umbrales de aviso son 50 %, 80 % y 100 %", () => {
    expect(T1_WARNING_THRESHOLDS_PERCENT).toEqual([50, 80, 100]);
  });

  it("t1Status recalcula el porcentaje consumido a partir de timer_events (CA-10), no de un contador guardado", () => {
    const calendar = contractualCalendar(MADRID);
    // Lunes 09:00 (arranque de la ventana laborable, RN-CLK-01).
    const started = new Date("2026-08-31T07:00:00.000Z");
    const events: TimerEvent[] = [{ type: "started", occurredAt: started }];
    // 24 h laborables después de un lunes 09:00 caen dentro de la misma
    // semana (RN-CLK-05: la semana tiene 125,5 h laborables) — 12 h
    // después basta para probar el cálculo sin cruzar el fin de semana.
    const measuredAt = new Date("2026-08-31T19:00:00.000Z"); // +12h de reloj = +12h laborables (lunes)

    const status = t1Status(events, calendar, measuredAt, false);

    expect(status.elapsedMinutes).toBe(12 * 60);
    expect(status.totalMinutes).toBe(48 * 60);
    expect(status.percentUsed).toBeCloseTo(25, 5);
    expect(status.overdue).toBe(false);
  });

  it("t1Status marca overdue cuando el tiempo laborable consumido supera la duración de T1", () => {
    const calendar = contractualCalendar(MADRID);
    const started = new Date("2026-08-31T07:00:00.000Z"); // lunes 09:00
    const events: TimerEvent[] = [{ type: "started", occurredAt: started }];
    // Impulso/Premium: 24h. Avanzamos varios días laborables para superarlas de sobra.
    const measuredAt = new Date("2026-09-03T07:00:00.000Z"); // jueves 09:00

    const status = t1Status(events, calendar, measuredAt, true);

    expect(status.elapsedMinutes).toBeGreaterThan(status.totalMinutes);
    expect(status.overdue).toBe(true);
  });

  it("t1Status descuenta el tramo pausado por RN-SLA-03 (needs_information)", () => {
    const calendar = contractualCalendar(MADRID);
    const started = new Date("2026-08-31T07:00:00.000Z"); // lunes 09:00
    const paused = new Date("2026-08-31T13:00:00.000Z"); // lunes 15:00, +6h laborables
    const resumed = new Date("2026-09-01T07:00:00.000Z"); // martes 09:00 (durante la pausa, no cuenta)
    const measuredAt = new Date("2026-09-01T11:00:00.000Z"); // martes 13:00, +4h laborables tras reanudar

    const events: TimerEvent[] = [
      { type: "started", occurredAt: started },
      { type: "paused", occurredAt: paused },
      { type: "resumed", occurredAt: resumed },
    ];

    const status = t1Status(events, calendar, measuredAt, false);

    expect(status.elapsedMinutes).toBe((6 + 4) * 60);
  });

  describe("crossesT1Threshold — RN-SLA-10", () => {
    it("detecta el cruce del umbral", () => {
      expect(crossesT1Threshold(45, 55, 50)).toBe(true);
    });

    it("no dispara dos veces el mismo umbral", () => {
      expect(crossesT1Threshold(55, 60, 50)).toBe(false);
    });

    it("no dispara si todavía no se alcanza el umbral", () => {
      expect(crossesT1Threshold(10, 20, 50)).toBe(false);
    });
  });
});
