import { describe, expect, it } from "vitest";
import { checkClockSkew, DEFAULT_MAX_CLOCK_SKEW_MS, localClock } from "./clock.ts";

const MADRID = "Europe/Madrid";

function clockOf(iso: string, timeZone = MADRID) {
  const r = localClock(new Date(iso), timeZone);
  if (!r.ok) throw new Error(`error inesperado: ${r.error}`);
  return r.value;
}

describe("RA-08 · el agente siempre sabe qué día y hora es (decisión 158)", () => {
  it("RA-08 · los dos días de cambio de hora dan el desfase correcto", () => {
    expect(clockOf("2026-03-29T00:59:59Z").utcOffsetMinutes).toBe(60);
    expect(clockOf("2026-03-29T01:00:00Z").utcOffsetMinutes).toBe(120);
    expect(clockOf("2026-10-25T00:30:00Z").utcOffsetMinutes).toBe(120);
    expect(clockOf("2026-10-25T01:30:00Z").utcOffsetMinutes).toBe(60);
  });

  it("RA-08 · un reloj o una zona inválidos son un error explícito", () => {
    expect(localClock(new Date("x"), MADRID)).toEqual({ ok: false, error: "invalid_now" });
    expect(localClock(new Date("2026-10-03T16:42:00Z"), "No/Existe")).toEqual({ ok: false, error: "invalid_time_zone" });
  });

  it("RA-08 · el máximo de diferencia con el reloj de Supabase es de 5 minutos", () => {
    expect(DEFAULT_MAX_CLOCK_SKEW_MS).toBe(5 * 60 * 1000);
  });

  const servidor = new Date("2026-10-03T16:42:00.000Z");
  it("RA-08 · hasta 5 minutos de diferencia (incluido) se acepta, adelantado o atrasado", () => {
    expect(checkClockSkew(new Date("2026-10-03T16:42:00.000Z"), servidor)).toEqual({ ok: true, value: { skewMs: 0 } });
    expect(checkClockSkew(new Date("2026-10-03T16:46:59.000Z"), servidor)).toEqual({ ok: true, value: { skewMs: 299_000 } });
    expect(checkClockSkew(new Date("2026-10-03T16:47:00.000Z"), servidor)).toEqual({ ok: true, value: { skewMs: 300_000 } });
    expect(checkClockSkew(new Date("2026-10-03T16:37:00.000Z"), servidor)).toEqual({ ok: true, value: { skewMs: -300_000 } });
  });

  it("RA-08 · con más de 5 minutos de diferencia el agente se para", () => {
    expect(checkClockSkew(new Date("2026-10-03T16:47:00.001Z"), servidor)).toEqual({
      ok: false,
      error: { code: "clock_skew", skewMs: 300_001 },
    });
    expect(checkClockSkew(new Date("2026-10-03T16:36:59.000Z"), servidor)).toMatchObject({
      ok: false,
      error: { code: "clock_skew" },
    });
  });

  it("RA-08 · un día entero de diferencia (reloj roto) también se para", () => {
    expect(checkClockSkew(new Date("2026-10-04T16:42:00Z"), servidor)).toMatchObject({ ok: false, error: { code: "clock_skew" } });
  });

  it("RA-08 · el máximo es configurable", () => {
    expect(checkClockSkew(new Date("2026-10-03T16:43:00Z"), servidor, 30_000)).toMatchObject({ ok: false });
    expect(checkClockSkew(new Date("2026-10-03T16:43:00Z"), servidor, 60_000)).toMatchObject({ ok: true });
  });

  it("RA-08 · un reloj ilegible (fecha inválida o máximo inválido) es un error, no una decisión a ciegas", () => {
    expect(checkClockSkew(new Date("x"), servidor)).toEqual({ ok: false, error: { code: "invalid_clock" } });
    expect(checkClockSkew(servidor, new Date("x"))).toEqual({ ok: false, error: { code: "invalid_clock" } });
    expect(checkClockSkew(servidor, servidor, -1)).toEqual({ ok: false, error: { code: "invalid_clock" } });
    expect(checkClockSkew(servidor, servidor, Number.NaN)).toEqual({ ok: false, error: { code: "invalid_clock" } });
  });
});

