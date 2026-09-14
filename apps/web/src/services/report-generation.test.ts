import { describe, expect, it, vi } from "vitest";

import type { MetricPoint } from "@/core/integrations";
import type { ReportSectionState } from "@/core/reports";

import {
  buildSnapshot,
  digitalFigures,
  financeFigures,
  operationFigures,
  parseOperationDataset,
  runReportQueue,
} from "./report-generation";
import type { ProviderState, ReportGateway, ReportRow } from "./report-gateway";

/**
 * El generador y la tanda de la cola (Fase 3, Hito 16; §91 a §95).
 *
 * Todo entra por el `ReportGateway`, así que esto corre sin base de datos
 * y sin red. Lo que se comprueba es lo que el generador decide: qué
 * cifras salen de cada familia, que una fuente muerta **dice su motivo**
 * en vez de dejar un hueco, y que la cola avisa antes de enviar y no al
 * revés.
 */

const AHORA = new Date("2026-09-01T08:00:00Z");

function gateway(overrides: Partial<ReportGateway> = {}): ReportGateway {
  return {
    report: vi.fn().mockResolvedValue(null),
    operationDataset: vi.fn().mockResolvedValue({}),
    financeDataset: vi.fn().mockResolvedValue({}),
    metricPoints: vi.fn().mockResolvedValue(new Map()),
    providerStates: vi.fn().mockResolvedValue([]),
    approvedOpportunities: vi.fn().mockResolvedValue([]),
    holidays: vi.fn().mockResolvedValue([]),
    storeVersion: vi.fn().mockResolvedValue("version-1"),
    reportsDueForSend: vi.fn().mockResolvedValue([]),
    reportsDueForReminder: vi.fn().mockResolvedValue([]),
    send: vi.fn().mockResolvedValue(0),
    notifyScheduleDueSoon: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

const SECCIONES: readonly ReportSectionState[] = [
  { key: "operation", position: 1, included: true },
];

function informe(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    id: "rep-1",
    spaceId: "space-1",
    establishmentId: "est-1",
    category: "operation",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    status: "preparing",
    sections: SECCIONES,
    notes: {},
    timezone: "Europe/Madrid",
    ...overrides,
  };
}

describe("de las filas de la base al dominio", () => {
  it("RN-COM-12 · 24 h de plazo de inicio es el acelerado; 48, el normal", () => {
    const conPrisa = parseOperationDataset({
      jobs: [{ id: "a", establishment_id: "e", category: "medium", state: "published", start_sla_hours: 24 }],
    });
    const sinPrisa = parseOperationDataset({
      jobs: [{ id: "b", establishment_id: "e", category: "medium", state: "published", start_sla_hours: 48 }],
    });
    const sinSaberlo = parseOperationDataset({
      jobs: [{ id: "c", establishment_id: "e", category: "medium", state: "published", start_sla_hours: null }],
    });

    expect(conPrisa.jobs[0].hasAcceleratedSla).toBe(true);
    expect(sinPrisa.jobs[0].hasAcceleratedSla).toBe(false);
    // No saberlo NO es tener prisa: se trata como el plazo normal.
    expect(sinSaberlo.jobs[0].hasAcceleratedSla).toBe(false);
  });

  it("un evento de contador con fecha ilegible se deja fuera en vez de envenenar la media", () => {
    const dataset = parseOperationDataset({
      jobs: [
        {
          id: "a",
          establishment_id: "e",
          category: "small",
          state: "published",
          t2_events: [
            { type: "started", occurred_at: "2026-08-03T07:00:00Z" },
            { type: "stopped", occurred_at: "no es una fecha" },
          ],
        },
      ],
    });

    expect(dataset.jobs[0].t2Events).toHaveLength(1);
  });
});

describe("§91 · las cifras de operación", () => {
  it("salen las diez de §91, con su unidad", () => {
    const figuras = operationFigures(
      {
        requests: [],
        jobs: [],
        blocks: [],
        consumption: [],
        menus: [],
        correctionsRequested: 0,
        menuUpdatesUsed: 0,
      },
      "Europe/Madrid",
      [],
      AHORA,
    );

    const metricas = figuras.map((figura) => figura.metric);
    for (const esperada of [
      "requests_received",
      "requests_accepted",
      "requests_rejected",
      "requests_cancelled",
      "jobs_started",
      "jobs_completed",
      "jobs_pending",
      "start_compliance",
      "execution_compliance",
      "average_start",
      "average_completion",
      "jobs_blocked",
      "blocked_time",
      "corrections_requested",
      "consumption",
      "menu_updates_used",
      "menus_published",
      "menus_out_of_guarantee",
    ]) {
      expect(metricas).toContain(esperada);
    }

    // El cumplimiento va en porcentaje y los tiempos en minutos LABORABLES:
    // decir "minutos" a secas invitaría a leerlos como horas de reloj.
    expect(figuras.find((f) => f.metric === "start_compliance")?.unit).toBe("percent");
    expect(figuras.find((f) => f.metric === "average_start")?.unit).toBe("business_minutes");
    expect(figuras.find((f) => f.metric === "blocked_time")?.unit).toBe("minutes");
  });

  it("el consumo se desglosa por las cuatro categorías", () => {
    const figuras = operationFigures(
      {
        requests: [],
        jobs: [],
        blocks: [],
        consumption: [{ establishmentId: "e", category: "photo", amount: -2 }],
        menus: [],
        correctionsRequested: 0,
        menuUpdatesUsed: 0,
      },
      "Europe/Madrid",
      [],
      AHORA,
    );

    const consumo = figuras.filter((figura) => figura.metric === "consumption");
    expect(consumo.map((figura) => figura.dimension)).toEqual(["small", "photo", "medium", "large"]);
    expect(consumo.find((figura) => figura.dimension === "photo")?.value).toBe(2);
  });
});

describe("§89.2 · las cifras de finanzas", () => {
  it("van en céntimos y no en euros: redondear aquí sería perder dinero por el camino", () => {
    const figuras = financeFigures({
      income_base_cents: 39900,
      income_total_cents: 48279,
      charges_issued: 3,
      collected_cents: 24000,
      outstanding_cents: 24279,
      charges_overdue: 1,
      establishments_with_debt: 1,
      renewals_due: 2,
    });

    expect(figuras.find((f) => f.metric === "income_total")?.value).toBe(48279);
    expect(figuras.find((f) => f.metric === "income_total")?.unit).toBe("cents");
    expect(figuras.find((f) => f.metric === "renewals_due")?.value).toBe(2);
  });
});

describe("§92 y §94 · las cifras digitales dicen su fecha y su motivo", () => {
  const ventana = { start: "2026-08-01", end: "2026-08-28" };

  function puntos(metric: string, dias: number): MetricPoint[] {
    return Array.from({ length: dias }, (_, index) => {
      const dia = `2026-08-${String(index + 1).padStart(2, "0")}`;
      return { metric, dimension: "", period_start: dia, period_end: dia, value: 100, unit: null };
    });
  }

  it("RN-REP-07 · con la fuente conectada y dato suficiente, sale la cifra y su fecha de última sincronización", () => {
    const estados: ProviderState[] = [
      { provider: "ga4", status: "connected", lastSuccessAt: "2026-08-29T06:00:00Z" },
    ];
    const figuras = digitalFigures(
      new Map([["ga4", puntos("sessions", 10)]]),
      estados,
      ventana,
      new Date("2026-08-29T08:00:00Z"),
      "Europe/Madrid",
    );

    const sesiones = figuras.find((figura) => figura.metric === "sessions" && figura.dimension === "ga4");
    expect(sesiones?.value).toBe(1000);
    // §94 · "cada cifra dice su fecha de última sincronización". Antes
    // decía `2026-08-10`, el último día que cubre el dato, que es otra
    // cosa: dos cifras traídas con tres semanas de diferencia salían
    // idénticas (revisión del Hito 16).
    expect(sesiones?.at).toBe("2026-08-29T06:00:00Z");
    expect(sesiones?.noDataReason).toBeUndefined();
  });

  it("§178 · una fuente sin conectar no deja un hueco mudo: dice que no está conectada", () => {
    const figuras = digitalFigures(new Map(), [], ventana, AHORA, "Europe/Madrid");
    const sesiones = figuras.find((figura) => figura.metric === "sessions" && figura.dimension === "ga4");

    expect(sesiones?.value).toBeNull();
    expect(sesiones?.noDataReason).toBe("not_connected");
  });

  it("RN-INT-07 · en un periodo que llega hasta hoy, el dato desactualizado no se enseña como actual", () => {
    const estados: ProviderState[] = [
      // GA4 es diaria: una sincronización de hace cinco días es vieja.
      { provider: "ga4", status: "connected", lastSuccessAt: "2026-08-24T06:00:00Z" },
    ];
    const figuras = digitalFigures(
      new Map([["ga4", puntos("sessions", 10)]]),
      estados,
      // El periodo llega hasta HOY: aquí "desactualizado" significa lo que
      // dice, que puede faltar el dato del final.
      { start: "2026-08-01", end: "2026-08-29" },
      new Date("2026-08-29T08:00:00Z"),
      "Europe/Madrid",
    );
    const sesiones = figuras.find((figura) => figura.metric === "sessions" && figura.dimension === "ga4");

    expect(sesiones?.value).toBeNull();
    expect(sesiones?.noDataReason).toBe("stale");
    // Pero la fecha de la última sincronización sigue estando: §94 pide
    // decir hasta cuándo llega, no borrarlo.
    expect(sesiones?.at).toBe("2026-08-24T06:00:00Z");
  });

  it("RN-REP-04 y §94 · un periodo CERRADO no depende del estado de hoy de la fuente", () => {
    /*
      Lo encontró la revisión del Hito 16 (14/09/2026), y es el escenario
      que RN-REP-07 nombra por su nombre: un restaurante baja de plan en
      septiembre y pierde GA4; en octubre el equipo prepara el informe de
      agosto. Los puntos de agosto están enteros en `metric_points` y el
      informe no llama a ninguna API, pero el estado de HOY de la
      integración vaciaba todas las cifras con el motivo "no conectada".

      Las dos mitades de la regla se comprueban aquí: desconectada y
      desactualizada. Antes las dos daban `null`.
    */
    const desconectada: ProviderState[] = [
      { provider: "ga4", status: "disconnected", lastSuccessAt: "2026-08-29T06:00:00Z" },
    ];
    const enOctubre = new Date("2026-10-05T08:00:00Z");

    const figuras = digitalFigures(
      new Map([["ga4", puntos("sessions", 10)]]),
      desconectada,
      ventana,
      enOctubre,
      "Europe/Madrid",
    );
    const sesiones = figuras.find((figura) => figura.metric === "sessions" && figura.dimension === "ga4");

    expect(sesiones?.value).toBe(1000);
    expect(sesiones?.noDataReason).toBeUndefined();

    // Y una fuente que NUNCA sincronizó sigue diciendo que no hay dato:
    // "cerrado" no significa inventarse cifras que nadie trajo.
    const nunca = digitalFigures(
      new Map(),
      [{ provider: "ga4", status: "disconnected", lastSuccessAt: null }],
      ventana,
      enOctubre,
      "Europe/Madrid",
    );
    const sinDato = nunca.find((figura) => figura.metric === "sessions" && figura.dimension === "ga4");
    expect(sinDato?.value).toBeNull();
    expect(sinDato?.noDataReason).toBe("no_data_yet");
  });

  it("§178 · con menos de una semana de dato, el motivo es «periodo insuficiente»", () => {
    const estados: ProviderState[] = [
      { provider: "ga4", status: "connected", lastSuccessAt: "2026-08-29T06:00:00Z" },
    ];
    const figuras = digitalFigures(
      new Map([["ga4", puntos("sessions", 3)]]),
      estados,
      ventana,
      new Date("2026-08-29T08:00:00Z"),
      "Europe/Madrid",
    );
    const sesiones = figuras.find((figura) => figura.metric === "sessions" && figura.dimension === "ga4");

    expect(sesiones?.value).toBeNull();
    expect(sesiones?.noDataReason).toBe("insufficient_period");
  });
});

describe("la versión que se guarda (RN-REP-12)", () => {
  it("lleva las secciones, el periodo y las notas de las personas; nada redactado", async () => {
    const conResumen: readonly ReportSectionState[] = [
      { key: "executive_summary", position: 1, included: true },
      ...SECCIONES,
    ];
    const informeConNota = informe({
      sections: conResumen,
      notes: { executive_summary: "Buen mes." },
    });
    const deps = { gateway: gateway({ report: vi.fn().mockResolvedValue(informeConNota) }), now: () => AHORA };

    const snapshot = await buildSnapshot(deps, informeConNota);

    expect(snapshot.period).toEqual({ start: "2026-08-01", end: "2026-08-31" });
    expect(snapshot.sections).toEqual(conResumen);
    expect(snapshot.notes.executive_summary).toBe("Buen mes.");
    expect(snapshot.generatedAt).toBe(AHORA.toISOString());
  });

  it("RN-REP-13 · la nota de una sección que NO entra se queda fuera de la versión", async () => {
    /*
      Lo encontró la revisión del Hito 16 (14/09/2026). El equipo escribe
      el resumen ejecutivo y después lo desmarca para dejar el informe
      "solo objetivo" y poder programarlo sin aprobación — el camino que
      recorre la propia suite de SQL. El PDF y la pantalla filtran por
      secciones incluidas y no lo pintaban, pero el texto viajaba dentro
      del `snapshot`, y la versión enviada se le entrega al restaurante.

      La primera versión de este test no lo veía porque ponía la nota en
      una sección que ni siquiera figuraba en la lista: pasaba con la fuga
      dentro.
    */
    const conResumenFuera: readonly ReportSectionState[] = [
      { key: "executive_summary", position: 1, included: false },
      ...SECCIONES,
    ];
    const informeConNota = informe({
      sections: conResumenFuera,
      notes: { executive_summary: "Nota interna que el cliente no debe leer." },
    });
    const deps = { gateway: gateway({ report: vi.fn().mockResolvedValue(informeConNota) }), now: () => AHORA };

    const snapshot = await buildSnapshot(deps, informeConNota);

    expect(snapshot.notes.executive_summary).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain("Nota interna");
  });

  it("RN-REP-04 · la sección digital lee `metric_points` y no llama a ninguna API", async () => {
    const puertas = gateway();
    await buildSnapshot(
      { gateway: puertas, now: () => AHORA },
      informe({
        category: "operation",
        sections: [
          { key: "operation", position: 1, included: false },
          { key: "digital", position: 2, included: true },
        ],
      }),
    );

    expect(puertas.metricPoints).toHaveBeenCalledWith("est-1", "2026-08-01", "2026-08-31");
    // Un informe de operación con la sección de operación apagada no pide
    // sus filas: se genera lo que se va a enseñar y nada más.
    expect(puertas.operationDataset).not.toHaveBeenCalled();
  });

  it("un informe de operación con la sección digital dentro genera las dos", async () => {
    const puertas = gateway();
    await buildSnapshot(
      { gateway: puertas, now: () => AHORA },
      informe({
        sections: [
          { key: "operation", position: 1, included: true },
          { key: "digital", position: 2, included: true },
        ],
      }),
    );

    expect(puertas.operationDataset).toHaveBeenCalled();
    expect(puertas.metricPoints).toHaveBeenCalled();
  });

  it("un consolidado no tiene restaurante del que leer lo digital, y no inventa cifras", async () => {
    const puertas = gateway();
    const snapshot = await buildSnapshot(
      { gateway: puertas, now: () => AHORA },
      informe({
        establishmentId: null,
        sections: [{ key: "digital", position: 1, included: true }],
      }),
    );

    expect(puertas.metricPoints).not.toHaveBeenCalled();
    expect(snapshot.figures).toEqual([]);
  });

  it("§96 · solo entran las oportunidades APROBADAS, y solo si la sección está dentro", async () => {
    const aprobadas = vi.fn().mockResolvedValue([
      { id: "opp-1", rule: "low_ctr", subject: "menú", title: null, impact: "low", effortCategory: "small" },
    ]);
    const puertas = gateway({ approvedOpportunities: aprobadas });

    const sin = await buildSnapshot({ gateway: puertas, now: () => AHORA }, informe());
    expect(sin.opportunities).toEqual([]);
    expect(aprobadas).not.toHaveBeenCalled();

    const con = await buildSnapshot(
      { gateway: puertas, now: () => AHORA },
      informe({ sections: [{ key: "opportunities", position: 1, included: true }] }),
    );
    expect(con.opportunities).toHaveLength(1);
    expect(aprobadas).toHaveBeenCalledWith("est-1", "2026-08-01", "2026-08-31");
  });

  it("RN-CLK-10 · el calendario se arma con los festivos conocidos al empezar el periodo", async () => {
    const puertas = gateway({ holidays: vi.fn().mockResolvedValue([]) });
    await buildSnapshot({ gateway: puertas, now: () => AHORA }, informe());

    expect(puertas.holidays).toHaveBeenCalledWith("space-1");
  });
});

describe("§95 · la tanda de la cola", () => {
  it("avisa antes de enviar: al revés el aviso no serviría de nada", async () => {
    const orden: string[] = [];
    const puertas = gateway({
      reportsDueForReminder: vi.fn().mockResolvedValue(["rep-1"]),
      reportsDueForSend: vi.fn().mockResolvedValue(["rep-2"]),
      notifyScheduleDueSoon: vi.fn().mockImplementation(async () => {
        orden.push("avisar");
        return 2;
      }),
      send: vi.fn().mockImplementation(async () => {
        orden.push("enviar");
        return 3;
      }),
    });

    const resultado = await runReportQueue({ gateway: puertas, now: () => AHORA });

    expect(orden).toEqual(["avisar", "enviar"]);
    expect(resultado).toEqual({ reminded: 2, sent: 1, blocked: 0, failed: 0 });
  });

  it("RN-REP-10 · un envío detenido por oportunidades pendientes se cuenta como detenido, no como enviado", async () => {
    const puertas = gateway({
      reportsDueForSend: vi.fn().mockResolvedValue(["rep-1", "rep-2"]),
      send: vi.fn().mockImplementation(async (id: string) => (id === "rep-1" ? -1 : 1)),
    });

    const resultado = await runReportQueue({ gateway: puertas, now: () => AHORA });

    expect(resultado.blocked).toBe(1);
    expect(resultado.sent).toBe(1);
  });

  it("un informe que falla no tumba a los demás", async () => {
    const puertas = gateway({
      reportsDueForSend: vi.fn().mockResolvedValue(["rep-1", "rep-2"]),
      send: vi.fn().mockImplementation(async (id: string) => {
        if (id === "rep-1") throw new Error("la base dijo que no");
        return 2;
      }),
    });

    const resultado = await runReportQueue({ gateway: puertas, now: () => AHORA });

    expect(resultado.failed).toBe(1);
    expect(resultado.sent).toBe(1);
  });
});
