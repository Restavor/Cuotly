/**
 * T2, T3 y la condición "Fuera de plazo" (RN-SLA-05 a 17) — CA-12, CA-13 y
 * CA-14. Va en un archivo aparte de `sla-timers.test.ts` (que cubre T1,
 * Hito 4) porque son tres relojes distintos y "nunca se mezclan" (PRD §8).
 */
import { describe, expect, it } from "vitest";
import { contractualCalendar } from "./business-clock";
import {
  T2_CRITICAL_ALERT_REMAINING_MINUTES,
  T2_REASSIGNMENT_SUGGESTION_REMAINING_MINUTES,
  T2_WARNING_THRESHOLDS_PERCENT,
  T3_WARNING_THRESHOLDS_PERCENT,
  jobDeadlineCondition,
  needsT2CriticalAlert,
  suggestsT2Reassignment,
  t2DurationHours,
  t2Status,
  t3DurationHours,
  t3Status,
} from "./sla-timers";
import type { TimerEvent } from "./timer-events";

const MADRID = "Europe/Madrid";
const calendar = contractualCalendar(MADRID);

// Semana de referencia: 2026-08-31 es lunes. Madrid está en UTC+2 en
// agosto, así que las 09:00 locales son las 07:00Z (RN-CLK-01/06).
const LUNES_09 = new Date("2026-08-31T07:00:00.000Z");
const LUNES_12 = new Date("2026-08-31T10:00:00.000Z");
const LUNES_13 = new Date("2026-08-31T11:00:00.000Z");
const LUNES_15 = new Date("2026-08-31T13:00:00.000Z");
const MARTES_09 = new Date("2026-09-01T07:00:00.000Z");
const MARTES_10 = new Date("2026-09-01T08:00:00.000Z");

describe("T2 — inicio operativo (RN-SLA-05 a 10)", () => {
  it("RN-SLA-06: la duración es la misma que T1 según el plan (48 h / 24 h)", () => {
    expect(t2DurationHours(false)).toBe(48);
    expect(t2DurationHours(true)).toBe(24);
  });

  it("RN-SLA-10: avisos al 50 %, 80 % y 100 %", () => {
    expect(T2_WARNING_THRESHOLDS_PERCENT).toEqual([50, 80, 100]);
  });

  it("RN-SLA-05: T2 cuenta minutos laborables desde que el trabajo queda asignado", () => {
    const status = t2Status([{ type: "started", occurredAt: LUNES_09 }], calendar, LUNES_15, true);

    expect(status.elapsedMinutes).toBe(6 * 60);
    expect(status.totalMinutes).toBe(24 * 60);
    expect(status.remainingMinutes).toBe(18 * 60);
    expect(status.percentUsed).toBeCloseTo(25, 5);
    expect(status.overdue).toBe(false);
  });

  it("RN-SLA-07: al pulsar Comenzar, T2 se detiene y deja de consumir", () => {
    const events: TimerEvent[] = [
      { type: "started", occurredAt: LUNES_09 },
      { type: "stopped", occurredAt: LUNES_12 },
    ];

    // Aunque se mire mucho después, T2 se quedó en las 3 h del tramo.
    expect(t2Status(events, calendar, MARTES_10, true).elapsedMinutes).toBe(3 * 60);
  });

  describe("RN-SLA-10: alerta a 2 h y sugerencia de reasignación a 1 h", () => {
    it("los dos umbrales están en minutos laborables", () => {
      expect(T2_CRITICAL_ALERT_REMAINING_MINUTES).toBe(120);
      expect(T2_REASSIGNMENT_SUGGESTION_REMAINING_MINUTES).toBe(60);
    });

    it("con 3 h restantes no salta ninguno; con 2 h salta la alerta; con 1 h, también la sugerencia", () => {
      const tresHoras = { elapsedMinutes: 0, totalMinutes: 0, remainingMinutes: 180, percentUsed: 0, overdue: false };
      const dosHoras = { ...tresHoras, remainingMinutes: 120 };
      const unaHora = { ...tresHoras, remainingMinutes: 60 };

      expect(needsT2CriticalAlert(tresHoras)).toBe(false);
      expect(suggestsT2Reassignment(tresHoras)).toBe(false);

      expect(needsT2CriticalAlert(dosHoras)).toBe(true);
      expect(suggestsT2Reassignment(dosHoras)).toBe(false);

      expect(needsT2CriticalAlert(unaHora)).toBe(true);
      expect(suggestsT2Reassignment(unaHora)).toBe(true);
    });
  });

  describe("CA-12: una nueva aceptación reinicia T2 desde cero; una reasignación no", () => {
    it("RN-SLA-08: tras una nueva aceptación (nuevo arranque), T2 cuenta desde cero", () => {
      const events: TimerEvent[] = [
        // Primer intento: asignado el lunes a las 09:00, T2 corriendo.
        { type: "started", occurredAt: LUNES_09 },
        // Cambia la clasificación: se detiene el contador del intento anterior…
        { type: "stopped", occurredAt: LUNES_12 },
        // …y el cliente vuelve a aceptar a las 13:00: T2 arranca de nuevo.
        { type: "started", occurredAt: LUNES_13 },
      ];

      const status = t2Status(events, calendar, LUNES_15, true);

      // 2 h desde el nuevo arranque, no 5 h sumando el intento anterior.
      expect(status.elapsedMinutes).toBe(2 * 60);
      expect(status.remainingMinutes).toBe(22 * 60);
    });

    it("RN-SLA-08: el libro conserva todos los intentos anteriores — no se borra ningún evento", () => {
      const events: TimerEvent[] = [
        { type: "started", occurredAt: LUNES_09 },
        { type: "stopped", occurredAt: LUNES_12 },
        { type: "started", occurredAt: LUNES_13 },
      ];

      // El recálculo solo mira el último tramo, pero el historial que se le
      // pasa sigue intacto: nada de este módulo lo modifica.
      t2Status(events, calendar, LUNES_15, true);
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: "started", occurredAt: LUNES_09 });
    });

    it("RN-SLA-09: una reasignación no escribe ningún evento, así que T2 sigue exactamente donde estaba", () => {
      const antesDeReasignar: TimerEvent[] = [{ type: "started", occurredAt: LUNES_09 }];
      // Pedir y aprobar la reasignación no añade ni un solo timer_event
      // (job-states.ts: t2 = null en ambas transiciones).
      const despuesDeReasignar: TimerEvent[] = [...antesDeReasignar];

      const antes = t2Status(antesDeReasignar, calendar, LUNES_15, true);
      const despues = t2Status(despuesDeReasignar, calendar, LUNES_15, true);

      expect(despues.elapsedMinutes).toBe(antes.elapsedMinutes);
      expect(despues.remainingMinutes).toBe(antes.remainingMinutes);
      // El nuevo responsable recibe el tiempo restante exacto, no uno nuevo.
      expect(despues.remainingMinutes).toBe(18 * 60);
    });
  });
});

describe("T3 — ejecución (RN-SLA-11 a 16)", () => {
  it("RN-SLA-12: 72 h laborables para pequeño, fotográfico y mediano; 120 h para grande", () => {
    expect(t3DurationHours("small")).toBe(72);
    expect(t3DurationHours("photo")).toBe(72);
    expect(t3DurationHours("medium")).toBe(72);
    expect(t3DurationHours("large")).toBe(120);
  });

  it("RN-SLA-15: avisos al 75 %, 90 % y 100 %", () => {
    expect(T3_WARNING_THRESHOLDS_PERCENT).toEqual([75, 90, 100]);
  });

  it("HU-18 · RN-SLA-11: T3 arranca al pulsar Comenzar y el responsable ve el contador exacto", () => {
    const status = t3Status([{ type: "started", occurredAt: LUNES_09 }], calendar, LUNES_15, "small");

    expect(status.elapsedMinutes).toBe(6 * 60);
    expect(status.totalMinutes).toBe(72 * 60);
    expect(status.remainingMinutes).toBe(66 * 60);
  });

  describe("CA-13 · HU-19: un bloqueo pausa T3 y al reanudarse el tiempo restante es exactamente el que había", () => {
    const started: TimerEvent = { type: "started", occurredAt: LUNES_09 };
    const paused: TimerEvent = { type: "paused", occurredAt: LUNES_12 };
    const resumed: TimerEvent = { type: "resumed", occurredAt: MARTES_09 };

    it("el tiempo restante en el instante de la pausa y en el de la reanudación es el mismo", () => {
      const alPausar = t3Status([started, paused], calendar, LUNES_12, "small");
      const alReanudar = t3Status([started, paused, resumed], calendar, MARTES_09, "small");

      expect(alPausar.remainingMinutes).toBe(alReanudar.remainingMinutes);
      expect(alReanudar.remainingMinutes).toBe(72 * 60 - 3 * 60);
    });

    it("RN-SLA-14: las 21 horas laborables del bloqueo no consumen nada", () => {
      // Entre el lunes a las 12:00 y el martes a las 09:00 hay 21 h
      // laborables (el reloj contractual no para por la noche, RN-CLK-01):
      // ninguna de ellas cuenta.
      const bloqueado = t3Status([started, paused], calendar, MARTES_09, "small");
      expect(bloqueado.elapsedMinutes).toBe(3 * 60);

      const reanudado = t3Status([started, paused, resumed], calendar, MARTES_10, "small");
      expect(reanudado.elapsedMinutes).toBe(4 * 60);
    });

    it("RN-SLA-13: al publicar, T3 se detiene y deja de consumir", () => {
      const publicado: TimerEvent = { type: "stopped", occurredAt: MARTES_10 };
      const status = t3Status([started, paused, resumed, publicado], calendar, new Date("2026-09-04T10:00:00Z"), "small");
      expect(status.elapsedMinutes).toBe(4 * 60);
    });
  });
});

describe("CA-14 · RN-SLA-17: \"Fuera de plazo\" es una condición calculada, no un estado", () => {
  const vencido = { elapsedMinutes: 5000, totalMinutes: 4320, remainingMinutes: 0, percentUsed: 115, overdue: true };
  const enPlazo = { elapsedMinutes: 60, totalMinutes: 4320, remainingMinutes: 4260, percentUsed: 1.4, overdue: false };

  it("puede coexistir con En curso: el estado sigue siendo in_progress", () => {
    expect(jobDeadlineCondition("in_progress", { t3: vencido })).toEqual({
      state: "in_progress",
      outOfDeadline: true,
      counter: "t3",
    });
  });

  it("puede coexistir con Bloqueado: el estado sigue siendo blocked_by_client", () => {
    expect(jobDeadlineCondition("blocked_by_client", { t3: vencido })).toEqual({
      state: "blocked_by_client",
      outOfDeadline: true,
      counter: "t3",
    });
  });

  it("y con una pausa autorizada o una corrección en curso", () => {
    expect(jobDeadlineCondition("authorized_pause", { t3: vencido }).outOfDeadline).toBe(true);
    expect(jobDeadlineCondition("in_correction", { t3: vencido }).outOfDeadline).toBe(true);
  });

  it("antes de Comenzar la condición la decide T2, no T3", () => {
    expect(jobDeadlineCondition("assigned", { t2: vencido, t3: enPlazo })).toEqual({
      state: "assigned",
      outOfDeadline: true,
      counter: "t2",
    });
  });

  it("un trabajo asignado con T2 en plazo no está fuera de plazo", () => {
    expect(jobDeadlineCondition("assigned", { t2: enPlazo }).outOfDeadline).toBe(false);
  });

  it("RN-ASG-05: sin asignar todavía no hay plazo de inicio en marcha", () => {
    expect(jobDeadlineCondition("pending_assignment", {})).toEqual({
      state: "pending_assignment",
      outOfDeadline: false,
      counter: null,
    });
  });

  it("RN-SLA-13: publicado o finalizado ya no puede estar fuera de plazo", () => {
    expect(jobDeadlineCondition("published", { t3: vencido }).outOfDeadline).toBe(false);
    expect(jobDeadlineCondition("completed", { t3: vencido }).outOfDeadline).toBe(false);
  });
});
