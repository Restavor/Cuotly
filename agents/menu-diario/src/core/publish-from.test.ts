import { describe, expect, it, vi } from "vitest";
import { localDateTimeOf } from "./local-time.ts";
import { computePublishFrom, DEFAULT_OTHER_DAY_HOUR, type PublishFromInput } from "./publish-from.ts";

const MADRID = "Europe/Madrid";

function run(targetDate: string, nowIso: string, extra: Partial<PublishFromInput> = {}) {
  return computePublishFrom({ targetDate, now: new Date(nowIso), timeZone: MADRID, ...extra });
}

/** El instante (UTC, ISO) y el motivo, o rompe el test si el cálculo dio error. */
function resultOf(r: ReturnType<typeof run>): { at: string; reason: string } {
  if (!r.ok) throw new Error(`se esperaba un instante y vino el error ${r.error}`);
  return { at: r.value.at.toISOString(), reason: r.value.reason };
}

function errorOf(r: ReturnType<typeof run>): string {
  if (r.ok) throw new Error(`se esperaba un error y vino ${r.value.at.toISOString()}`);
  return r.error;
}

/*
 * RA-01 · cuándo publica el agente (decisión 154, Bosco 03/10/2026):
 *   hoy → al llegar · otro día → 07:00 del día del menú · día pasado → no se publica.
 * Todos los valores UTC esperados están contrastados con PostgreSQL (`at time zone 'Europe/Madrid'`).
 */
describe("RA-01 · menú para HOY: se publica en cuanto llega", () => {
  it("RA-01 · hoy a las 11:00 se publica en ese mismo instante", () => {
    expect(resultOf(run("2026-02-10", "2026-02-10T10:00:00Z"))).toEqual({ at: "2026-02-10T10:00:00.000Z", reason: "today" });
  });

  it("RA-01 · ejemplo de Bosco: uno de hoy a las 8:00 y otro de hoy a las 9:00, cada uno al llegar", () => {
    expect(resultOf(run("2026-02-10", "2026-02-10T07:00:00Z")).at).toBe("2026-02-10T07:00:00.000Z"); // 08:00 CET
    expect(resultOf(run("2026-02-10", "2026-02-10T08:00:00Z")).at).toBe("2026-02-10T08:00:00.000Z"); // 09:00 CET
  });

  it("RA-01 · un menú de hoy pedido antes de las 07:00 también se publica al llegar", () => {
    expect(resultOf(run("2026-02-10", "2026-02-10T05:00:00Z"))).toEqual({ at: "2026-02-10T05:00:00.000Z", reason: "today" }); // 06:00 CET
  });

  it("RA-01 · a las 00:00 locales y en el último milisegundo del día sigue siendo hoy", () => {
    expect(resultOf(run("2026-02-10", "2026-02-09T23:00:00Z")).reason).toBe("today");
    expect(resultOf(run("2026-02-10", "2026-02-10T22:59:59.999Z"))).toEqual({ at: "2026-02-10T22:59:59.999Z", reason: "today" });
  });

  it("RA-01 · pedido a las 23:59 para hoy se publica al llegar", () => {
    expect(resultOf(run("2026-02-10", "2026-02-10T22:59:00Z")).at).toBe("2026-02-10T22:59:00.000Z");
  });

  it("RA-01 · el instante devuelto es una copia: cambiarlo no cambia el reloj de quien llama", () => {
    const now = new Date("2026-02-10T10:00:00Z");
    const r = computePublishFrom({ targetDate: "2026-02-10", now, timeZone: MADRID });
    if (!r.ok) throw new Error("debía ser ok");
    r.value.at.setUTCHours(0);
    expect(now.toISOString()).toBe("2026-02-10T10:00:00.000Z");
  });
});

describe("RA-01 · menú para OTRO DÍA: a las 07:00 del día del menú, nunca antes", () => {
  it("RA-01 · mañana pedido a las 10:00 sale mañana a las 07:00", () => {
    expect(resultOf(run("2026-02-11", "2026-02-10T09:00:00Z"))).toEqual({ at: "2026-02-11T06:00:00.000Z", reason: "other_day" });
  });

  it("RA-01 · mañana pedido a las 18:00 NO sale ya: sale mañana a las 07:00 (con la regla antigua salía al instante)", () => {
    expect(resultOf(run("2026-02-11", "2026-02-10T17:00:00Z"))).toEqual({ at: "2026-02-11T06:00:00.000Z", reason: "other_day" });
  });

  it("RA-01 · mañana pedido a las 23:59 sale mañana a las 07:00", () => {
    expect(resultOf(run("2026-02-11", "2026-02-10T22:59:00Z")).at).toBe("2026-02-11T06:00:00.000Z");
  });

  it("RA-01 · dentro de 3 días sale ese día a las 07:00, no la víspera", () => {
    expect(resultOf(run("2026-02-13", "2026-02-10T09:00:00Z"))).toEqual({ at: "2026-02-13T06:00:00.000Z", reason: "other_day" });
  });

  it("RA-01 · ejemplo de Bosco: pedido hoy a las 18:00 y cambiado a las 20:00 para mañana, la hora es la misma", () => {
    const aLas18 = resultOf(run("2026-02-11", "2026-02-10T17:00:00Z")).at;
    const aLas20 = resultOf(run("2026-02-11", "2026-02-10T19:00:00Z")).at;
    expect(aLas18).toBe("2026-02-11T06:00:00.000Z");
    expect(aLas20).toBe(aLas18);
  });

  it("RA-01 · la hora de otro día no depende de cuándo se pidió", () => {
    const horas = ["2026-02-09T23:00:00Z", "2026-02-10T09:00:00Z", "2026-02-10T22:59:59.999Z"].map(
      (now) => resultOf(run("2026-02-11", now)).at,
    );
    expect(new Set(horas)).toEqual(new Set(["2026-02-11T06:00:00.000Z"]));
  });

  it("RA-01 · en verano 07:00 son las 05:00 UTC", () => {
    expect(resultOf(run("2026-06-11", "2026-06-10T21:59:00Z")).at).toBe("2026-06-11T05:00:00.000Z");
  });

  it("RA-01 · fin de mes, año bisiesto y fin de año", () => {
    expect(resultOf(run("2026-03-01", "2026-02-27T09:00:00Z")).at).toBe("2026-03-01T06:00:00.000Z");
    expect(resultOf(run("2028-03-01", "2028-02-20T09:00:00Z")).at).toBe("2028-03-01T06:00:00.000Z");
    expect(resultOf(run("2027-01-01", "2026-12-20T09:00:00Z")).at).toBe("2027-01-01T06:00:00.000Z");
  });

  it("RA-01 · la hora configurable cambia la hora de otro día (20:30)", () => {
    expect(resultOf(run("2026-02-11", "2026-02-10T09:00:00Z", { otherDayHour: "20:30" })).at).toBe("2026-02-11T19:30:00.000Z");
  });

  it("RA-01 · por defecto la hora de otro día es 07:00", () => {
    expect(DEFAULT_OTHER_DAY_HOUR).toBe("07:00");
  });
});

describe("RA-01 · fecha pasada", () => {
  it("RA-01 · el menú de ayer no se publica", () => {
    expect(errorOf(run("2026-02-09", "2026-02-10T09:00:00Z"))).toBe("date_in_past");
  });

  it("RA-01 · a las 00:00 locales el menú del día que acaba de terminar ya es pasado (en UTC aún no lo sería)", () => {
    expect(errorOf(run("2026-06-10", "2026-06-10T22:00:00Z"))).toBe("date_in_past"); // 00:00 del 11 en verano
    expect(resultOf(run("2026-06-10", "2026-06-10T21:59:00Z")).reason).toBe("today"); // 23:59 del 10
    expect(errorOf(run("2026-06-10", "2026-06-10T22:30:00Z"))).toBe("date_in_past");
    expect(errorOf(run("2026-02-10", "2026-02-10T23:00:00Z"))).toBe("date_in_past"); // 00:00 del 11 en invierno
    expect(resultOf(run("2026-02-11", "2026-02-10T23:00:00Z")).reason).toBe("today");
  });
});

describe("RA-01 · cambio de hora de marzo (domingo 29/03/2026: las 02:00 saltan a las 03:00)", () => {
  it("RA-01 · menú del sábado anterior: 07:00 CET", () => {
    expect(resultOf(run("2026-03-28", "2026-03-26T09:00:00Z")).at).toBe("2026-03-28T06:00:00.000Z");
  });

  it("RA-01 · menú del domingo del cambio: 07:00 CEST = 05:00 UTC (no «24 horas antes», que daría otra hora)", () => {
    expect(resultOf(run("2026-03-29", "2026-03-27T09:00:00Z"))).toEqual({ at: "2026-03-29T05:00:00.000Z", reason: "other_day" });
  });

  it("RA-01 · menú del lunes después del cambio: 07:00 CEST = 05:00 UTC", () => {
    expect(resultOf(run("2026-03-30", "2026-03-27T09:00:00Z")).at).toBe("2026-03-30T05:00:00.000Z");
  });

  it("RA-01 · el día de 23 horas: a las 23:59 aún es hoy y a las 00:00 del lunes ya es pasado", () => {
    expect(resultOf(run("2026-03-29", "2026-03-29T21:59:00Z")).reason).toBe("today");
    expect(errorOf(run("2026-03-29", "2026-03-29T22:00:00Z"))).toBe("date_in_past");
    expect(resultOf(run("2026-03-30", "2026-03-29T22:00:00Z")).reason).toBe("today");
  });

  it("RA-01 · alrededor del salto de las 02:00 «hoy» no cambia", () => {
    expect(resultOf(run("2026-03-29", "2026-03-29T00:59:59Z")).reason).toBe("today"); // 01:59:59 CET
    expect(resultOf(run("2026-03-29", "2026-03-29T01:00:00Z")).reason).toBe("today"); // 03:00:00 CEST
    expect(resultOf(run("2026-03-29", "2026-03-28T23:30:00Z")).reason).toBe("today"); // 00:30 CET (en UTC aún es el 28)
    expect(errorOf(run("2026-03-28", "2026-03-28T23:30:00Z"))).toBe("date_in_past");
  });
});

describe("RA-01 · cambio de hora de octubre (domingo 25/10/2026: las 03:00 vuelven a las 02:00)", () => {
  it("RA-01 · menú del sábado anterior: 07:00 CEST = 05:00 UTC", () => {
    expect(resultOf(run("2026-10-24", "2026-10-22T08:00:00Z")).at).toBe("2026-10-24T05:00:00.000Z");
  });

  it("RA-01 · menú del domingo del cambio: 07:00 CET = 06:00 UTC", () => {
    expect(resultOf(run("2026-10-25", "2026-10-22T08:00:00Z"))).toEqual({ at: "2026-10-25T06:00:00.000Z", reason: "other_day" });
  });

  it("RA-01 · menú del lunes después del cambio: 07:00 CET = 06:00 UTC", () => {
    expect(resultOf(run("2026-10-26", "2026-10-22T08:00:00Z")).at).toBe("2026-10-26T06:00:00.000Z");
  });

  it("RA-01 · el día de 25 horas: a las 23:30 aún es hoy, a las 00:00 del lunes ya es pasado", () => {
    expect(resultOf(run("2026-10-25", "2026-10-25T22:30:00Z")).reason).toBe("today");
    expect(errorOf(run("2026-10-25", "2026-10-25T23:00:00Z"))).toBe("date_in_past");
    expect(errorOf(run("2026-10-24", "2026-10-24T22:30:00Z"))).toBe("date_in_past"); // 00:30 CEST del 25
    expect(resultOf(run("2026-10-25", "2026-10-24T22:30:00Z")).reason).toBe("today");
  });

  it("RA-01 · las dos 02:30 del día del cambio siguen siendo hoy", () => {
    expect(resultOf(run("2026-10-25", "2026-10-25T00:30:00Z")).reason).toBe("today"); // 02:30 CEST
    expect(resultOf(run("2026-10-25", "2026-10-25T01:30:00Z")).reason).toBe("today"); // 02:30 CET
  });
});

describe("RA-01 · hora de publicación configurada en el hueco o la repetición del cambio de hora", () => {
  // La hora que no existe se desplaza hacia delante y la repetida es la segunda: lo mismo que PostgreSQL.
  it("RA-01 · 02:30 el día del salto de marzo → 03:30 CEST (01:30 UTC); 02:00 → 01:00 UTC", () => {
    expect(resultOf(run("2026-03-29", "2026-03-27T09:00:00Z", { otherDayHour: "02:30" })).at).toBe("2026-03-29T01:30:00.000Z");
    expect(resultOf(run("2026-03-29", "2026-03-27T09:00:00Z", { otherDayHour: "02:00" })).at).toBe("2026-03-29T01:00:00.000Z");
  });

  it("RA-01 · 02:30 el día de octubre ocurre dos veces: es la segunda (CET, 01:30 UTC)", () => {
    expect(resultOf(run("2026-10-25", "2026-10-22T08:00:00Z", { otherDayHour: "02:30" })).at).toBe("2026-10-25T01:30:00.000Z");
  });

  it("RA-01 · control: 02:30 un día sin cambio de hora → 01:30 UTC", () => {
    expect(resultOf(run("2026-02-10", "2026-02-08T09:00:00Z", { otherDayHour: "02:30" })).at).toBe("2026-02-10T01:30:00.000Z");
  });
});

describe("RA-01 · entradas inválidas: error explícito, nunca una excepción", () => {
  it.each(["25:00", "9:00", "", "07:60"])("RA-01 · la hora de publicación %j es inválida", (hora) => {
    expect(errorOf(run("2026-02-11", "2026-02-10T09:00:00Z", { otherDayHour: hora }))).toBe("invalid_hour");
  });

  it.each(["2026-02-30", "10/02/2026", "", "2026-2-1"])("RA-01 · la fecha %j es inválida", (fecha) => {
    expect(errorOf(run(fecha, "2026-02-10T09:00:00Z"))).toBe("invalid_date");
  });

  it("RA-01 · una zona horaria que no existe es un error, no una excepción", () => {
    expect(errorOf(run("2026-02-11", "2026-02-10T09:00:00Z", { timeZone: "No/Existe" }))).toBe("invalid_time_zone");
  });

  it("RA-01 · un reloj inválido es un error", () => {
    expect(errorOf(computePublishFrom({ targetDate: "2026-02-11", now: new Date("x"), timeZone: MADRID }))).toBe("invalid_now");
  });
});

describe("RA-01 · pureza y barrido de dos años", () => {
  it("RA-01 · no lee el reloj del sistema: con otro reloj de fondo, el mismo resultado", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
      const a = resultOf(run("2026-02-11", "2026-02-10T09:00:00Z"));
      vi.setSystemTime(new Date("2031-07-07T12:00:00Z"));
      const b = resultOf(run("2026-02-11", "2026-02-10T09:00:00Z"));
      expect(a).toEqual(b);
    } finally {
      vi.useRealTimers();
    }
  });

  it("RA-01 · no muta el instante que recibe", () => {
    const now = new Date("2026-02-10T09:00:00Z");
    computePublishFrom({ targetDate: "2026-02-11", now, timeZone: MADRID });
    expect(now.toISOString()).toBe("2026-02-10T09:00:00.000Z");
  });

  it("RA-01 · en los 730 días de 2026 y 2027, un menú de otro día sale siempre a las 07:00 locales de su día y después de ahora", () => {
    const inicio = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 730; i++) {
      const dia = new Date(inicio + i * 86_400_000);
      const target = dia.toISOString().slice(0, 10);
      // Un instante que, en Madrid, cae siempre uno o dos días antes del menú.
      for (const horasAntes of [36, 24.5, 12.5]) {
        const now = new Date(dia.getTime() + 12 * 3_600_000 - horasAntes * 3_600_000);
        const r = computePublishFrom({ targetDate: target, now, timeZone: MADRID });
        if (!r.ok) throw new Error(`${target} / ${horasAntes} h: ${r.error}`);
        if (r.value.reason === "today") continue; // 12,5 h antes del mediodía UTC ya puede ser el propio día en Madrid
        expect(r.value.at.getTime()).toBeGreaterThan(now.getTime());
        expect(localDateTimeOf(r.value.at, MADRID)).toEqual({ date: target, time: "07:00" });
      }
    }
  });
});
