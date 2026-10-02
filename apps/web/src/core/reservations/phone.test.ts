import { describe, expect, it } from "vitest";
import { formatPhoneDisplay, isE164, normalizePhoneE164, phoneEndsWith, samePhone } from "./phone";

describe("RN-RES-06 · teléfonos en E.164", () => {
  it("RN-RES-06 · un móvil español se acepta con o sin prefijo, con espacios y separadores", () => {
    for (const entrada of [
      "612345678",
      "612 345 678",
      "612-345-678",
      "612.345.678",
      "+34612345678",
      "+34 612 345 678",
      "+34 (612) 345-678",
      "0034612345678",
      "00 34 612 345 678",
      "34612345678",
    ]) {
      expect(normalizePhoneE164(entrada), entrada).toEqual({ ok: true, value: "+34612345678" });
    }
  });

  it("RN-RES-06 · un fijo español (954 000 000) también", () => {
    expect(normalizePhoneE164("954 000 000")).toEqual({ ok: true, value: "+34954000000" });
    expect(normalizePhoneE164("+34 954 000 000")).toEqual({ ok: true, value: "+34954000000" });
  });

  it("RN-RES-06 · un número de otro país se acepta si tiene forma E.164", () => {
    expect(normalizePhoneE164("+44 20 7946 0958")).toEqual({ ok: true, value: "+442079460958" });
    expect(normalizePhoneE164("0044 20 7946 0958")).toEqual({ ok: true, value: "+442079460958" });
    expect(normalizePhoneE164("+1 415 555 0132")).toEqual({ ok: true, value: "+14155550132" });
  });

  it("RN-RES-06 · lo que no es un teléfono se rechaza con su motivo", () => {
    expect(normalizePhoneE164("")).toEqual({ ok: false, error: "empty" });
    expect(normalizePhoneE164("   ")).toEqual({ ok: false, error: "empty" });
    expect(normalizePhoneE164("llamar a Pepe")).toEqual({ ok: false, error: "invalid_characters" });
    expect(normalizePhoneE164("612 345 67x")).toEqual({ ok: false, error: "invalid_characters" });
    expect(normalizePhoneE164("61234567")).toEqual({ ok: false, error: "invalid_length" }); // 8 cifras
    expect(normalizePhoneE164("6123456789")).toEqual({ ok: false, error: "invalid_length" }); // 10 cifras
    expect(normalizePhoneE164("512345678")).toEqual({ ok: false, error: "invalid_number" }); // no empieza por 6 a 9
    expect(normalizePhoneE164("+34 512 345 678")).toEqual({ ok: false, error: "invalid_number" });
    expect(normalizePhoneE164("+34 612 345")).toEqual({ ok: false, error: "invalid_length" });
    expect(normalizePhoneE164("+0 123456789")).toEqual({ ok: false, error: "invalid_number" });
    expect(normalizePhoneE164("+12")).toEqual({ ok: false, error: "invalid_length" });
  });

  it("RN-RES-06 · dos teléfonos escritos distinto son el mismo si normalizan igual", () => {
    expect(samePhone("612 345 678", "+34 612-345-678")).toBe(true);
    expect(samePhone("0034 612345678", "612345678")).toBe(true);
    expect(samePhone("612 345 678", "612 345 679")).toBe(false);
    // Uno que no es teléfono nunca es igual a otro.
    expect(samePhone("hola", "hola")).toBe(false);
  });

  it("RN-RES-06 · isE164 reconoce la forma de salida", () => {
    expect(isE164("+34612345678")).toBe(true);
    expect(isE164("34612345678")).toBe(false);
    expect(isE164("+346")).toBe(false);
  });

  it("RN-RES-06 · bastan los tres últimos números para buscar", () => {
    expect(phoneEndsWith("+34612345678", "678")).toBe(true);
    expect(phoneEndsWith("+34612345678", "5 678")).toBe(true);
    expect(phoneEndsWith("+34612345678", "679")).toBe(false);
    // Menos de tres cifras no buscan nada.
    expect(phoneEndsWith("+34612345678", "78")).toBe(false);
  });
});

describe("RES-03 · el teléfono en pantalla", () => {
  it("RES-03 · un número español sale en grupos de tres y vuelve a normalizar al mismo E.164", () => {
    expect(formatPhoneDisplay("+34612345678")).toBe("612 345 678");
    const vuelta = normalizePhoneE164(formatPhoneDisplay("+34612345678"));
    expect(vuelta).toEqual({ ok: true, value: "+34612345678" });
  });
  it("RES-03 · un número de otro país se enseña tal cual", () => {
    expect(formatPhoneDisplay("+447911123456")).toBe("+447911123456");
  });
});
