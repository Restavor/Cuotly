import { describe, expect, it } from "vitest";

import { slaNotificationsDue, t2NotificationsDue, t3NotificationsDue } from "./sla-sweep";
import type { CounterStatus } from "./sla-timers";

function status(elapsedMinutes: number, totalMinutes: number): CounterStatus {
  const remainingMinutes = Math.max(0, totalMinutes - elapsedMinutes);
  return {
    elapsedMinutes,
    totalMinutes,
    remainingMinutes,
    percentUsed: totalMinutes === 0 ? 0 : (elapsedMinutes / totalMinutes) * 100,
    overdue: elapsedMinutes > totalMinutes,
  };
}

// T2 de Impulso/Premium: 24 h laborables = 1440 minutos.
const T2_TOTAL = 24 * 60;
// T3 de un cambio pequeño: 72 h laborables.
const T3_TOTAL = 72 * 60;

describe("RN-SLA-10 · avisos del plazo de inicio (T2)", () => {
  it("RN-SLA-10: recién arrancado no toca ningún aviso", () => {
    expect(t2NotificationsDue(status(0, T2_TOTAL))).toEqual([]);
  });

  it("RN-SLA-10: al 50 % toca el primero y solo el primero", () => {
    const due = t2NotificationsDue(status(T2_TOTAL * 0.5, T2_TOTAL));
    expect(due.map((d) => d.event)).toEqual(["t2_threshold_50"]);
    expect(due[0]?.thresholdPercent).toBe(50);
  });

  it("RN-SLA-10: al 80 % se acumulan los umbrales ya pasados", () => {
    expect(t2NotificationsDue(status(T2_TOTAL * 0.8, T2_TOTAL)).map((d) => d.event))
      .toEqual(["t2_threshold_50", "t2_threshold_80"]);
  });

  it("RN-SLA-10: con 2 h laborables restantes entra la alerta crítica", () => {
    const due = t2NotificationsDue(status(T2_TOTAL - 120, T2_TOTAL)).map((d) => d.event);
    expect(due).toContain("t2_critical_alert");
    expect(due).not.toContain("t2_reassignment_suggestion");
  });

  it("RN-SLA-10: con 1 h laborable restante entra también la sugerencia de reasignación", () => {
    const due = t2NotificationsDue(status(T2_TOTAL - 60, T2_TOTAL)).map((d) => d.event);
    expect(due).toContain("t2_critical_alert");
    expect(due).toContain("t2_reassignment_suggestion");
  });

  it("RN-SLA-10: la alerta de 2 h y el 100 % no son el mismo momento", () => {
    // 48 h laborables (Básico): al 100 % faltan 0 minutos, pero la alerta
    // de 2 h entró mucho antes. Con un plazo corto podrían solaparse; el
    // aviso es de tiempo restante, no de porcentaje.
    const largo = status(48 * 60 - 120, 48 * 60);
    expect(t2NotificationsDue(largo).map((d) => d.event)).toContain("t2_critical_alert");
    expect(t2NotificationsDue(largo).map((d) => d.event)).not.toContain("t2_threshold_100");
  });

  it("RN-SLA-10: pasado el plazo siguen los tres umbrales, no se pierde el 100 %", () => {
    expect(t2NotificationsDue(status(T2_TOTAL * 1.5, T2_TOTAL)).map((d) => d.event))
      .toEqual(expect.arrayContaining(["t2_threshold_50", "t2_threshold_80", "t2_threshold_100"]));
  });
});

describe("RN-SLA-15 · avisos del plazo de ejecución (T3)", () => {
  it("RN-SLA-15: los umbrales de T3 son 75, 90 y 100, no los de T2", () => {
    expect(t3NotificationsDue(status(T3_TOTAL * 0.5, T3_TOTAL))).toEqual([]);
    expect(t3NotificationsDue(status(T3_TOTAL * 0.75, T3_TOTAL)).map((d) => d.event))
      .toEqual(["t3_threshold_75"]);
    expect(t3NotificationsDue(status(T3_TOTAL, T3_TOTAL)).map((d) => d.event))
      .toEqual(["t3_threshold_75", "t3_threshold_90", "t3_threshold_100"]);
  });

  it("RN-SLA-15: T3 no lleva alerta crítica ni sugerencia de reasignación", () => {
    const due = t3NotificationsDue(status(T3_TOTAL - 30, T3_TOTAL)).map((d) => d.event);
    expect(due).not.toContain("t2_critical_alert");
    expect(due).not.toContain("t2_reassignment_suggestion");
  });
});

describe("PRD §8 · los contadores no se mezclan", () => {
  it("RN-SLA: el mismo porcentaje da avisos distintos según el contador", () => {
    const medio = status(50, 100);
    expect(slaNotificationsDue("t2", medio).map((d) => d.event)).toContain("t2_threshold_50");
    expect(slaNotificationsDue("t3", medio).map((d) => d.event)).toEqual([]);
  });
});
