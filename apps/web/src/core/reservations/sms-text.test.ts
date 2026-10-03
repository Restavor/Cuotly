import { describe, expect, it } from "vitest";

import { fitSms, isSmsSafe, SMS_MAX_LENGTH, toSmsSafe } from "./sms-text";

describe("AVI-04 · un SMS va sin tildes ni eñes y solo con caracteres básicos", () => {
  it("AVI-04 · «sábado» → «sabado», «España» → «Espana», «Mañana» → «Manana»", () => {
    expect(toSmsSafe("sábado")).toBe("sabado");
    expect(toSmsSafe("España")).toBe("Espana");
    expect(toSmsSafe("Mañana, ¿vienes? ¡Sí!")).toBe("Manana, vienes? Si!");
  });

  it("AVI-04 · los símbolos de tipografía pasan a ASCII", () => {
    expect(toSmsSafe("Bar “El Rincón” – Sevilla · 21:00")).toBe('Bar "El Rincon" - Sevilla - 21:00');
    expect(toSmsSafe("Pepe’s")).toBe("Pepe's");
    expect(toSmsSafe("10 €")).toBe("10 EUR");
  });

  it("AVI-04 · lo que no se puede transliterar se quita, y los saltos de línea pasan a espacio", () => {
    expect(toSmsSafe("Casa 🍤 Pepe\nSevilla")).toBe("Casa Pepe Sevilla");
    expect(toSmsSafe("a  b")).toBe("a b");
  });

  it("AVI-04 · los símbolos de extensión de GSM-7 (que cuentan doble) no pasan", () => {
    expect(isSmsSafe(toSmsSafe("a^b{c}[d]~e|f\\g"))).toBe(true);
    expect(toSmsSafe("a^b{c}[d]~e|f\\g")).toBe("abcdefg");
  });

  it("AVI-04 · lo que ya es seguro no cambia", () => {
    const text = "Casa Pepe: reserva confirmada sab 26/09 21:00, 4 pers. Cambios: +34954000000. Cancelar: https://restavor.com/c/0123456789abcdef0123456789abcdef";
    expect(toSmsSafe(text)).toBe(text);
    expect(isSmsSafe(text)).toBe(true);
  });
});

describe("AVI-04 · un solo mensaje de 160 caracteres como máximo: si no cabe, se acorta el restaurante", () => {
  const build = (r: string) => `${r}: reserva confirmada sab 26/09 21:00, 4 pers. Cambios: +34954000000. Cancelar: https://restavor.com/c/0123456789abcdef0123456789abcdef`;

  it("AVI-04 · un nombre corto cabe tal cual", () => {
    const fit = fitSms(build, "Casa Pepe");
    expect(fit).toEqual({ ok: true, text: build("Casa Pepe"), shortened: false });
  });

  it("AVI-04 · un nombre largo se acorta palabra a palabra por el final hasta que cabe", () => {
    const fit = fitSms(build, "Restaurante Casa de Pepe y María de la Giralda");
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(fit.shortened).toBe(true);
    expect(fit.text.length).toBeLessThanOrEqual(SMS_MAX_LENGTH);
    expect(fit.text.startsWith("Restaurante Casa de")).toBe(true);
    expect(isSmsSafe(fit.text)).toBe(true);
  });

  it("AVI-04 · un nombre de una sola palabra enorme se acorta a trozos", () => {
    const fit = fitSms(build, "Supercalifragilisticoespialidosoextraordinariamenteprolongado");
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(fit.text.length).toBeLessThanOrEqual(SMS_MAX_LENGTH);
    expect(fit.shortened).toBe(true);
  });

  it("AVI-04 · se mide lo que se envía: un nombre con tildes se transliteran antes de medir", () => {
    const fit = fitSms((r) => `${r}: hola`, "Ñandú Café");
    expect(fit).toEqual({ ok: true, text: "Nandu Cafe: hola", shortened: false });
  });

  it("AVI-04 · si ni con un nombre de tres letras cabe, no se manda partido en dos: se dice", () => {
    const fit = fitSms((r) => `${r}: ${"x".repeat(170)}`, "Casa Pepe");
    expect(fit).toEqual({ ok: false, reason: "too_long" });
  });
});
