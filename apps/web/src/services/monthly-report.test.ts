import { describe, expect, it, vi } from "vitest";

import {
  type MonthActivity,
  type MonthChange,
  type ReportSectionState,
  activityEntryKey,
  applyEntryTexts,
  changeDescription,
  changeEntryKey,
  changeTitle,
  executiveSummaryFacts,
} from "@/core/reports";

import { buildSnapshot } from "./report-generation";
import type { ReportGateway, ReportRow } from "./report-gateway";
import { activityText } from "./report-pdf";
import { executiveSummaryText, monthName } from "./report-summary";
import { es } from "@/i18n/es";

/**
 * El informe del mes desde la ficha (decisión 78): el resumen ejecutivo
 * automático de frases fijas (RN-REP-28) y los textos editables del relato
 * del mes (RN-REP-30). Sin base de datos: todo entra por el gateway falso.
 */

const AGOSTO = { start: "2026-08-01", end: "2026-08-31" };

function cambio(overrides: Partial<MonthChange> = {}): MonthChange {
  return {
    code: "SOL-1",
    title: "Cambiar el precio del menú",
    description: "Cambiar 20 € de pescado por 25 €",
    category: "small",
    budgeted: false,
    requestedAt: "2026-08-03",
    acceptedAt: "2026-08-04",
    rejectedAt: null,
    startedAt: "2026-08-04",
    completedAt: "2026-08-06",
    cancelledAt: null,
    corrections: 0,
    ...overrides,
  };
}

const RELATO: MonthActivity = {
  changes: [
    cambio(),
    cambio({ code: "SOL-2", completedAt: null }),
    cambio({ code: "SOL-3", startedAt: null, completedAt: null }),
  ],
  entries: [
    { at: "2026-08-10T09:00:00Z", kind: "menu_published", subject: "2026-08-10", category: null },
    { at: "2026-08-11T09:00:00Z", kind: "menu_published", subject: "2026-08-11", category: null },
    { at: "2026-08-12T09:00:00Z", kind: "file_shared", subject: "carta.pdf", category: null },
  ],
};

const TODAS: readonly ReportSectionState[] = [
  { key: "executive_summary", position: 1, included: true },
  { key: "month_activity", position: 2, included: true },
  { key: "operation", position: 3, included: true },
  { key: "digital", position: 4, included: true },
];

describe("RN-REP-28 · los hechos del resumen automático", () => {
  it("RN-REP-28 · cuenta los cambios por lo que pasó con ellos, no por su estado interno", () => {
    const hechos = executiveSummaryFacts({
      period: AGOSTO,
      figures: [],
      sections: TODAS,
      activity: RELATO,
      allowance: [],
    });
    expect(hechos.changes).toEqual({ delivered: 1, inProgress: 1, pendingStart: 1 });
    expect(hechos.menusPublished).toBe(2);
  });

  it("RN-REP-28 · solo cita cifras de secciones que el informe lleva (un Básico no recibe plazos por el resumen)", () => {
    const figuras = [
      { section: "operation" as const, metric: "start_compliance", value: 92 },
      { section: "digital" as const, metric: "sessions", dimension: "ga4", value: 5921 },
    ];
    const basico = executiveSummaryFacts({
      period: AGOSTO,
      figures: figuras,
      // RN-REP-15 · un Básico no lleva Operación ni Rendimiento digital.
      sections: [
        { key: "executive_summary", position: 1, included: true },
        { key: "month_activity", position: 2, included: true },
        { key: "operation", position: 3, included: false },
        { key: "digital", position: 4, included: false },
      ],
      activity: RELATO,
      allowance: [],
    });
    expect(basico.startCompliance).toBeNull();
    expect(basico.visits).toBeNull();

    const completo = executiveSummaryFacts({ period: AGOSTO, figures: figuras, sections: TODAS, activity: RELATO, allowance: [] });
    expect(completo.startCompliance).toBe(92);
    expect(completo.visits).toBe(5921);
  });

  it("RN-REP-28 · la bolsa solo dice lo gastado de lo que el plan incluye; sin plan no hay 'de tus'", () => {
    const hechos = executiveSummaryFacts({
      period: AGOSTO,
      figures: [],
      sections: TODAS,
      activity: RELATO,
      allowance: [
        { category: "small", consumed: 2, included: 5, budgeted: 0 },
        { category: "photo", consumed: 0, included: 2, budgeted: 0 },
        { category: "large", consumed: 1, included: null, budgeted: 1 },
      ],
    });
    expect(hechos.allowance).toEqual([{ category: "small", consumed: 2, included: 5 }]);
    expect(hechos.budgeted).toBe(1);
  });

  it("RN-REP-28 · sin el relato del mes no se dice nada de cambios (null, no cero)", () => {
    const hechos = executiveSummaryFacts({
      period: AGOSTO,
      figures: [],
      sections: [{ key: "executive_summary", position: 1, included: true }],
      activity: undefined,
      allowance: undefined,
    });
    expect(hechos.changes).toBeNull();
    expect(hechos.menusPublished).toBeNull();
  });
});

describe("RN-REP-28 · las frases fijas", () => {
  it("RN-REP-28 · el mes en letra, en la zona del periodo y no la del servidor", () => {
    expect(monthName(AGOSTO)).toBe("agosto de 2026");
  });

  it("RN-REP-28 · cuenta hechos con frases fijas y cada frase solo si tiene su dato", () => {
    const texto = executiveSummaryText({
      period: AGOSTO,
      changes: { delivered: 4, inProgress: 1, pendingStart: 0 },
      allowance: [
        { category: "small", consumed: 3, included: 5 },
        { category: "medium", consumed: 1, included: 1 },
      ],
      budgeted: 0,
      menusPublished: 18,
      startCompliance: null,
      visits: null,
    });
    expect(texto).toBe(
      "En agosto de 2026 se entregaron 4 cambios y 1 sigue en proceso. " +
        "Has usado 3 de tus 5 cambios pequeños y 1 de tu 1 cambio mediano. " +
        "Se publicaron 18 menús del día.",
    );
  });

  it("RN-REP-28 · no valora: ninguna frase dice si el mes fue bueno o malo", () => {
    const texto = executiveSummaryText({
      period: AGOSTO,
      changes: { delivered: 0, inProgress: 0, pendingStart: 0 },
      allowance: [],
      budgeted: 2,
      menusPublished: 0,
      startCompliance: 87.6,
      visits: 5921,
    });
    expect(texto).toBe(
      "En agosto de 2026 no hubo cambios. " +
        "2 cambios se presupuestaron aparte y no gastaron de tu plan. " +
        "El 88 % de los cambios empezó dentro de plazo. " +
        "La web recibió 5921 visitas.".replace("5921", new Intl.NumberFormat("es-ES").format(5921)),
    );
    expect(texto).not.toMatch(/buen|mal|mejor|peor/i);
  });
});

describe("RN-REP-30 · los textos editables del relato del mes", () => {
  it("RN-REP-30 · la clave de cada cosa sale igual en cada generación", () => {
    expect(changeEntryKey(cambio())).toBe("change:SOL-1");
    expect(activityEntryKey(RELATO.entries[2])).toBe("entry:file_shared:2026-08-12T09:00:00Z:carta.pdf");
    expect(activityEntryKey({ kind: "menu_published", at: "2026-08-10", subject: null })).toBe(
      "entry:menu_published:2026-08-10:",
    );
  });

  it("RN-REP-30 · lo editado se lee, y el original viaja al lado sin tocarse", () => {
    const editado = applyEntryTexts(
      RELATO,
      new Map([
        ["change:SOL-1", { title: "Nueva carta de verano", body: null }],
        [activityEntryKey(RELATO.entries[2]), { title: null, body: "Te enviamos la carta nueva en PDF" }],
      ]),
    );
    const primero = editado.changes[0];
    expect(changeTitle(primero)).toBe("Nueva carta de verano");
    expect(primero.title).toBe("Cambiar el precio del menú");
    // La descripción no se tocó: sigue la del restaurante.
    expect(changeDescription(primero)).toBe("Cambiar 20 € de pescado por 25 €");
    expect(activityText(editado.entries[2], es.reportsPage)).toBe("Te enviamos la carta nueva en PDF");
    expect(activityText(editado.entries[0], es.reportsPage)).toContain("Menú del día publicado");
  });

  it("RN-REP-30 · un texto vacío es el original, no una línea en blanco", () => {
    const editado = applyEntryTexts(RELATO, new Map([["change:SOL-1", { title: "   ", body: "" }]]));
    expect(editado.changes[0].editedTitle).toBeUndefined();
    expect(editado.changes[0].editedDescription).toBeUndefined();
    expect(changeTitle(editado.changes[0])).toBe("Cambiar el precio del menú");
  });
});

describe("RN-REP-28 y RN-REP-30 · lo que guarda la versión", () => {
  function gateway(activity: MonthActivity): ReportGateway {
    return {
      report: vi.fn(),
      operationDataset: vi.fn().mockResolvedValue({}),
      financeDataset: vi.fn().mockResolvedValue({}),
      metricPoints: vi.fn().mockResolvedValue(new Map()),
      providerStates: vi.fn().mockResolvedValue([]),
      monthActivity: vi.fn().mockResolvedValue(activity),
      changeAllowance: vi.fn().mockResolvedValue({ categories: [] }),
      approvedOpportunities: vi.fn().mockResolvedValue([]),
      previousReportOpportunities: vi.fn().mockResolvedValue([]),
      planUsageData: vi.fn().mockResolvedValue({ cycles: [], entries: [] }),
      holidays: vi.fn().mockResolvedValue([]),
      storeVersion: vi.fn(),
      reportsDueForSend: vi.fn(),
      reportsDueForReminder: vi.fn(),
      send: vi.fn(),
      notifyScheduleDueSoon: vi.fn(),
    };
  }

  function informe(overrides: Partial<ReportRow> = {}): ReportRow {
    return {
      id: "rep-1",
      spaceId: "space-1",
      establishmentId: "est-1",
      category: "operation",
      periodStart: AGOSTO.start,
      periodEnd: AGOSTO.end,
      status: "preparing",
      sections: [
        { key: "executive_summary", position: 1, included: true },
        { key: "month_activity", position: 2, included: true },
      ],
      notes: {},
      timezone: "Europe/Madrid",
      reportLevel: "basic",
      ...overrides,
    };
  }

  const deps = (activity: MonthActivity) => ({
    gateway: gateway(activity),
    now: () => new Date("2026-09-25T10:00:00Z"),
  });

  it("RN-REP-28 · sin texto de una persona, el resumen es el automático y la versión lo dice", async () => {
    const snapshot = await buildSnapshot(deps(RELATO), informe());
    expect(snapshot.notes.executive_summary).toMatch(/^En agosto de 2026 se entregó 1 cambio/);
    expect(snapshot.summary).toEqual({ auto: true, autoText: snapshot.notes.executive_summary });
  });

  it("RN-REP-28 · si una persona lo reescribió, manda su texto y el automático se guarda al lado", async () => {
    const snapshot = await buildSnapshot(
      deps(RELATO),
      informe({ notes: { executive_summary: "Un mes tranquilo; seguimos con la carta." } }),
    );
    expect(snapshot.notes.executive_summary).toBe("Un mes tranquilo; seguimos con la carta.");
    expect(snapshot.summary?.auto).toBe(false);
    expect(snapshot.summary?.autoText).toMatch(/^En agosto de 2026/);
  });

  it("RN-REP-28 · un informe sin resumen ejecutivo no lleva ninguno", async () => {
    const snapshot = await buildSnapshot(
      deps(RELATO),
      informe({ sections: [{ key: "month_activity", position: 1, included: true }] }),
    );
    expect(snapshot.notes.executive_summary).toBeUndefined();
    expect(snapshot.summary).toBeUndefined();
  });

  it("RN-REP-30 · los textos editados entran en la versión con el original al lado", async () => {
    const snapshot = await buildSnapshot(
      deps(RELATO),
      informe({ entryTexts: new Map([["change:SOL-2", { title: "Fotos nuevas de la terraza", body: null }]]) }),
    );
    const segundo = snapshot.activity?.changes.find((row) => row.code === "SOL-2");
    expect(segundo?.editedTitle).toBe("Fotos nuevas de la terraza");
    expect(segundo?.title).toBe("Cambiar el precio del menú");
  });
});
