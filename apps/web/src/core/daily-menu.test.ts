import { describe, expect, it } from "vitest";

import {
  INCLUDED_TEMPLATE_LIMIT,
  MENU_CORRECTION_WINDOW_HOURS,
  MENU_KINDS,
  canCreateIncludedTemplate,
  canRequestPublication,
  countsAsPreparedForReminder,
  isAfterCutoff,
  isMenuCorrectionGuaranteed,
  isPublicationGuaranteed,
  isPublicationOverdue,
  linesToItems,
  menuCancellationOutcome,
  menuCorrectionAvailability,
  menuCorrectionWindowEndsAt,
  menuCutoffAt,
  menuPublishByAt,
  menuReminderDecision,
  parsePriceToCents,
  updateBalance,
} from "./daily-menu";

const TZ = "Europe/Madrid";

describe("RN-MEN-01 · los tipos de menú de §57", () => {
  it("son los cinco que nombra la maestra, y ninguno más", () => {
    expect(MENU_KINDS).toEqual(["daily", "christmas", "kids", "groups", "special_event"]);
  });
});

describe("RN-COM-10 / RN-MEN-11 · tres plantillas incluidas, una sola vez", () => {
  it("la cuarta no es incluida, aunque una de las tres esté archivada", () => {
    expect(INCLUDED_TEMPLATE_LIMIT).toBe(3);
    expect(canCreateIncludedTemplate(0)).toBe(true);
    expect(canCreateIncludedTemplate(2)).toBe(true);
    // Se cuentan las creadas alguna vez: archivar no libera la plaza.
    expect(canCreateIncludedTemplate(3)).toBe(false);
  });
});

describe("RN-MEN-07 · el corte de las 21:00 y la garantía de las 08:00", () => {
  it("el corte es las 21:00 del día anterior en la zona del espacio (RN-CLK-06)", () => {
    // Verano: Madrid es UTC+2, así que las 21:00 del 14/07 son las 19:00Z.
    expect(menuCutoffAt("2026-07-15", TZ).toISOString()).toBe("2026-07-14T19:00:00.000Z");
    // Invierno: UTC+1.
    expect(menuCutoffAt("2026-12-25", TZ).toISOString()).toBe("2026-12-24T20:00:00.000Z");
  });

  it("cruza el cambio de mes y de año sin ayuda de nadie", () => {
    expect(menuCutoffAt("2026-03-01", TZ).toISOString()).toBe("2026-02-28T20:00:00.000Z");
    expect(menuCutoffAt("2027-01-01", TZ).toISOString()).toBe("2026-12-31T20:00:00.000Z");
  });

  it("RN-CLK-09: opera todos los días del año, así que un domingo o un festivo no mueven el corte", () => {
    // El 12/10/2026 es lunes y festivo nacional; el corte sigue siendo el domingo 11 a las 21:00.
    expect(menuCutoffAt("2026-10-12", TZ).toISOString()).toBe("2026-10-11T19:00:00.000Z");
  });

  it("la publicación garantizada es antes de las 08:00 del día objetivo", () => {
    expect(menuPublishByAt("2026-07-15", TZ).toISOString()).toBe("2026-07-15T06:00:00.000Z");
  });

  it("una versión guardada después del corte queda marcada", () => {
    expect(isAfterCutoff(new Date("2026-07-14T18:59:00Z"), "2026-07-15", TZ)).toBe(false);
    expect(isAfterCutoff(new Date("2026-07-14T19:00:00Z"), "2026-07-15", TZ)).toBe(false); // justo a las 21:00 aún vale
    expect(isAfterCutoff(new Date("2026-07-14T19:00:01Z"), "2026-07-15", TZ)).toBe(true);
  });

  it("garantizada si la petición y todas las versiones desde entonces llegaron antes del corte", () => {
    const base = { targetDate: "2026-07-15", timezone: TZ };
    expect(
      isPublicationGuaranteed({ ...base, requestedAt: new Date("2026-07-14T10:00:00Z"), versionSavedAt: [] }),
    ).toBe(true);
    expect(
      isPublicationGuaranteed({
        ...base,
        requestedAt: new Date("2026-07-14T10:00:00Z"),
        versionSavedAt: [new Date("2026-07-14T15:00:00Z")],
      }),
    ).toBe(true);
  });

  it("un cambio después de las 21:00 se acepta pero pierde la garantía", () => {
    const base = { targetDate: "2026-07-15", timezone: TZ };
    expect(
      isPublicationGuaranteed({
        ...base,
        requestedAt: new Date("2026-07-14T10:00:00Z"),
        versionSavedAt: [new Date("2026-07-14T21:30:00Z")],
      }),
    ).toBe(false);
    expect(
      isPublicationGuaranteed({ ...base, requestedAt: new Date("2026-07-14T22:00:00Z"), versionSavedAt: [] }),
    ).toBe(false);
  });

  it("sin publicación pedida no hay nada que garantizar: null, no false", () => {
    expect(
      isPublicationGuaranteed({ targetDate: "2026-07-15", timezone: TZ, requestedAt: null, versionSavedAt: [] }),
    ).toBeNull();
  });
});

describe("RN-MEN-05 · la devolución del consumo al cancelar", () => {
  const now = new Date("2026-07-14T10:00:00Z");

  it("RN-CON-08 aplicado: antes de Publicado se devuelve al ciclo del consumo", () => {
    expect(
      menuCancellationOutcome({ published: false, consumptionCycleEnd: new Date("2026-08-01T00:00:00Z"), now }),
    ).toEqual({ kind: "return" });
  });

  it("RN-CON-10: si el ciclo ya cerró, crédito compensatorio en el vigente", () => {
    expect(
      menuCancellationOutcome({ published: false, consumptionCycleEnd: new Date("2026-07-01T00:00:00Z"), now }),
    ).toEqual({ kind: "compensatory_credit" });
  });

  it("§60: después de Publicado no se devuelve", () => {
    expect(
      menuCancellationOutcome({ published: true, consumptionCycleEnd: new Date("2026-08-01T00:00:00Z"), now }),
    ).toEqual({ kind: "not_allowed", reason: "already_published" });
  });

  it("un menú que nunca se mandó a publicar no consumió nada", () => {
    expect(menuCancellationOutcome({ published: false, consumptionCycleEnd: null, now })).toEqual({
      kind: "nothing_consumed",
    });
  });
});

describe("RN-COM-09 / RN-CON-02 · el saldo de actualizaciones es la suma del libro", () => {
  it("incluidas más apuntes, sin contador mutable", () => {
    expect(updateBalance(30, [])).toBe(30);
    expect(updateBalance(30, [{ amount: -1 }, { amount: -1 }, { amount: 1 }])).toBe(29);
  });

  it("RN-CON-06: solo se pide con saldo de al menos 1", () => {
    expect(canRequestPublication(2, [{ amount: -1 }])).toBe(true);
    expect(canRequestPublication(2, [{ amount: -1 }, { amount: -1 }])).toBe(false);
    expect(canRequestPublication(2, [{ amount: -1 }, { amount: -1 }, { amount: 1 }])).toBe(true);
  });
});

describe("el editor del restaurante (§58)", () => {
  it("el precio en euros con coma o punto pasa a céntimos; vacío es sin precio; basura no se entiende", () => {
    expect(parsePriceToCents("14,50")).toBe(1450);
    expect(parsePriceToCents("14.5")).toBe(1450);
    expect(parsePriceToCents("14")).toBe(1400);
    expect(parsePriceToCents(" 9,00 € ")).toBe(900);
    expect(parsePriceToCents("")).toBeNull();
    expect(parsePriceToCents("catorce")).toBeUndefined();
    expect(parsePriceToCents("14,505")).toBeUndefined();
  });

  it("un plato por línea, sin vacías ni espacios de más", () => {
    expect(linesToItems("Ensalada\n\n  Sopa  \r\nMerluza")).toEqual(["Ensalada", "Sopa", "Merluza"]);
    expect(linesToItems("   ")).toEqual([]);
  });
});

describe("RN-MEN-08 · el recordatorio de las 20:00 (Hito 11)", () => {
  // 15/07/2026 · verano, Madrid es UTC+2: las 20:00 locales son las 18:00Z.
  it("a las 19:59 no toca; a las 20:00, sin menú para mañana, sí, y dice de qué día falta", () => {
    expect(
      menuReminderDecision({ now: new Date("2026-07-15T17:59:00Z"), timezone: TZ, tomorrowMenuStates: [] }),
    ).toEqual({ due: false, targetDate: "2026-07-16" });
    expect(
      menuReminderDecision({ now: new Date("2026-07-15T18:00:00Z"), timezone: TZ, tomorrowMenuStates: [] }),
    ).toEqual({ due: true, targetDate: "2026-07-16" });
  });

  it("un borrador no es un menú preparado; uno preparado, pedido o publicado, sí", () => {
    const base = { now: new Date("2026-07-15T19:30:00Z"), timezone: TZ };
    expect(menuReminderDecision({ ...base, tomorrowMenuStates: ["draft"] }).due).toBe(true);
    expect(menuReminderDecision({ ...base, tomorrowMenuStates: ["cancelled"] }).due).toBe(true);
    expect(menuReminderDecision({ ...base, tomorrowMenuStates: ["draft", "prepared"] }).due).toBe(false);
    expect(menuReminderDecision({ ...base, tomorrowMenuStates: ["published"] }).due).toBe(false);
    expect(countsAsPreparedForReminder("pending_assignment")).toBe(true);
  });

  it("se mira en la zona del espacio (RN-CLK-06): a las 21:30 de Madrid en invierno ya pasó la hora, aunque en UTC sean las 20:30", () => {
    expect(
      menuReminderDecision({ now: new Date("2026-12-24T20:30:00Z"), timezone: TZ, tomorrowMenuStates: [] }),
    ).toEqual({ due: true, targetDate: "2026-12-25" });
    // Y al filo de la medianoche local, "mañana" ya es otro día (RN-CLK-09: la Navidad no lo apaga).
    expect(
      menuReminderDecision({ now: new Date("2026-12-24T23:30:00Z"), timezone: TZ, tomorrowMenuStates: [] }).targetDate,
    ).toBe("2026-12-26");
  });
});

describe("§62 · el aviso de las 08:00 de una publicación garantizada sin publicar (Hito 11)", () => {
  const base = { targetDate: "2026-07-15", timezone: TZ, guaranteed: true as boolean | null, published: false };
  it("antes de las 08:00 no; a las 08:00, sí", () => {
    expect(isPublicationOverdue({ ...base, now: new Date("2026-07-15T05:59:00Z") })).toBe(false);
    expect(isPublicationOverdue({ ...base, now: new Date("2026-07-15T06:00:00Z") })).toBe(true);
  });
  it("una publicación sin garantía (pedida o cambiada después del corte) no debe hora, y una publicada ya no debe nada", () => {
    expect(isPublicationOverdue({ ...base, now: new Date("2026-07-15T09:00:00Z"), guaranteed: false })).toBe(false);
    expect(isPublicationOverdue({ ...base, now: new Date("2026-07-15T09:00:00Z"), guaranteed: null })).toBe(false);
    expect(isPublicationOverdue({ ...base, now: new Date("2026-07-15T09:00:00Z"), published: true })).toBe(false);
  });
});

describe("RN-COR-10 · la corrección mínima de Menú Diario (Hito 11)", () => {
  const publishedAt = new Date("2026-07-14T10:00:00Z");
  const base = {
    state: "published" as const,
    publishedAt,
    alreadyRequested: false,
    // El corte lo deriva el servidor: las 21:00 del 14/07 en Madrid (verano, UTC+2).
    cutoffAt: menuCutoffAt("2026-07-15", TZ),
  };

  it("RN-COR-10 · pedida antes de las 21:00 del día anterior va garantizada; después, se acepta sin garantía", () => {
    expect(menuCorrectionAvailability({ ...base, now: new Date("2026-07-14T18:59:00Z") })).toEqual({
      available: true,
      guaranteed: true,
    });
    expect(menuCorrectionAvailability({ ...base, now: new Date("2026-07-14T19:01:00Z") })).toEqual({
      available: true,
      guaranteed: false,
    });
    expect(isMenuCorrectionGuaranteed(new Date("2026-07-14T19:00:00Z"), menuCutoffAt("2026-07-15", TZ))).toBe(true);
  });

  it("RN-COR-01 · una sola por publicación", () => {
    expect(menuCorrectionAvailability({ ...base, alreadyRequested: true, now: new Date("2026-07-14T12:00:00Z") })).toEqual({
      available: false,
      reason: "already_used",
    });
  });

  it("RN-COR-02 · 72 h después de publicar se cierra la ventana (horas de reloj: Menú Diario opera todos los días, RN-CLK-09)", () => {
    expect(MENU_CORRECTION_WINDOW_HOURS).toBe(72);
    expect(menuCorrectionWindowEndsAt(publishedAt).toISOString()).toBe("2026-07-17T10:00:00.000Z");
    expect(menuCorrectionAvailability({ ...base, now: new Date("2026-07-17T10:00:00Z") }).available).toBe(true);
    expect(menuCorrectionAvailability({ ...base, now: new Date("2026-07-17T10:00:01Z") })).toEqual({
      available: false,
      reason: "window_closed",
    });
  });

  it("RN-MEN-03 · antes de publicar no hay corrección: se guarda una versión nueva", () => {
    expect(menuCorrectionAvailability({ ...base, state: "assigned", publishedAt: null, now: publishedAt })).toEqual({
      available: false,
      reason: "not_published",
    });
  });
});
