import { describe, expect, it } from "vitest";

import {
  INCLUDED_TEMPLATE_LIMIT,
  MENU_KINDS,
  canCreateIncludedTemplate,
  canRequestPublication,
  isAfterCutoff,
  isPublicationGuaranteed,
  linesToItems,
  menuCancellationOutcome,
  menuCutoffAt,
  menuPublishByAt,
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
