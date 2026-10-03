import { describe, expect, it } from "vitest";

import {
  balanceState,
  canAffordNotice,
  noticePriceAdjustment,
  toEurMicros,
  formatCallTime,
  isCardTopup,
  isMovementKind,
  microsToCents,
  MIN_TOPUP_CENTS,
  monthStart,
  parseCustomTopup,
  parseEuros,
  parseEurosToMicros,
  formatMicrosAsEuros,
  spendSummary,
  topupAmounts,
  TOPUP_PRESETS_CENTS,
  vatCents,
} from "./balance";

describe("RN-AGT-04 · el IVA de una recarga (las mismas cuentas que la base de datos)", () => {
  it("20 € + 21 % de IVA = 4,20 € de IVA y 24,20 € en total (el ejemplo de la maqueta y de la suite 94)", () => {
    expect(topupAmounts(2000, 21)).toEqual({ netCents: 2000, vatCents: 420, totalCents: 2420 });
  });

  it("el medio céntimo se aleja de cero: 20,50 € al 21 % → 4,31 € de IVA", () => {
    expect(vatCents(2050, 21)).toBe(431);
    expect(topupAmounts(2050, 21).totalCents).toBe(2481);
  });

  it("el tipo del espacio manda: al 10 %, 20 € → 2,00 €", () => {
    expect(vatCents(2000, 10)).toBe(200);
  });

  it("un tipo con decimales no arrastra errores de coma flotante (7,5 % de 10 € = 0,75 €; 12,5 % de 4 céntimos = 1)", () => {
    expect(vatCents(1000, 7.5)).toBe(75);
    expect(vatCents(4, 12.5)).toBe(1);
    expect(vatCents(3, 12.5)).toBe(0);
  });

  it("sin IVA, el total es el neto", () => {
    expect(topupAmounts(1000, 0)).toEqual({ netCents: 1000, vatCents: 0, totalCents: 1000 });
  });

  it("el IVA no es saldo: sube lo neto, se paga el total", () => {
    const { netCents, totalCents } = topupAmounts(5000, 21);
    expect(netCents).toBe(5000);
    expect(totalCents).toBe(6050);
  });

  it("los importes de un clic son 10, 20 y 50 € y el mínimo son 10 €", () => {
    expect(TOPUP_PRESETS_CENTS).toEqual([1000, 2000, 5000]);
    expect(MIN_TOPUP_CENTS).toBe(1000);
  });

  it("no acepta importes ni tipos absurdos", () => {
    expect(() => vatCents(-1, 21)).toThrow(RangeError);
    expect(() => vatCents(1.5, 21)).toThrow(RangeError);
    expect(() => vatCents(100, -5)).toThrow(RangeError);
    expect(() => vatCents(100, Number.NaN)).toThrow(RangeError);
  });
});

describe("RN-AGT-04 · «otro importe» (mínimo 10 €)", () => {
  it.each([
    ["12", 1200],
    ["12,5", 1250],
    ["12.50", 1250],
    ["10", 1000],
    ["10,00", 1000],
    [" 25 ", 2500],
  ])("«%s» son %i céntimos", (input, cents) => {
    expect(parseCustomTopup(input)).toEqual({ ok: true, cents });
  });

  it("menos de 10 € no vale", () => {
    expect(parseCustomTopup("9,99")).toEqual({ ok: false, reason: "too_small" });
    expect(parseCustomTopup("0")).toEqual({ ok: false, reason: "too_small" });
  });

  it("vacío, con símbolos, con tres decimales o negativo, tampoco", () => {
    expect(parseCustomTopup("")).toEqual({ ok: false, reason: "empty" });
    expect(parseCustomTopup("   ")).toEqual({ ok: false, reason: "empty" });
    expect(parseCustomTopup("12 €")).toEqual({ ok: false, reason: "invalid" });
    expect(parseCustomTopup("12,345")).toEqual({ ok: false, reason: "invalid" });
    expect(parseCustomTopup("-20")).toEqual({ ok: false, reason: "invalid" });
    expect(parseCustomTopup("1.000,50")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("RN-AGT-01 · millonésimas a céntimos", () => {
  it("redondea al céntimo con el redondeo de la base (medio céntimo se aleja de cero)", () => {
    expect(microsToCents(7_400_000)).toBe(740);
    expect(microsToCents(5_000)).toBe(1);
    expect(microsToCents(4_999)).toBe(0);
    expect(microsToCents(15_000)).toBe(2);
    expect(microsToCents(-5_000)).toBe(-1);
    expect(microsToCents(-4_999)).toBe(0);
    expect(microsToCents(0)).toBe(0);
  });
});

describe("RN-AGT-05 y RN-AGT-06 · en qué punto está el saldo", () => {
  it("a 0 o menos, agotado", () => {
    expect(balanceState(0, 500)).toBe("empty");
    expect(balanceState(-12, 500)).toBe("empty");
  });

  it("por debajo del umbral (5 €), bajo; en el umbral, bien", () => {
    expect(balanceState(499, 500)).toBe("low");
    expect(balanceState(500, 500)).toBe("ok");
    expect(balanceState(740, 500)).toBe("ok");
  });

  it("con el umbral en 0 no hay «bajo», pero sí «agotado»", () => {
    expect(balanceState(1, 0)).toBe("ok");
    expect(balanceState(0, 0)).toBe("empty");
  });
});

describe("RN-AGT-09 · lo que se enseña de las llamadas", () => {
  it("5 h 32 min, 12 min, 2 h, 45 s", () => {
    expect(formatCallTime(5 * 3600 + 32 * 60)).toBe("5 h 32 min");
    expect(formatCallTime(12 * 60)).toBe("12 min");
    expect(formatCallTime(2 * 3600)).toBe("2 h");
    expect(formatCallTime(45)).toBe("45 s");
    expect(formatCallTime(0)).toBe("0 min");
  });

  it("no acepta una duración negativa", () => {
    expect(() => formatCallTime(-1)).toThrow(RangeError);
  });
});

describe("el mes del gasto se cuenta en la zona del restaurante", () => {
  it("las 00:30 del 1 de octubre en Madrid ya son de octubre, aunque en UTC sigan en septiembre", () => {
    const instant = new Date("2026-09-30T22:30:00Z");
    expect(monthStart(instant, "Europe/Madrid")).toBe("2026-10-01");
    expect(monthStart(instant, "UTC")).toBe("2026-09-01");
  });

  it("una zona que no existe se dice, no se inventa", () => {
    expect(() => monthStart(new Date(), "Marte/Olimpo")).toThrow();
  });
});

describe("RN-AGT-09 · el gasto del mes por tipo", () => {
  const raw = {
    by_kind: [
      { kind: "adjustment", entries: 1, micros: 5_760_000 },
      { kind: "call", entries: 212, micros: -34_860_000 },
      { kind: "refund", entries: 2, micros: 40_000 },
      { kind: "sms", entries: 6, micros: -480_000 },
      { kind: "topup", entries: 2, micros: 40_000_000 },
      { kind: "whatsapp", entries: 182, micros: -3_020_000 },
    ],
    calls: { count: 212, seconds: 19_920 },
  };

  it("enseña llamadas, WhatsApp y SMS con su gasto; las recargas y los ajustes no son gasto", () => {
    const s = spendSummary(raw);
    expect(s.rows).toEqual([
      { kind: "call", entries: 212, cents: 3486 },
      { kind: "whatsapp", entries: 182, cents: 302 },
      { kind: "sms", entries: 6, cents: 48 },
    ]);
  });

  it("lo devuelto se enseña aparte y se resta del total", () => {
    const s = spendSummary(raw);
    expect(s.refundedCents).toBe(4);
    expect(s.totalCents).toBe(3486 + 302 + 48 - 4);
  });

  it("las llamadas del mes: cuántas y cuánto tiempo (212 llamadas · 5 h 32 min)", () => {
    const s = spendSummary(raw);
    expect(s.calls).toEqual({ count: 212, seconds: 19_920 });
    expect(formatCallTime(s.calls.seconds)).toBe("5 h 32 min");
  });

  it("sin gasto no hay filas: no se inventa ninguna", () => {
    expect(spendSummary({ by_kind: [], calls: { count: 0, seconds: 0 } })).toEqual({
      rows: [],
      refundedCents: 0,
      totalCents: 0,
      calls: { count: 0, seconds: 0 },
    });
    expect(spendSummary(null).rows).toEqual([]);
    expect(spendSummary(undefined).totalCents).toBe(0);
  });
});

describe("los tipos de apunte", () => {
  it("reconoce los siete del libro (RN-AGT-02)", () => {
    for (const kind of ["topup", "call", "whatsapp", "sms", "refund", "adjustment", "payout"]) {
      expect(isMovementKind(kind)).toBe(true);
    }
    expect(isMovementKind("regalo")).toBe(false);
  });

  it("una recarga con tarjeta se distingue de una registrada a mano", () => {
    expect(isCardTopup("topup")).toBe(true);
    expect(isCardTopup("manual_topup")).toBe(false);
    expect(isCardTopup(null)).toBe(false);
  });
});

describe("RN-AGT-02 · un importe en euros escrito a mano (recarga a mano, ajuste, devolución)", () => {
  it.each([
    ["20", 2000],
    ["20,5", 2050],
    ["0,01", 1],
    ["1234.56", 123456],
    ["+4", 400],
  ])("«%s» son %i céntimos", (input, cents) => {
    expect(parseEuros(input, { signed: true })).toEqual({ ok: true, cents });
  });

  it("un ajuste puede restar si se declara con signo", () => {
    expect(parseEuros("-1,50", { signed: true })).toEqual({ ok: true, cents: -150 });
  });

  it("sin signo permitido, un negativo no vale (una recarga o una devolución no restan)", () => {
    expect(parseEuros("-5")).toEqual({ ok: false, reason: "negative" });
  });

  it("cero no vale: un apunte de cero no existe", () => {
    expect(parseEuros("0")).toEqual({ ok: false, reason: "zero" });
    expect(parseEuros("0,00", { signed: true })).toEqual({ ok: false, reason: "zero" });
    expect(parseEuros("-0", { signed: true })).toEqual({ ok: false, reason: "zero" });
  });

  it("vacío, con símbolos o con tres decimales, tampoco", () => {
    expect(parseEuros("")).toEqual({ ok: false, reason: "empty" });
    expect(parseEuros("12 €")).toEqual({ ok: false, reason: "invalid" });
    expect(parseEuros("1,234")).toEqual({ ok: false, reason: "invalid" });
    expect(parseEuros("1.000,50")).toEqual({ ok: false, reason: "invalid" });
    expect(parseEuros("abc")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("RN-AGT-03 · el precio de un mensaje, en millonésimas", () => {
  it.each([
    ["0,016", 16_000],
    ["0.08", 80_000],
    ["1", 1_000_000],
    ["0,000001", 1],
    ["0", 0],
    ["12,5", 12_500_000],
  ])("«%s» son %i millonésimas", (input, micros) => {
    expect(parseEurosToMicros(input)).toEqual({ ok: true, micros });
  });

  it("vacío, negativo o con siete decimales no valen", () => {
    expect(parseEurosToMicros("")).toEqual({ ok: false, reason: "empty" });
    expect(parseEurosToMicros("-0,01")).toEqual({ ok: false, reason: "invalid" });
    expect(parseEurosToMicros("0,0000001")).toEqual({ ok: false, reason: "invalid" });
    expect(parseEurosToMicros("1.234,5")).toEqual({ ok: false, reason: "invalid" });
    expect(parseEurosToMicros("abc")).toEqual({ ok: false, reason: "invalid" });
  });

  it("se enseña sin redondear al céntimo: 16.000 → 0,016 €, 80.000 → 0,08 €", () => {
    expect(formatMicrosAsEuros(16_000)).toBe("0,016 €");
    expect(formatMicrosAsEuros(80_000)).toBe("0,08 €");
    expect(formatMicrosAsEuros(0)).toBe("0,00 €");
    expect(() => formatMicrosAsEuros(-1)).toThrow(RangeError);
  });
});

describe("RN-AGT-07 · el coste de un aviso de WhatsApp o SMS", () => {
  it("RN-AGT-07 · sale con saldo igual o mayor que su precio, no con menos", () => {
    expect(canAffordNotice(16_000, 16_000)).toBe(true);
    expect(canAffordNotice(16_001, 16_000)).toBe(true);
    expect(canAffordNotice(15_999, 16_000)).toBe(false);
    expect(canAffordNotice(0, 16_000)).toBe(false);
    expect(canAffordNotice(-1, 0)).toBe(false);
  });

  it("RN-AGT-07 · un importe en euros pasa a millonésimas; en otra moneda, con el cambio que multiplica", () => {
    expect(toEurMicros(0.08, "EUR", null)).toBe(80_000);
    expect(toEurMicros(0.016, "eur", null)).toBe(16_000);
    expect(toEurMicros(0.2, "USD", 0.5)).toBe(100_000);
    expect(toEurMicros(0, "EUR", null)).toBe(0);
  });

  it("RN-AGT-07 · sin cambio para otra moneda no hay precio: nunca se toma el importe como euros", () => {
    expect(toEurMicros(0.2, "USD", null)).toBeNull();
    expect(toEurMicros(0.2, "USD", 0)).toBeNull();
    expect(toEurMicros(-1, "EUR", null)).toBeNull();
    expect(toEurMicros(Number.NaN, "EUR", null)).toBeNull();
  });

  it("RN-AGT-07 · la corrección del precio real: más caro cobra la diferencia, más barato la devuelve, igual no apunta nada", () => {
    // Cobrados 0,08 € (neto −80.000).
    expect(noticePriceAdjustment(-80_000, 100_000)).toBe(-20_000);
    expect(noticePriceAdjustment(-80_000, 50_000)).toBe(30_000);
    expect(noticePriceAdjustment(-80_000, 80_000)).toBe(0);
    // Devuelto y luego cobrado por el proveedor: se cobra lo que cobró.
    expect(noticePriceAdjustment(0, 40_000)).toBe(-40_000);
    expect(noticePriceAdjustment(0, 0)).toBe(0);
  });
});
