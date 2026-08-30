import { describe, expect, it } from "vitest";
import {
  addBusinessMinutes,
  businessMinutesBetween,
  contractualCalendar,
  isWithinBusinessWindow,
  menuDiarioCalendar,
  supportCalendar,
  type WorkCalendar,
} from "./business-clock";

/**
 * Semana de referencia sin festivos ni cambio de horario: lunes
 * 2026-02-02 a lunes 2026-02-09, en horario de invierno de Europe/Madrid
 * (UTC+01:00 todo el rango, sin transición de DST dentro de la semana).
 */
const TZ = "Europe/Madrid";
const WINTER = "+01:00";
const SUMMER = "+02:00";

function madrid(date: string, time: string, offset = WINTER): Date {
  return new Date(`${date}T${time}:00${offset}`);
}

const emptyContractual = contractualCalendar(TZ);
const emptySupport = supportCalendar(TZ);
const menuDiario = menuDiarioCalendar(TZ);

describe("business-clock — RN-CLK-01: ventana lunes 09:00 a sábado 14:30 continua", () => {
  it("está cerrado justo antes de la apertura del lunes", () => {
    expect(isWithinBusinessWindow(madrid("2026-02-02", "08:59"), emptyContractual)).toBe(false);
  });

  it("abre el lunes a las 09:00 en punto", () => {
    expect(isWithinBusinessWindow(madrid("2026-02-02", "09:00"), emptyContractual)).toBe(true);
  });

  it("sigue abierto de noche entre semana (la ventana es continua)", () => {
    expect(isWithinBusinessWindow(madrid("2026-02-04", "23:30"), emptyContractual)).toBe(true);
  });

  it("sigue abierto justo antes del cierre del sábado a las 14:30", () => {
    expect(isWithinBusinessWindow(madrid("2026-02-07", "14:29"), emptyContractual)).toBe(true);
  });

  it("cierra exactamente a las 14:30 del sábado", () => {
    expect(isWithinBusinessWindow(madrid("2026-02-07", "14:30"), emptyContractual)).toBe(false);
  });
});

describe("business-clock — RN-CLK-02: pausa de sábado 14:30 a lunes 09:00", () => {
  it("no aporta ningún minuto laborable durante el fin de semana", () => {
    expect(
      businessMinutesBetween(madrid("2026-02-07", "14:30"), madrid("2026-02-09", "09:00"), emptyContractual),
    ).toBe(0);
  });

  it("el domingo está cerrado todo el día", () => {
    expect(isWithinBusinessWindow(madrid("2026-02-08", "12:00"), emptyContractual)).toBe(false);
  });
});

describe("business-clock — RN-CLK-03: festivo cierra el día completo", () => {
  const withTuesdayHoliday = contractualCalendar(TZ, ["2026-02-03"]);

  it("un festivo cierra desde las 00:00", () => {
    expect(isWithinBusinessWindow(madrid("2026-02-03", "00:00"), withTuesdayHoliday)).toBe(false);
  });

  it("un festivo sigue cerrado a media mañana, cuando normalmente estaría abierto", () => {
    expect(isWithinBusinessWindow(madrid("2026-02-03", "10:00"), withTuesdayHoliday)).toBe(false);
  });

  it("un festivo cierra hasta las 24:00", () => {
    expect(isWithinBusinessWindow(madrid("2026-02-03", "23:59"), withTuesdayHoliday)).toBe(false);
  });

  it("no aporta ningún minuto laborable en todo el día festivo", () => {
    expect(
      businessMinutesBetween(madrid("2026-02-03", "00:00"), madrid("2026-02-04", "00:00"), withTuesdayHoliday),
    ).toBe(0);
  });
});

describe("business-clock — RN-CLK-04: la unidad de cálculo es el minuto laborable", () => {
  it("addBusinessMinutes avanza con precisión de un minuto", () => {
    expect(addBusinessMinutes(madrid("2026-02-02", "09:00"), 1, emptyContractual)).toEqual(
      madrid("2026-02-02", "09:01"),
    );
  });

  it("businessMinutesBetween cuenta minutos, no horas ni días", () => {
    expect(
      businessMinutesBetween(madrid("2026-02-02", "09:00"), madrid("2026-02-02", "09:01"), emptyContractual),
    ).toBe(1);
  });
});

describe("business-clock — RN-CLK-05: una semana sin festivos tiene 125,5 h laborables", () => {
  it("lunes 09:00 a lunes 09:00 siguiente da 7530 minutos (125,5 h)", () => {
    expect(
      businessMinutesBetween(madrid("2026-02-02", "09:00"), madrid("2026-02-09", "09:00"), emptyContractual),
    ).toBe(7530);
  });
});

describe("business-clock — RN-CLK-06: cambio de horario de verano/invierno", () => {
  it("una semana completa da el mismo total al cruzar el cambio a horario de verano", () => {
    // 2026-03-29 es domingo: el reloj contractual ya está cerrado ese día,
    // así que el salto de las 02:00 a las 03:00 no debería alterar el total.
    expect(
      businessMinutesBetween(
        madrid("2026-03-23", "09:00", WINTER),
        madrid("2026-03-30", "09:00", SUMMER),
        emptyContractual,
      ),
    ).toBe(7530);
  });

  it("una semana completa da el mismo total al cruzar el cambio a horario de invierno", () => {
    // 2026-10-25 es domingo: mismo razonamiento para el cambio de otoño.
    expect(
      businessMinutesBetween(
        madrid("2026-10-19", "09:00", SUMMER),
        madrid("2026-10-26", "09:00", WINTER),
        emptyContractual,
      ),
    ).toBe(7530);
  });

  it("addBusinessMinutes aterriza en la hora local correcta después del cambio de horario", () => {
    // Del lunes 23 de marzo (invierno) al viernes de esa misma semana no
    // hay cambio de horario todavía (es el domingo siguiente) — sirve
    // para comprobar que la suma diaria sigue dando horas locales exactas
    // justo antes del salto.
    expect(addBusinessMinutes(madrid("2026-03-23", "09:00", WINTER), 60, emptyContractual)).toEqual(
      madrid("2026-03-23", "10:00", WINTER),
    );
  });
});

describe("business-clock — RN-CLK-07: la disponibilidad personal no modifica el reloj", () => {
  it("isWithinBusinessWindow y businessMinutesBetween no aceptan ningún parámetro de trabajador", () => {
    // La propia firma es el control: solo reciben fecha(s) y calendario,
    // nunca un identificador de persona ni su disponibilidad.
    expect(isWithinBusinessWindow.length).toBe(2);
    expect(businessMinutesBetween.length).toBe(3);
  });
});

describe("business-clock — RN-CLK-08: el horario de soporte es un reloj distinto", () => {
  it("un instante puede estar abierto para el reloj contractual y cerrado para soporte", () => {
    const at = madrid("2026-02-04", "02:00"); // miércoles de madrugada
    expect(isWithinBusinessWindow(at, emptyContractual)).toBe(true);
    expect(isWithinBusinessWindow(at, emptySupport)).toBe(false);
  });

  it("un festivo cierra el reloj contractual pero soporte solo cambia a horario de fin de semana", () => {
    const holiday = "2026-02-03";
    const contractualWithHoliday = contractualCalendar(TZ, [holiday]);
    const supportWithHoliday = supportCalendar(TZ, [holiday]);
    const morning = madrid("2026-02-03", "10:00");

    expect(isWithinBusinessWindow(morning, contractualWithHoliday)).toBe(false);
    // Horario de fin de semana en soporte: 09:00–14:30 y 16:30–21:30.
    expect(isWithinBusinessWindow(morning, supportWithHoliday)).toBe(true);
  });
});

describe("business-clock — RN-CLK-09: Menú Diario opera todos los días, festivos incluidos", () => {
  it("el domingo está abierto para Menú Diario", () => {
    expect(isWithinBusinessWindow(madrid("2026-02-08", "03:00"), menuDiario)).toBe(true);
  });

  it("un festivo configurado no cierra el calendario de Menú Diario", () => {
    const withHolidayIgnored: WorkCalendar = {
      kind: "menu_diario",
      timezone: TZ,
      holidays: ["2026-02-03"],
    };
    expect(isWithinBusinessWindow(madrid("2026-02-03", "03:00"), withHolidayIgnored)).toBe(true);
  });
});

describe("business-clock — RN-CLK-10: los calendarios laborales se versionan", () => {
  it("añadir un festivo a un calendario nuevo no cambia el resultado ya calculado con la fotografía anterior", () => {
    const calendarAtStart = contractualCalendar(TZ, []);
    const calendarAfterAddingHoliday = contractualCalendar(TZ, ["2026-02-03"]);
    const from = madrid("2026-02-02", "09:00");
    const to = madrid("2026-02-09", "09:00");

    // Un contador ya en curso se recalcula con la fotografía del
    // calendario vigente cuando arrancó, no con el calendario actual del
    // espacio: recalcular con calendarAtStart sigue dando el mismo total.
    expect(businessMinutesBetween(from, to, calendarAtStart)).toBe(7530);
    expect(businessMinutesBetween(from, to, calendarAtStart)).toBe(7530);
    expect(businessMinutesBetween(from, to, calendarAfterAddingHoliday)).toBe(7530 - 1440);
  });
});

describe("CA-11 · los ejemplos del reloj laboral de RN-CLK pasan como tests", () => {
  it("una petición del sábado a las 14:00 consume 30 minutos laborables y continúa el lunes a las 09:00", () => {
    expect(
      businessMinutesBetween(madrid("2026-02-07", "14:00"), madrid("2026-02-09", "09:00"), emptyContractual),
    ).toBe(30);
    expect(addBusinessMinutes(madrid("2026-02-07", "14:00"), 30, emptyContractual)).toEqual(
      madrid("2026-02-07", "14:30"),
    );
    // Pedir más de los 30 minutos disponibles del sábado continúa el lunes a las 09:00.
    expect(addBusinessMinutes(madrid("2026-02-07", "14:00"), 45, emptyContractual)).toEqual(
      madrid("2026-02-09", "09:15"),
    );
  });

  it("una petición del sábado a las 18:00 o del domingo empieza a contar el lunes a las 09:00", () => {
    expect(isWithinBusinessWindow(madrid("2026-02-07", "18:00"), emptyContractual)).toBe(false);
    expect(
      businessMinutesBetween(madrid("2026-02-07", "18:00"), madrid("2026-02-09", "09:00"), emptyContractual),
    ).toBe(0);
    expect(addBusinessMinutes(madrid("2026-02-07", "18:00"), 10, emptyContractual)).toEqual(
      madrid("2026-02-09", "09:10"),
    );

    expect(isWithinBusinessWindow(madrid("2026-02-08", "12:00"), emptyContractual)).toBe(false);
    expect(addBusinessMinutes(madrid("2026-02-08", "12:00"), 5, emptyContractual)).toEqual(
      madrid("2026-02-09", "09:05"),
    );
  });

  it("24 h laborables desde el viernes a las 10:00: sábado 14:30 aporta 4,5 h y el resto continúa el lunes", () => {
    // Viernes 10:00 aporta 14 h (hasta medianoche) + 10 h del sábado (00:00–10:00) = 24 h.
    const reached24h = addBusinessMinutes(madrid("2026-02-06", "10:00"), 24 * 60, emptyContractual);
    expect(reached24h).toEqual(madrid("2026-02-07", "10:00"));

    // De ahí al cierre del sábado (14:30) quedan exactamente 4,5 h de margen.
    expect(businessMinutesBetween(reached24h, madrid("2026-02-07", "14:30"), emptyContractual)).toBe(4.5 * 60);

    // Pedir un minuto más de esas 4,5 h hace que el resto continúe el lunes.
    expect(addBusinessMinutes(reached24h, 4.5 * 60 + 1, emptyContractual)).toEqual(
      madrid("2026-02-09", "09:01"),
    );
  });

  it("un festivo en martes descuenta 24 h laborables del cómputo", () => {
    const withoutHoliday = contractualCalendar(TZ, []);
    const withTuesdayHoliday = contractualCalendar(TZ, ["2026-02-03"]);
    const from = madrid("2026-02-02", "09:00");
    const to = madrid("2026-02-09", "09:00");

    const normalWeek = businessMinutesBetween(from, to, withoutHoliday);
    const weekWithHoliday = businessMinutesBetween(from, to, withTuesdayHoliday);

    expect(normalWeek - weekWithHoliday).toBe(24 * 60);
  });
});
