import { describe, expect, it } from "vitest";

import {
  MAX_ABSENCE_DAYS,
  isCivilDay,
  civilDayStartInZone,
  isSupervisionCurrent,
  monthBounds,
  monthKey,
  shiftMonth,
  nextDay,
  spanDays,
  supervisionWindow,
  validateAbsenceRange,
} from "./team-calendar";

describe("team-calendar — HU-30, HU-32, RN-SUP-03", () => {
  describe("días civiles", () => {
    it("acepta un día que existe y rechaza uno que no", () => {
      expect(isCivilDay("2026-09-03")).toBe(true);
      expect(isCivilDay("2026-02-29")).toBe(false); // 2026 no es bisiesto
      expect(isCivilDay("2024-02-29")).toBe(true);
      expect(isCivilDay("2026-13-01")).toBe(false);
      expect(isCivilDay("2026-04-31")).toBe(false);
      expect(isCivilDay("03/09/2026")).toBe(false);
      expect(isCivilDay("")).toBe(false);
    });
  });

  describe("rango del mes", () => {
    it("va del día 1 al último, y el último depende del mes", () => {
      expect(monthBounds("2026-09-17")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
      expect(monthBounds("2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
      expect(monthBounds("2024-02-10")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    });

    it("shiftMonth cruza el año en las dos direcciones", () => {
      expect(shiftMonth("2026-12-15", 1)).toBe("2027-01-15");
      expect(shiftMonth("2026-01-15", -1)).toBe("2025-12-15");
    });

    it("shiftMonth satura al último día cuando el mes destino es más corto", () => {
      // 31 de marzo menos un mes no es el 31 de febrero.
      expect(shiftMonth("2026-03-31", -1)).toBe("2026-02-28");
      expect(shiftMonth("2026-05-31", -1)).toBe("2026-04-30");
    });

    it("monthKey identifica el mes que se está mirando", () => {
      expect(monthKey("2026-09-17")).toBe("2026-09");
    });
  });

  describe("spanDays", () => {
    it("un solo día es 1, porque ends_on es el último día ausente", () => {
      expect(spanDays("2026-09-03", "2026-09-03")).toBe(1);
    });

    it("cruza el final de mes sin dar la vuelta", () => {
      // El fallo que esto vigila: con el mes en base 1, "2026-01-31" caía
      // en marzo y la diferencia contra el 1 de febrero salía NEGATIVA.
      expect(spanDays("2026-01-31", "2026-02-01")).toBe(2);
      expect(spanDays("2026-01-01", "2026-12-31")).toBe(365);
    });

    it("cruza el cambio de horario de verano sin perder ni ganar un día", () => {
      // 29/03/2026 es el domingo del cambio en Europe/Madrid. Aquí se
      // cuentan días civiles, no horas: 23 h no son "casi un día".
      expect(spanDays("2026-03-28", "2026-03-30")).toBe(3);
      expect(spanDays("2026-10-24", "2026-10-26")).toBe(3);
    });
  });

  describe("HU-30 · fechas de una ausencia", () => {
    it("un rango normal devuelve cuántos días ocupa", () => {
      expect(validateAbsenceRange("2026-09-07", "2026-09-11")).toEqual({ ok: true, days: 5 });
    });

    it("el fin anterior al inicio se rechaza, igual que en el servidor", () => {
      expect(validateAbsenceRange("2026-09-11", "2026-09-07")).toEqual({
        ok: false,
        error: "end_before_start",
      });
    });

    it("una fecha que no existe se rechaza señalando cuál", () => {
      expect(validateAbsenceRange("2026-02-30", "2026-03-02")).toEqual({
        ok: false,
        error: "start_invalid",
      });
      expect(validateAbsenceRange("2026-03-02", "no-es-una-fecha")).toEqual({
        ok: false,
        error: "end_invalid",
      });
    });

    it("el tope defiende del dedo resbalado, y justo en el límite pasa", () => {
      expect(validateAbsenceRange("2026-01-01", "2026-12-31")).toEqual({ ok: true, days: 365 });
      expect(validateAbsenceRange("2026-01-01", "2028-01-01").ok).toBe(false);
      expect(MAX_ABSENCE_DAYS).toBe(366);
    });
  });

  describe("RN-SUP-03/04 · vigencia de una supervisión", () => {
    const ahora = new Date("2026-09-03T10:00:00Z");

    it("el principal, sin fecha de fin, está vigente", () => {
      expect(
        isSupervisionCurrent(ahora, {
          startsAt: "2026-01-01T00:00:00Z",
          endsAt: null,
          revokedAt: null,
        }),
      ).toBe(true);
    });

    it("una sustitución fuera de sus fechas no está vigente", () => {
      const ventana = { startsAt: "2026-09-10T00:00:00Z", endsAt: "2026-09-20T00:00:00Z" };
      expect(isSupervisionCurrent(ahora, { ...ventana, revokedAt: null })).toBe(false);
      expect(
        isSupervisionCurrent(new Date("2026-09-15T10:00:00Z"), { ...ventana, revokedAt: null }),
      ).toBe(true);
      expect(
        isSupervisionCurrent(new Date("2026-09-25T10:00:00Z"), { ...ventana, revokedAt: null }),
      ).toBe(false);
    });

    it("retirada antes de tiempo gana sobre las fechas (RN-SUP-03)", () => {
      expect(
        isSupervisionCurrent(ahora, {
          startsAt: "2026-01-01T00:00:00Z",
          endsAt: null,
          revokedAt: "2026-08-01T00:00:00Z",
        }),
      ).toBe(false);
    });
  });
  describe("RN-SUP-03 · la ventana de una sustitución, en la zona del espacio", () => {
    it("empieza a medianoche local y cubre el último día entero", () => {
      // Madrid en septiembre es UTC+2: la medianoche local del día 10 son
      // las 22:00Z del 9, y el fin —comienzo del día 21— las 22:00Z del 20,
      // de modo que el día 20 queda cubierto completo.
      expect(supervisionWindow("2026-09-10", "2026-09-20", "Europe/Madrid")).toEqual({
        startsAt: "2026-09-09T22:00:00.000Z",
        endsAt: "2026-09-20T22:00:00.000Z",
      });
    });

    it("una sustitución de un solo día dura ese día entero", () => {
      const ventana = supervisionWindow("2026-09-10", "2026-09-10", "Europe/Madrid");
      expect(ventana).not.toBeNull();
      expect(
        isSupervisionCurrent(new Date("2026-09-10T12:00:00Z"), {
          startsAt: ventana!.startsAt,
          endsAt: ventana!.endsAt,
          revokedAt: null,
        }),
      ).toBe(true);
      // El día anterior y el siguiente, no.
      expect(
        isSupervisionCurrent(new Date("2026-09-09T12:00:00Z"), {
          startsAt: ventana!.startsAt,
          endsAt: ventana!.endsAt,
          revokedAt: null,
        }),
      ).toBe(false);
      expect(
        isSupervisionCurrent(new Date("2026-09-11T12:00:00Z"), {
          startsAt: ventana!.startsAt,
          endsAt: ventana!.endsAt,
          revokedAt: null,
        }),
      ).toBe(false);
    });

    it("el invierno de Madrid es UTC+1 y la ventana lo respeta", () => {
      expect(supervisionWindow("2026-01-10", "2026-01-12", "Europe/Madrid")).toEqual({
        startsAt: "2026-01-09T23:00:00.000Z",
        endsAt: "2026-01-12T23:00:00.000Z",
      });
    });

    it("rechaza fechas imposibles, el fin antes del inicio y una zona inventada", () => {
      expect(supervisionWindow("2026-02-30", "2026-03-02", "Europe/Madrid")).toBeNull();
      expect(supervisionWindow("2026-09-20", "2026-09-10", "Europe/Madrid")).toBeNull();
      expect(supervisionWindow("2026-09-10", "2026-09-20", "Marte/Olympus")).toBeNull();
    });

    it("nextDay cruza fin de mes, fin de año y años bisiestos", () => {
      expect(nextDay("2026-01-31")).toBe("2026-02-01");
      expect(nextDay("2026-12-31")).toBe("2027-01-01");
      expect(nextDay("2024-02-28")).toBe("2024-02-29");
      expect(nextDay("2026-02-28")).toBe("2026-03-01");
    });

    it("civilDayStartInZone no se cae en el día del cambio de horario", () => {
      // 29/03/2026, el domingo en que Madrid pasa de UTC+1 a UTC+2. La
      // medianoche de ese día existe (el salto es a las 02:00), y el
      // desplazamiento se mide al mediodía para no preguntar por una hora
      // que podría no existir.
      expect(civilDayStartInZone("2026-03-29", "Europe/Madrid")).toBe("2026-03-28T23:00:00.000Z");
      expect(civilDayStartInZone("2026-10-25", "Europe/Madrid")).toBe("2026-10-24T22:00:00.000Z");
    });
  });
});
