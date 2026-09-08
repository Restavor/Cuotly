import { describe, expect, it } from "vitest";

import {
  countJobsAtDeadlineRisk,
  dayDistance,
  dayKeyInTimeZone,
  jobDeadlineRisk,
  OPEN_JOB_STATES,
  PENDING_REQUEST_STATES,
  sortAttentionItems,
  splitRemaining,
  type AttentionItem,
} from "./home";
import type { CounterStatus } from "./sla-timers";

/** Un contador con el porcentaje y el tiempo restante que hagan falta. */
function counter(totalMinutes: number, elapsedMinutes: number): CounterStatus {
  return {
    elapsedMinutes,
    totalMinutes,
    remainingMinutes: Math.max(totalMinutes - elapsedMinutes, 0),
    percentUsed: totalMinutes === 0 ? 0 : (elapsedMinutes / totalMinutes) * 100,
    overdue: elapsedMinutes > totalMinutes,
  };
}

const T2_TOTAL = 24 * 60; // RN-SLA-06, plan con plazo acelerado.
const T3_TOTAL = 72 * 60; // RN-SLA-12, categoría pequeña.

describe("RN-SLA-10 · el plazo de inicio en riesgo son las 2 h laborables de la alerta", () => {
  it("RN-SLA-10: con más de 2 h laborables por delante, un trabajo asignado no está en riesgo", () => {
    const riesgo = jobDeadlineRisk("assigned", { t2: counter(T2_TOTAL, T2_TOTAL - 121) });
    expect(riesgo.risk).toBe("none");
    expect(riesgo.counter).toBe("t2");
  });

  it("RN-SLA-10: con exactamente 2 h laborables restantes ya está en riesgo", () => {
    expect(jobDeadlineRisk("assigned", { t2: counter(T2_TOTAL, T2_TOTAL - 120) }).risk).toBe(
      "about_to_expire",
    );
  });

  it("RN-SLA-10: el umbral es de tiempo restante, no de porcentaje", () => {
    // Con 48 h de plazo, el 80 % consumido deja casi 10 h por delante: no
    // es riesgo. Confundir las dos cosas llenaría el Inicio de trabajos
    // que llegan de sobra.
    const holgado = jobDeadlineRisk("assigned", { t2: counter(48 * 60, 48 * 60 * 0.8) });
    expect(holgado.risk).toBe("none");
  });
});

describe("RN-SLA-15 · el plazo de ejecución en riesgo es su último aviso, el 90 %", () => {
  it("RN-SLA-15: al 89 % un trabajo en curso todavía no está en riesgo", () => {
    expect(jobDeadlineRisk("in_progress", { t3: counter(T3_TOTAL, T3_TOTAL * 0.89) }).risk).toBe(
      "none",
    );
  });

  it("RN-SLA-15: al 90 % sí", () => {
    expect(jobDeadlineRisk("in_progress", { t3: counter(T3_TOTAL, T3_TOTAL * 0.9) }).risk).toBe(
      "about_to_expire",
    );
  });

  it("RN-SLA-14: un trabajo bloqueado se sigue midiendo con T3, que está pausado", () => {
    const riesgo = jobDeadlineRisk("blocked_by_client", { t3: counter(T3_TOTAL, T3_TOTAL * 0.95) });
    expect(riesgo.counter).toBe("t3");
    expect(riesgo.risk).toBe("about_to_expire");
  });
});

describe("RN-SLA-17 · fuera de plazo no es 'a punto de': gana siempre", () => {
  it("RN-SLA-17: un T2 agotado se cuenta como fuera de plazo, no como riesgo", () => {
    expect(jobDeadlineRisk("assigned", { t2: counter(T2_TOTAL, T2_TOTAL + 1) }).risk).toBe(
      "out_of_deadline",
    );
  });

  it("RN-SLA-17: un T3 agotado, igual", () => {
    expect(jobDeadlineRisk("in_progress", { t3: counter(T3_TOTAL, T3_TOTAL + 30) }).risk).toBe(
      "out_of_deadline",
    );
  });
});

describe("RN-ASG-05 · sin responsable no hay plazo de inicio corriendo", () => {
  it("RN-ASG-05: un trabajo pendiente de asignar no está en riesgo por su reloj", () => {
    // Aunque le pasáramos un contador agotado: en ese estado no manda
    // ninguno, y el trabajo aparece en el Inicio porque nadie lo ha
    // asumido, no porque se le acabe el tiempo.
    const riesgo = jobDeadlineRisk("pending_assignment", { t2: counter(T2_TOTAL, T2_TOTAL + 999) });
    expect(riesgo.risk).toBe("none");
    expect(riesgo.counter).toBeNull();
  });

  it("un trabajo publicado ya no consume plazo", () => {
    expect(jobDeadlineRisk("published", { t3: counter(T3_TOTAL, T3_TOTAL + 999) }).risk).toBe("none");
  });
});

describe("El contador de 'trabajos próximos a vencer' cuenta los dos casos", () => {
  it("§20.4: cuenta los que están a punto y los que ya se pasaron, y ninguno más", () => {
    expect(
      countJobsAtDeadlineRisk([
        { risk: "none" },
        { risk: "about_to_expire" },
        { risk: "out_of_deadline" },
        { risk: "none" },
      ]),
    ).toBe(2);
  });
});

describe("'Necesita atención' se ordena igual en cada recarga", () => {
  const fila = (
    kind: AttentionItem["kind"],
    id: string,
    remainingMinutes: number | null = null,
  ): AttentionItem => ({
    kind,
    id,
    title: id,
    establishment: null,
    deepLink: `/${id}`,
    remainingMinutes,
    counter: remainingMinutes === null ? null : "t2",
  });

  it("lo que ya está fuera de plazo va antes que lo que está a punto", () => {
    const ordenado = sortAttentionItems([
      fila("request_pending_validation", "c"),
      fila("job_about_to_expire", "b", 90),
      fila("job_out_of_deadline", "a", 0),
    ]);
    expect(ordenado.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("dentro del mismo motivo manda el que menos tiempo tiene", () => {
    const ordenado = sortAttentionItems([
      fila("job_about_to_expire", "tarde", 110),
      fila("job_about_to_expire", "pronto", 15),
    ]);
    expect(ordenado.map((f) => f.id)).toEqual(["pronto", "tarde"]);
  });

  it("una fila sin contador no se cuela delante de una que sí lo tiene", () => {
    const ordenado = sortAttentionItems([
      fila("job_about_to_expire", "sin-reloj", null),
      fila("job_about_to_expire", "con-reloj", 100),
    ]);
    expect(ordenado.map((f) => f.id)).toEqual(["con-reloj", "sin-reloj"]);
  });

  it("con todo empatado desempata el identificador, para que el orden no baile", () => {
    const uno = sortAttentionItems([fila("job_blocked_by_client", "z"), fila("job_blocked_by_client", "a")]);
    const otro = sortAttentionItems([fila("job_blocked_by_client", "a"), fila("job_blocked_by_client", "z")]);
    expect(uno.map((f) => f.id)).toEqual(["a", "z"]);
    expect(otro.map((f) => f.id)).toEqual(uno.map((f) => f.id));
  });

  it("no modifica la lista que recibe", () => {
    const original = [fila("job_blocked_by_client", "z"), fila("job_out_of_deadline", "a")];
    sortAttentionItems(original);
    expect(original.map((f) => f.id)).toEqual(["z", "a"]);
  });
});

describe("El tiempo restante se dice redondeando hacia abajo", () => {
  it("2 h 59 min son 2 h, nunca 3", () => {
    expect(splitRemaining(179)).toEqual({ hours: 2, minutes: 59 });
  });

  it("un contador agotado no dice tiempo negativo", () => {
    expect(splitRemaining(-30)).toEqual({ hours: 0, minutes: 0 });
  });
});

describe("Los contadores del resumen se derivan de los estados, no de una lista a mano", () => {
  it("RN-REQ-01: 'pendientes' son las abiertas antes de aceptar, sin el borrador", () => {
    expect([...PENDING_REQUEST_STATES]).toEqual([
      "received",
      "analyzing",
      "needs_information",
      "pending_internal_validation",
      "pending_client_acceptance",
    ]);
  });

  it("ni el borrador ni ningún estado final cuentan como pendiente", () => {
    for (const estado of ["draft", "accepted", "published", "closed", "rejected"] as const) {
      expect(PENDING_REQUEST_STATES, estado).not.toContain(estado);
    }
  });

  it("RN-JOB-13: los estados vivos son todos menos los cuatro terminados", () => {
    expect([...OPEN_JOB_STATES]).toEqual([
      "pending_assignment",
      "assigned",
      "reassignment_requested",
      "in_progress",
      "blocked_by_client",
      "authorized_pause",
      "in_correction",
    ]);
  });
});

describe("La actividad reciente se fecha en la zona horaria del espacio", () => {
  const MADRID = "Europe/Madrid";

  it("RN-CLK-06: el día se cuenta en la zona del espacio, no en UTC", () => {
    // 22:30 UTC del 7 de septiembre son las 00:30 del 8 en Madrid: en la
    // zona del espacio eso ya es otro día.
    expect(dayKeyInTimeZone(new Date("2026-09-07T22:30:00Z"), MADRID)).toBe("2026-09-08");
    expect(dayKeyInTimeZone(new Date("2026-09-07T22:30:00Z"), "UTC")).toBe("2026-09-07");
  });

  it("lo de anoche es 'ayer' aunque hayan pasado pocos minutos", () => {
    const anoche = new Date("2026-09-07T21:50:00Z"); // 23:50 en Madrid, día 7
    const ahora = new Date("2026-09-07T22:30:00Z"); // 00:30 en Madrid, día 8
    expect(dayDistance(anoche, ahora, MADRID)).toBe("yesterday");
  });

  it("lo de hace un rato del mismo día es 'hoy'", () => {
    expect(
      dayDistance(new Date("2026-09-08T08:00:00Z"), new Date("2026-09-08T10:00:00Z"), MADRID),
    ).toBe("today");
  });

  it("lo de la semana pasada no es ni hoy ni ayer", () => {
    expect(
      dayDistance(new Date("2026-09-01T10:00:00Z"), new Date("2026-09-08T10:00:00Z"), MADRID),
    ).toBe("older");
  });
});
