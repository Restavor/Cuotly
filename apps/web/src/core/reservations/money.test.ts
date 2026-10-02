import { describe, expect, it } from "vitest";

import { formatCentsAsEuros } from "./money";

/** `Intl` separa el importe del símbolo con un espacio duro: se normaliza para comparar. */
const plano = (texto: string) => texto.replace(/\s/g, " ");

describe("RN-AGT-01 · el saldo se enseña al céntimo, en euros", () => {
  it("RN-AGT-01 · 740 céntimos son «7,40 €» y 180, «1,80 €» (los saldos de Casa Pepe y Bar La Plaza)", () => {
    expect(plano(formatCentsAsEuros(740))).toBe("7,40 €");
    expect(plano(formatCentsAsEuros(180))).toBe("1,80 €");
  });

  it("RN-AGT-01 · cero y miles", () => {
    expect(plano(formatCentsAsEuros(0))).toBe("0,00 €");
    expect(plano(formatCentsAsEuros(123456))).toBe("1234,56 €");
  });

  it("RN-AGT-01 · un saldo negativo (una llamada que agotó el saldo, RN-AGT-07) se enseña con su signo", () => {
    expect(plano(formatCentsAsEuros(-12))).toBe("-0,12 €");
  });

  it("RN-AGT-01 · lo que no es un número de céntimos enteros no se enseña", () => {
    expect(() => formatCentsAsEuros(7.4)).toThrow(RangeError);
    expect(() => formatCentsAsEuros(Number.NaN)).toThrow(RangeError);
  });
});
