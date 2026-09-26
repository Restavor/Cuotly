import { describe, expect, it } from "vitest";
import {
  PROCESSING_HALF,
  breakdownTotal,
  clientSlaRange,
  creditExecutionSlaHours,
  creditFit,
  formatCredits,
  percentOfPlan,
} from "./credits";

describe("RN-CRE-04 · medios créditos escritos como créditos", () => {
  it("escribe enteros y medios con coma", () => {
    expect(formatCredits(1)).toBe("0,5");
    expect(formatCredits(7)).toBe("3,5");
    expect(formatCredits(40)).toBe("20");
    expect(formatCredits(0)).toBe("0");
  });

  it("no acepta decimales ni negativos", () => {
    expect(() => formatCredits(1.5)).toThrow(RangeError);
    expect(() => formatCredits(-1)).toThrow(RangeError);
  });
});

describe("RN-CRE-05 · 0,5 de procesamiento más las partidas", () => {
  it("el ejemplo del documento: cuatro cambios simples cuestan 2,5 créditos", () => {
    const total = breakdownTotal([
      { description: "Cambiar un precio", creditsHalf: 1 },
      { description: "Cambiar un horario", creditsHalf: 1 },
      { description: "Cambiar un teléfono", creditsHalf: 1 },
      { description: "Cambiar un enlace", creditsHalf: 1 },
    ]);
    expect(total).toBe(5);
    expect(formatCredits(total)).toBe("2,5");
  });

  it("una solicitud sin partidas cuesta solo el procesamiento", () => {
    expect(breakdownTotal([])).toBe(PROCESSING_HALF);
  });
});

describe("RN-CRE-16 · el porcentaje del plan", () => {
  it("los ejemplos del documento en Impulso (20 créditos) y Premium (40)", () => {
    // 6,5 créditos: 13 medios.
    expect(percentOfPlan(13, 40)).toBe(33);
    expect(percentOfPlan(13, 80)).toBe(16);
    expect(percentOfPlan(40, 40)).toBe(100);
    expect(percentOfPlan(8, 40)).toBe(20);
  });

  it("no pasa de 100 y sin créditos no hay porcentaje", () => {
    expect(percentOfPlan(50, 40)).toBe(100);
    expect(percentOfPlan(5, 0)).toBeNull();
  });
});

describe("RN-CRE-18 y RN-CRE-19 · el plazo por créditos", () => {
  it.each([
    [1, 48],
    [8, 48],
    [9, 72],
    [20, 72],
    [21, 96],
    [30, 96],
    [31, 120],
    [40, 120],
  ])("%i medios créditos → %i h laborables", (half, hours) => {
    expect(creditExecutionSlaHours(half)).toBe(hours);
  });

  it("por encima de 20 créditos no hay plazo automático", () => {
    expect(creditExecutionSlaHours(41)).toBeNull();
    expect(clientSlaRange(41)).toBeNull();
  });

  it("lo que ve el cliente va de 1 al máximo del tramo", () => {
    expect(clientSlaRange(8)).toEqual({ minDays: 1, maxDays: 2 });
    expect(clientSlaRange(40)).toEqual({ minDays: 1, maxDays: 5 });
  });
});

describe("RN-CRE-14 · si no llega", () => {
  it("cabe: se acepta", () => {
    expect(creditFit(8, 33, 40)).toBe("accept");
  });

  it("no cabe ahora pero sí en un ciclo: las tres salidas", () => {
    expect(creditFit(34, 33, 40)).toBe("choose");
  });

  it("no cabe ni en un ciclo entero: esperar no sirve", () => {
    expect(creditFit(41, 40, 40)).toBe("quote_or_trim");
  });

  it("sin créditos en el plan: presupuesto (RN-CRE-07)", () => {
    expect(creditFit(2, 0, 0)).toBe("quote");
  });
});
