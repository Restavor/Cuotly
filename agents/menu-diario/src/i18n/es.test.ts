import { describe, expect, it } from "vitest";
import { localClock } from "../core/clock.ts";
import { TASK_STATES } from "../core/task-state.ts";
import { es, formatClock } from "./es.ts";

const MADRID = "Europe/Madrid";

function clockOf(iso: string, timeZone = MADRID) {
  const r = localClock(new Date(iso), timeZone);
  if (!r.ok) throw new Error(`error inesperado: ${r.error}`);
  return r.value;
}

describe("i18n · textos en español de los códigos del núcleo", () => {
  it("el motivo «La fecha del menú ya ha pasado» es el del PRD (§7.1)", () => {
    expect(es.orderReason.date_in_past).toBe("La fecha del menú ya ha pasado");
    expect(es.publishFromError.date_in_past).toBe("La fecha del menú ya ha pasado");
  });

  it("el motivo «Ya hay publicado un menú de un día posterior» es el del PRD (§7.1)", () => {
    expect(es.orderReason.later_day_already_published).toBe("Ya hay publicado un menú de un día posterior");
  });

  it("todo estado de tarea tiene etiqueta en español y ninguna está vacía", () => {
    for (const estado of TASK_STATES) expect(es.taskState[estado].length).toBeGreaterThan(0);
    expect(Object.keys(es.taskState).sort()).toEqual([...TASK_STATES].sort());
  });

  it("hay siete días y doce meses", () => {
    expect(es.clock.weekdays).toHaveLength(7);
    expect(es.clock.months).toHaveLength(12);
  });
});

describe("RA-08 · el agente escribe qué día y hora es (decisión 158)", () => {
  it("RA-08 · el ejemplo de Bosco: sábado 3 de octubre de 2026, 18:42, hora de Madrid", () => {
    expect(formatClock(clockOf("2026-10-03T16:42:00Z"))).toBe(
      "Hoy es sábado 3 de octubre de 2026, 18:42, hora de Madrid (UTC+02:00)",
    );
  });

  it("RA-08 · en invierno el desfase es UTC+01:00", () => {
    expect(formatClock(clockOf("2026-02-10T10:00:00Z"))).toBe(
      "Hoy es martes 10 de febrero de 2026, 11:00, hora de Madrid (UTC+01:00)",
    );
  });

  it("RA-08 · dice el día, el mes y el año locales aunque en UTC sea otro día", () => {
    // 23:30 UTC del 10/02 ya es el 11/02 en Madrid.
    expect(formatClock(clockOf("2026-02-10T23:30:00Z"))).toContain("miércoles 11 de febrero de 2026, 00:30");
  });

  it("RA-08 · otra zona con media hora de desfase se escribe bien", () => {
    expect(formatClock(clockOf("2026-10-03T12:00:00Z", "Asia/Kolkata"))).toBe(
      "Hoy es sábado 3 de octubre de 2026, 17:30, hora de Kolkata (UTC+05:30)",
    );
  });

  it("RA-08 · hay texto en español para los dos errores del reloj", () => {
    expect(es.clock.clockSkew.length).toBeGreaterThan(10);
    expect(es.clock.invalidClock.length).toBeGreaterThan(10);
  });
});
