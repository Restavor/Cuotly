import { describe, expect, it } from "vitest";
import { contractualCalendar } from "./business-clock";
import {
  FREE_CORRECTION_WINDOW_BUSINESS_HOURS,
  consumesFreeCorrection,
  freeCorrectionAvailability,
  isCorrectionWindowClosed,
} from "./free-correction";

const calendar = contractualCalendar("Europe/Madrid");

// 2026-08-31 es lunes; Madrid está en UTC+2 en agosto (RN-CLK-06).
const LUNES_09 = new Date("2026-08-31T07:00:00.000Z");
const LUNES_15 = new Date("2026-08-31T13:00:00.000Z");
// 72 h laborables desde el lunes a las 09:00: lunes aporta 15 h, martes y
// miércoles 24 h cada uno (RN-CLK-01, el reloj no para de noche) = 63 h; las
// 9 h que faltan se cumplen el jueves a las 09:00.
const JUEVES_09 = new Date("2026-09-03T07:00:00.000Z");
const JUEVES_10 = new Date("2026-09-03T08:00:00.000Z");

describe("free-correction — RN-COR, HU-23", () => {
  it("RN-COR-02: la ventana posterior a la publicación son 72 h laborables", () => {
    expect(FREE_CORRECTION_WINDOW_BUSINESS_HOURS).toBe(72);
  });

  describe("HU-23: el restaurante pide la corrección mínima dentro de su ventana", () => {
    it("está disponible justo después de publicar", () => {
      expect(
        freeCorrectionAvailability({ publishedAt: LUNES_09, usedAt: null, now: LUNES_15, calendar }),
      ).toEqual({ available: true });
    });

    it("sigue disponible en el último minuto laborable de las 72 h", () => {
      expect(
        freeCorrectionAvailability({ publishedAt: LUNES_09, usedAt: null, now: JUEVES_09, calendar }),
      ).toEqual({ available: true });
    });

    it("pasadas las 72 h laborables ya no está disponible, con motivo explícito", () => {
      expect(
        freeCorrectionAvailability({ publishedAt: LUNES_09, usedAt: null, now: JUEVES_10, calendar }),
      ).toEqual({ available: false, reason: "window_closed" });
    });

    it("las horas no laborables no gastan la ventana (RN-CLK-02: el fin de semana no cuenta)", () => {
      // Publicado el viernes a las 12:00; el lunes siguiente a las 12:00 solo
      // han pasado 26,5 h laborables (viernes 12 h + sábado 14,5 h), no 72.
      const viernes12 = new Date("2026-09-04T10:00:00.000Z");
      const lunesSiguiente12 = new Date("2026-09-07T10:00:00.000Z");
      expect(
        freeCorrectionAvailability({ publishedAt: viernes12, usedAt: null, now: lunesSiguiente12, calendar }),
      ).toEqual({ available: true });
    });
  });

  describe("RN-COR-01/02: una sola corrección en total por trabajo", () => {
    it("si ya se usó, no vuelve a estar disponible aunque queden horas de ventana", () => {
      expect(
        freeCorrectionAvailability({ publishedAt: LUNES_09, usedAt: LUNES_15, now: LUNES_15, calendar }),
      ).toEqual({ available: false, reason: "already_used" });
    });

    it("RN-COR-02: si se usó durante la ejecución, no vuelve a estar disponible después de publicar", () => {
      expect(
        freeCorrectionAvailability({ publishedAt: null, usedAt: LUNES_09, now: LUNES_15, calendar }),
      ).toEqual({ available: false, reason: "already_used" });
    });

    it("RN-COR-02: durante la ejecución (sin publicar todavía) está disponible", () => {
      expect(
        freeCorrectionAvailability({ publishedAt: null, usedAt: null, now: LUNES_15, calendar }),
      ).toEqual({ available: true });
    });
  });

  describe("RN-COR-08: al terminar la ventana, la conversación pasa a solo lectura", () => {
    it("la ventana no está cerrada mientras el trabajo no se publica", () => {
      expect(isCorrectionWindowClosed({ publishedAt: null, now: JUEVES_10, calendar })).toBe(false);
    });

    it("se cierra al superar las 72 h laborables desde la publicación", () => {
      expect(isCorrectionWindowClosed({ publishedAt: LUNES_09, now: JUEVES_09, calendar })).toBe(false);
      expect(isCorrectionWindowClosed({ publishedAt: LUNES_09, now: JUEVES_10, calendar })).toBe(true);
    });
  });

  describe("RN-COR-07 / RN-JOB-12: un error del equipo no gasta la corrección del cliente", () => {
    it("la corrección pedida por el cliente sí la gasta", () => {
      expect(consumesFreeCorrection("client_request")).toBe(true);
    });

    it("la corrección de un error imputable al equipo no gasta nada", () => {
      expect(consumesFreeCorrection("team_error")).toBe(false);
    });
  });
});
