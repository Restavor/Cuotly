import { describe, expect, it } from "vitest";

import { contractualCalendar } from "./business-clock";
import {
  changeEffects,
  withYearAgoFigures,
  changeTimings,
  opportunityFollowUp,
  planUsage,
  sameMonthLastYear,
  weekBuckets,
  weeklySeries,
  REPORT_CATEGORIES,
  REPORT_SECTION_KEYS,
  REPORT_STATES,
  type OperationDataset,
  type ReportJobRow,
  type ReportSectionState,
  type ReportSnapshot,
  canScheduleWithoutApproval,
  defaultReportPeriod,
  defaultSections,
  isObjectiveOnly,
  operationalIndicators,
  orderedSections,
  figureChange,
  headlineFigures,
  highestReportLevel,
  parseFilters,
  previousPeriod,
  reportLevelComparison,
  reorderSections,
  reportCsv,
  reportIsVisibleToClient,
  reportTransitionAllowed,
  scheduleReminderDue,
  sectionRequiresJudgement,
  sendGate,
  sendIsDue,
  serializeFilters,
  withPreviousFigures,
  workerComparison,
  workerPersonalReport,
} from "./reports";
import type { TimerEvent } from "./timer-events";

/**
 * Los informes (PRD §29, RN-REP-01 a 14; §89 a §95).
 *
 * Lo que se comprueba aquí es lo que se decide **en el dominio**: los diez
 * indicadores de §91 con el reloj contractual, los seis estados de §95 y
 * quién los mueve, qué secciones requieren criterio y el CSV. Lo que
 * decide el servidor —quién ve qué, el freno de las oportunidades, el
 * envío— está en `supabase/tests/informes.sql`, porque ahí es donde se
 * hace cumplir (CLAUDE.md: ocultar un botón no es un control de acceso).
 */

const CALENDARIO = contractualCalendar("Europe/Madrid", []);

/** Un lunes a las 09:00 de Madrid, que es cuando arranca el reloj (RN-CLK-01). */
function lunes(hora: number, minuto = 0): Date {
  return new Date(Date.UTC(2026, 8, 7, hora - 2, minuto));
}

function evento(type: TimerEvent["type"], at: Date): TimerEvent {
  return { type, occurredAt: at };
}

function trabajo(overrides: Partial<ReportJobRow> = {}): ReportJobRow {
  return {
    id: "job-1",
    establishmentId: "est-1",
    category: "medium",
    state: "published",
    assigneeId: "ana",
    planId: "plan-1",
    createdAt: lunes(9),
    startedAt: lunes(11),
    publishedAt: lunes(15),
    completedAt: null,
    hasAcceleratedSla: false,
    t2Events: [evento("started", lunes(9)), evento("stopped", lunes(11))],
    t3Events: [evento("started", lunes(11)), evento("stopped", lunes(15))],
    ...overrides,
  };
}

function conjunto(overrides: Partial<OperationDataset> = {}): OperationDataset {
  return {
    requests: [],
    jobs: [],
    blocks: [],
    consumption: [],
    menus: [],
    correctionsRequested: 0,
    menuUpdatesUsed: 0,
    ...overrides,
  };
}

describe("§89 · las tres familias y las secciones de la maqueta 10.04", () => {
  it("las familias son tres, ni una más", () => {
    expect([...REPORT_CATEGORIES]).toEqual(["operation", "finance", "digital"]);
  });

  it("las secciones son las cinco de la maqueta, más Finanzas, el relato del mes y el tráfico de la web (RN-REP-33)", () => {
    // El orden es el mismo que el de `report_sections_catalogue()` en SQL
    // (migraciones 112 y 145): el relato del mes va detrás del resumen,
    // porque se lee antes que las cifras, y el tráfico justo detrás.
    expect([...REPORT_SECTION_KEYS]).toEqual([
      "executive_summary",
      "month_activity",
      "web_traffic",
      "operation",
      "finance",
      "digital",
      "opportunities",
      "annexes",
    ]);
  });

  it("§95.3 · requieren criterio el resumen ejecutivo y las oportunidades, y nada más", () => {
    const conCriterio = REPORT_SECTION_KEYS.filter(sectionRequiresJudgement);
    expect([...conCriterio]).toEqual(["executive_summary", "opportunities"]);
  });

  it("RN-REP-18 · el borrador nace con el resumen, el relato del mes, su familia y los anexos; las oportunidades nunca", () => {
    // Requerir criterio NO es entrar apagada: la maqueta dibuja el resumen
    // ejecutivo marcado y las oportunidades sin marcar (§99: "Incluir en
    // informe" se vuelve a decidir).
    const operacion = defaultSections("operation");
    const incluidas = operacion.filter((section) => section.included).map((section) => section.key);
    expect(incluidas).toEqual(["executive_summary", "month_activity", "web_traffic", "operation", "annexes"]);

    const finanzas = defaultSections("finance").filter((s) => s.included).map((s) => s.key);
    expect(finanzas).toEqual(["executive_summary", "month_activity", "web_traffic", "finance", "annexes"]);

    for (const category of REPORT_CATEGORIES) {
      expect(defaultSections(category).find((s) => s.key === "opportunities")?.included).toBe(false);
    }
  });

  it("§95 · un informe con el resumen ejecutivo dentro NO es solo objetivo", () => {
    // Y por tanto el informe por omisión pasa por aprobación, que es lo
    // que dice la maqueta ("Requiere tu aprobación para finalizar").
    const secciones = defaultSections("digital");
    expect(isObjectiveOnly(secciones)).toBe(false);
    expect(canScheduleWithoutApproval(secciones)).toEqual({
      allowed: false,
      reason: "needs_judgement",
    });
  });

  it("§95 · quitando lo que pide criterio, sí se puede programar sin aprobar", () => {
    const soloCifras = defaultSections("digital").map((section) =>
      sectionRequiresJudgement(section.key) ? { ...section, included: false } : section,
    );
    expect(isObjectiveOnly(soloCifras)).toBe(true);
    expect(canScheduleWithoutApproval(soloCifras)).toEqual({ allowed: true });
  });
});

describe("§95 · los seis estados y quién los mueve (RN-REP-08)", () => {
  it("son seis, en el orden de §95", () => {
    expect([...REPORT_STATES]).toEqual([
      "preparing",
      "pending_review",
      "approved",
      "scheduled",
      "sent",
      "archived",
    ]);
  });

  it("aprobar, programar y enviar son de quien tiene «Aprobar informes»", () => {
    expect(reportTransitionAllowed("pending_review", "approved", "editor")).toBe(false);
    expect(reportTransitionAllowed("pending_review", "approved", "approver")).toBe(true);
    expect(reportTransitionAllowed("approved", "scheduled", "editor")).toBe(false);
    expect(reportTransitionAllowed("approved", "sent", "editor")).toBe(false);
  });

  it("RN-REP-09 · de aprobado se vuelve a revisión al editarlo, y nunca a preparando", () => {
    expect(reportTransitionAllowed("approved", "pending_review", "editor")).toBe(true);
    expect(reportTransitionAllowed("approved", "preparing", "approver")).toBe(false);
  });

  it("RN-REP-12 · lo enviado no vuelve atrás: solo se archiva", () => {
    expect(reportTransitionAllowed("sent", "approved", "approver")).toBe(false);
    expect(reportTransitionAllowed("sent", "pending_review", "approver")).toBe(false);
    expect(reportTransitionAllowed("sent", "archived", "approver")).toBe(true);
    expect(reportTransitionAllowed("archived", "preparing", "approver")).toBe(false);
  });

  it("RN-REP-13 · el restaurante solo alcanza lo enviado", () => {
    expect(reportIsVisibleToClient("preparing")).toBe(false);
    expect(reportIsVisibleToClient("pending_review")).toBe(false);
    expect(reportIsVisibleToClient("approved")).toBe(false);
    expect(reportIsVisibleToClient("scheduled")).toBe(false);
    expect(reportIsVisibleToClient("sent")).toBe(true);
    expect(reportIsVisibleToClient("archived")).toBe(true);
  });
});

describe("§95 · el freno de las oportunidades pendientes (RN-REP-10)", () => {
  const conOportunidades: readonly ReportSectionState[] = [
    { key: "opportunities", position: 1, included: true },
  ];

  it("un informe que las incluye no sale mientras haya pendientes", () => {
    expect(sendGate({ sections: conOportunidades, pendingOpportunityCount: 2 })).toEqual({
      canSend: false,
      reason: "pending_opportunities",
      pendingCount: 2,
    });
  });

  it("uno que no habla de oportunidades sale igual, aunque las haya", () => {
    const sinOportunidades: readonly ReportSectionState[] = [
      { key: "operation", position: 1, included: true },
      { key: "opportunities", position: 2, included: false },
    ];
    expect(sendGate({ sections: sinOportunidades, pendingOpportunityCount: 5 })).toEqual({
      canSend: true,
    });
  });
});

describe("§95 · el aviso de la fecha programada (RN-REP-11)", () => {
  const fecha = new Date("2026-09-30T08:00:00Z");

  it("avisa 24 horas antes, no después de salir", () => {
    expect(scheduleReminderDue(fecha, new Date("2026-09-29T07:59:00Z"))).toBe(false);
    expect(scheduleReminderDue(fecha, new Date("2026-09-29T08:30:00Z"))).toBe(true);
    expect(scheduleReminderDue(fecha, new Date("2026-09-30T08:30:00Z"))).toBe(false);
  });

  it("el envío vence cuando llega la fecha, ni antes ni «casi»", () => {
    expect(sendIsDue(fecha, new Date("2026-09-30T07:59:59Z"))).toBe(false);
    expect(sendIsDue(fecha, fecha)).toBe(true);
  });
});

describe("§91 · los diez indicadores (RN-REP-03)", () => {
  it("cuenta las solicitudes por lo que son, y el borrador no es una recibida", () => {
    const indicadores = operationalIndicators(
      conjunto({
        requests: [
          { id: "1", establishmentId: "est-1", state: "draft", createdAt: lunes(9) },
          { id: "2", establishmentId: "est-1", state: "accepted", createdAt: lunes(9) },
          { id: "3", establishmentId: "est-1", state: "rejected", createdAt: lunes(9) },
          { id: "4", establishmentId: "est-1", state: "cancelled_after_start", createdAt: lunes(9) },
        ],
      }),
      CALENDARIO,
      lunes(18),
    );

    expect(indicadores.requestsReceived).toBe(3);
    expect(indicadores.requestsAccepted).toBe(1);
    expect(indicadores.requestsRejected).toBe(1);
    expect(indicadores.requestsCancelled).toBe(1);
  });

  it("el cumplimiento se mide con el reloj contractual, no con el de la pared", () => {
    // T2 son 48 h laborables sin plan acelerado (RN-SLA-02). Este trabajo
    // arrancó dos horas laborables después de aceptarse: cumple.
    const aTiempo = trabajo();
    // Y este, tres semanas después: no. En horas de calendario serían 500;
    // lo que decide es que pasó del límite laborable.
    const tarde = trabajo({
      id: "job-2",
      startedAt: new Date(Date.UTC(2026, 8, 28, 9, 0)),
      t2Events: [evento("started", lunes(9)), evento("stopped", new Date(Date.UTC(2026, 8, 28, 9, 0)))],
      publishedAt: null,
      t3Events: [],
      state: "in_progress",
    });

    const indicadores = operationalIndicators(
      conjunto({ jobs: [aTiempo, tarde] }),
      CALENDARIO,
      lunes(18),
    );

    expect(indicadores.jobsStarted).toBe(2);
    expect(indicadores.startCompliancePercent).toBe(50);
    expect(indicadores.jobsCompleted).toBe(1);
    expect(indicadores.jobsPending).toBe(1);
  });

  it("sin ningún trabajo que llegara al hito, el cumplimiento es `null` y no cero", () => {
    // Cero significaría "todos mal", que es una afirmación distinta y
    // falsa (CA-20: si no hay dato, se dice el motivo).
    const indicadores = operationalIndicators(conjunto(), CALENDARIO, lunes(18));
    expect(indicadores.startCompliancePercent).toBeNull();
    expect(indicadores.executionCompliancePercent).toBeNull();
    expect(indicadores.averageStartMinutes).toBeNull();
    expect(indicadores.averageCompletionMinutes).toBeNull();
  });

  it("los tiempos medios salen en minutos laborables", () => {
    const indicadores = operationalIndicators(
      conjunto({ jobs: [trabajo()] }),
      CALENDARIO,
      lunes(18),
    );
    // De las 09:00 a las 11:00 de un lunes: dos horas laborables.
    expect(indicadores.averageStartMinutes).toBe(120);
    // De las 11:00 a las 15:00: cuatro.
    expect(indicadores.averageCompletionMinutes).toBe(240);
  });

  it("los bloqueos se cuentan por trabajo y su duración en minutos de calendario", () => {
    const indicadores = operationalIndicators(
      conjunto({
        jobs: [trabajo()],
        blocks: [
          { jobId: "job-1", startedAt: lunes(12), endedAt: lunes(14) },
          { jobId: "job-1", startedAt: lunes(16), endedAt: lunes(17) },
        ],
      }),
      CALENDARIO,
      lunes(18),
    );

    expect(indicadores.jobsBlocked).toBe(1);
    expect(indicadores.blockedMinutes).toBe(180);
  });

  it("el consumo se lee del libro con su signo: los débitos gastan y las devoluciones vuelven", () => {
    const indicadores = operationalIndicators(
      conjunto({
        consumption: [
          { establishmentId: "est-1", category: "medium", amount: -1 },
          { establishmentId: "est-1", category: "medium", amount: -1 },
          { establishmentId: "est-1", category: "medium", amount: 1 },
          { establishmentId: "est-1", category: "photo", amount: -3 },
        ],
      }),
      CALENDARIO,
      lunes(18),
    );

    expect(indicadores.consumptionByCategory.medium).toBe(1);
    expect(indicadores.consumptionByCategory.photo).toBe(3);
    expect(indicadores.consumptionByCategory.small).toBe(0);
  });

  it("§62 · los menús fuera de garantía se cuentan aparte de los publicados", () => {
    const indicadores = operationalIndicators(
      conjunto({
        menus: [
          { establishmentId: "est-1", publishedAt: lunes(10), withinGuarantee: true },
          { establishmentId: "est-1", publishedAt: lunes(10), withinGuarantee: false },
          { establishmentId: "est-1", publishedAt: null, withinGuarantee: false },
        ],
        menuUpdatesUsed: 4,
      }),
      CALENDARIO,
      lunes(18),
    );

    expect(indicadores.menusPublished).toBe(2);
    expect(indicadores.menusOutOfGuarantee).toBe(1);
    expect(indicadores.menuUpdatesUsed).toBe(4);
  });
});

describe("§90 · el informe personal del trabajador (RN-REP-02)", () => {
  it("solo cuenta lo suyo, y separa los puntos históricos de la carga actual", () => {
    const informe = workerPersonalReport({
      workerId: "ana",
      currentLoadPoints: 12,
      historicalPoints: 48,
      jobs: [trabajo(), trabajo({ id: "job-2", assigneeId: "luis" })],
      blocks: [{ jobId: "job-2", startedAt: lunes(12), endedAt: lunes(13) }],
      correctionsRequested: 2,
      calendar: CALENDARIO,
      measuredAt: lunes(18),
    });

    expect(informe.jobsCompleted).toBe(1);
    expect(informe.currentLoadPoints).toBe(12);
    expect(informe.historicalPoints).toBe(48);
    // El bloqueo es de un trabajo de Luis: no es suyo.
    expect(informe.jobsBlocked).toBe(0);
    expect(informe.correctionsRequested).toBe(2);
  });

  it("§55 · la comparación se segmenta por plan y categoría, y no hay ranking", () => {
    const segmentos = workerComparison({
      jobs: [
        trabajo({ id: "a", assigneeId: "ana", planId: "premium" }),
        trabajo({ id: "b", assigneeId: "ana", planId: "basico" }),
        trabajo({ id: "c", assigneeId: "luis", planId: "premium" }),
      ],
      calendar: CALENDARIO,
      measuredAt: lunes(18),
    });

    // Tres segmentos, no una lista ordenada de personas: comparar en bruto
    // a quien lleva Premium con quien lleva Básico es lo que §55 prohíbe.
    expect(segmentos).toHaveLength(3);
    expect(segmentos.every((segmento) => segmento.jobs === 1)).toBe(true);
    expect(segmentos.map((segmento) => segmento.planId)).toEqual(["basico", "premium", "premium"]);
  });
});

describe("§93 · periodo, filtros y salidas", () => {
  it("RN-REP-05 · el periodo por omisión es el último mes natural CERRADO, en la zona del espacio", () => {
    // 1 de enero en Madrid son las 23:00 UTC del 31 de diciembre: sin la
    // zona, el periodo por omisión sería el de noviembre.
    expect(defaultReportPeriod(new Date("2026-01-01T00:30:00+01:00"), "Europe/Madrid")).toEqual({
      start: "2025-12-01",
      end: "2025-12-31",
    });
    expect(defaultReportPeriod(new Date("2026-03-15T10:00:00Z"), "Europe/Madrid")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });

  it("los ocho filtros de §93 se guardan y se vuelven a leer tal cual", () => {
    const filtros = {
      period: { start: "2026-08-01", end: "2026-08-31" },
      establishmentIds: ["est-1"],
      groupIds: ["grupo-1"],
      planIds: ["plan-1"],
      workerIds: ["ana"],
      changeCategories: ["medium"] as const,
      states: ["published"],
      serviceIds: ["servicio-1"],
    };

    expect(parseFilters(serializeFilters(filtros), filtros.period)).toEqual(filtros);
  });

  it("una categoría inventada no entra por el filtro", () => {
    const leidos = parseFilters(
      { period_start: "2026-08-01", period_end: "2026-08-31", change_categories: ["enorme", "medium"] },
      { start: "2026-08-01", end: "2026-08-31" },
    );
    expect(leidos.changeCategories).toEqual(["medium"]);
  });

  it("RN-REP-06 · el CSV lleva solo las secciones incluidas, con su clave y su fecha", () => {
    const snapshot: ReportSnapshot = {
      category: "operation",
      period: { start: "2026-08-01", end: "2026-08-31" },
      generatedAt: "2026-09-01T08:00:00Z",
      sections: [
        { key: "operation", position: 1, included: true },
        { key: "digital", position: 2, included: false },
      ],
      figures: [
        { section: "operation", metric: "jobs_completed", value: 10 },
        { section: "operation", metric: "start_compliance", value: null, noDataReason: "no_data_yet" },
        { section: "digital", metric: "sessions", value: 3 },
      ],
      opportunities: [],
      notes: {},
    };

    const csv = reportCsv(snapshot);
    const lineas = csv.split("\r\n");

    expect(lineas[0]).toBe("section,metric,dimension,value,unit,at,no_data_reason");
    expect(lineas[1]).toBe("operation,jobs_completed,,10,,,");
    expect(lineas[2]).toBe("operation,start_compliance,,,,,no_data_yet");
    // La sección apagada no viaja: el CSV es lo que el informe dice.
    expect(csv).not.toContain("sessions");
  });

  it("el CSV entrecomilla lo que lleva coma o comilla, en vez de partir la fila", () => {
    const snapshot: ReportSnapshot = {
      category: "digital",
      period: { start: "2026-08-01", end: "2026-08-31" },
      generatedAt: "2026-09-01T08:00:00Z",
      sections: [{ key: "digital", position: 1, included: true }],
      figures: [
        { section: "digital", metric: "clicks", value: 12, dimension: 'menú, del "día"' },
      ],
      opportunities: [],
      notes: {},
    };

    expect(reportCsv(snapshot)).toContain('"menú, del ""día"""');
  });
});

describe("§95.5 · seleccionar, editar y ordenar", () => {
  it("reordenar reescribe las posiciones de 1 a n, sin huecos ni empates", () => {
    const secciones = defaultSections("finance");
    const nuevo = reorderSections(secciones, ["annexes", "finance"]);

    expect(nuevo[0].key).toBe("annexes");
    expect(nuevo[1].key).toBe("finance");
    expect(nuevo.map((section) => section.position)).toEqual(
      Array.from({ length: secciones.length }, (_, index) => index + 1),
    );
  });

  it("una clave que no existe se ignora en vez de colarse", () => {
    const secciones = defaultSections("finance");
    // `marketing` no es una sección: se cae, y las que sí lo son se
    // colocan en el orden pedido.
    const nuevo = reorderSections(secciones, ["marketing" as never, "digital", "finance"]);

    expect(nuevo.map((section) => section.key)).not.toContain("marketing");
    expect(nuevo[0].key).toBe("digital");
    expect(nuevo[1].key).toBe("finance");
  });

  it("ordenar no cambia qué entra: son dos decisiones distintas", () => {
    const secciones = defaultSections("operation");
    const nuevo = orderedSections(reorderSections(secciones, ["annexes"]));
    expect(nuevo.filter((section) => section.included).length).toBe(
      secciones.filter((section) => section.included).length,
    );
  });
});

describe("RN-REP-17 · la comparación con el periodo anterior", () => {
  it("RN-REP-17 · un mes se compara con el mes anterior entero", () => {
    expect(previousPeriod({ start: "2026-09-01", end: "2026-09-30" })).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    });
  });

  it("RN-REP-17 · un periodo de 14 días se compara con los 14 días pegados a él, no con un mes", () => {
    // El equipo elige las fechas del informe, así que no vale "el mes
    // anterior": 14 días contra 31 daría una caída del 55 % inventada.
    const anterior = previousPeriod({ start: "2026-09-15", end: "2026-09-28" });

    expect(anterior).toEqual({ start: "2026-09-01", end: "2026-09-14" });
  });

  it("RN-REP-17 · un mes natural se compara con el mes natural anterior aunque tenga otros días", () => {
    // Marzo tiene 31 y febrero de 2026 tiene 28. Se comparan igualmente:
    // lo que el restaurante lee es "febrero", y recortar marzo para que
    // cuadre el tamaño sería llamar febrero a algo que no lo es.
    expect(previousPeriod({ start: "2026-03-01", end: "2026-03-31" })).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });

  it("RN-REP-17 · enero se compara con diciembre del año anterior", () => {
    expect(previousPeriod({ start: "2026-01-01", end: "2026-01-31" })).toEqual({
      start: "2025-12-01",
      end: "2025-12-31",
    });
  });

  it("RN-REP-17 · un periodo que empieza el día 1 pero no acaba el mes NO es un mes natural", () => {
    // Del 1 al 20 de septiembre son 20 días: se comparan con los 20
    // anteriores, no con agosto entero.
    expect(previousPeriod({ start: "2026-09-01", end: "2026-09-20" })).toEqual({
      start: "2026-08-12",
      end: "2026-08-31",
    });
  });

  it("RN-REP-17 · un solo día se compara con el día de antes", () => {
    expect(previousPeriod({ start: "2026-01-01", end: "2026-01-01" })).toEqual({
      start: "2025-12-31",
      end: "2025-12-31",
    });
  });

  it("RN-REP-17 · cada cifra se empareja con la suya por sección, métrica y dimensión", () => {
    const ahora = [
      { section: "digital" as const, metric: "sessions", value: 120, dimension: "mobile" },
      { section: "digital" as const, metric: "sessions", value: 80, dimension: "desktop" },
    ];
    const antes = [
      { section: "digital" as const, metric: "sessions", value: 30, dimension: "desktop" },
      { section: "digital" as const, metric: "sessions", value: 100, dimension: "mobile" },
    ];

    const pegadas = withPreviousFigures(ahora, antes);

    // Sin la dimensión, "móvil" se compararía con "escritorio" y el
    // porcentaje sería inventado.
    expect(pegadas[0].previous).toBe(100);
    expect(pegadas[1].previous).toBe(30);
  });

  it("RN-REP-17 · una cifra sin periodo anterior sale con `previous` a null, nunca con un 0 inventado", () => {
    const pegadas = withPreviousFigures(
      [{ section: "operation" as const, metric: "jobs_completed", value: 10 }],
      [],
    );

    // CLAUDE.md · no se inventa dato. Un 0 diría "el mes pasado no se hizo
    // nada", que es otra cosa que "no hay con qué comparar".
    expect(pegadas[0].previous).toBeNull();
    expect(pegadas[0].value).toBe(10);
  });

  it("RN-REP-17 · un cero del periodo anterior es un dato y se conserva", () => {
    const pegadas = withPreviousFigures(
      [{ section: "operation" as const, metric: "jobs_completed", value: 10 }],
      [{ section: "operation" as const, metric: "jobs_completed", value: 0 }],
    );

    expect(pegadas[0].previous).toBe(0);
  });

  it("RN-REP-17 · una cifra que solo existe en el periodo anterior no se añade al informe", () => {
    const pegadas = withPreviousFigures(
      [{ section: "operation" as const, metric: "jobs_completed", value: 10 }],
      [
        { section: "operation" as const, metric: "jobs_completed", value: 4 },
        { section: "digital" as const, metric: "sessions", value: 900 },
      ],
    );

    // El informe cuenta ESTE periodo: una fila con solo pasado sería una
    // cifra fantasma que el restaurante no puede situar.
    expect(pegadas).toHaveLength(1);
    expect(pegadas.some((figure) => figure.metric === "sessions")).toBe(false);
  });

  it("RN-REP-17 · una cifra sin dato ahora conserva el dato de antes, que es justo lo que explica el hueco", () => {
    const pegadas = withPreviousFigures(
      [{ section: "digital" as const, metric: "sessions", value: null, noDataReason: "not_connected" }],
      [{ section: "digital" as const, metric: "sessions", value: 900 }],
    );

    expect(pegadas[0].value).toBeNull();
    expect(pegadas[0].previous).toBe(900);
    expect(pegadas[0].noDataReason).toBe("not_connected");
  });
});

describe("RN-REP-15 y RN-REP-19 · el nivel y \"Lo esencial\"", () => {
  function version(overrides: Partial<ReportSnapshot> = {}): ReportSnapshot {
    return {
      category: "operation",
      period: { start: "2026-08-01", end: "2026-08-31" },
      generatedAt: "2026-09-01T08:00:00Z",
      sections: [
        { key: "operation", position: 1, included: true },
        { key: "digital", position: 2, included: true },
        { key: "finance", position: 3, included: true },
      ],
      figures: [],
      opportunities: [],
      notes: {},
      ...overrides,
    };
  }

  it("RN-REP-15 · Básico no compara, Impulso compara Lo esencial y de Impulso+ en adelante compara todo", () => {
    expect(reportLevelComparison("basic")).toBe("none");
    expect(reportLevelComparison("standard")).toBe("headline");
    expect(reportLevelComparison("standard_plus")).toBe("all");
    expect(reportLevelComparison("advanced")).toBe("all");
    expect(reportLevelComparison("complete")).toBe("all");
  });

  it("RN-REP-15 · con varios planes vivos manda el nivel más alto, y sin ninguno es `basic`", () => {
    expect(highestReportLevel(["standard", "complete", "basic"])).toBe("complete");
    expect(highestReportLevel([])).toBe("basic");
  });

  it("RN-REP-19 · Lo esencial son como mucho tres tarjetas, en el orden de la lista", () => {
    const snapshot = version({
      figures: [
        { section: "finance", metric: "income_total", value: 48279, unit: "cents" },
        { section: "operation", metric: "start_compliance", value: 100, unit: "percent" },
        { section: "digital", metric: "sessions", value: 5921, dimension: "ga4" },
        { section: "operation", metric: "jobs_completed", value: 12 },
      ],
    });

    expect(headlineFigures(snapshot).map((figura) => figura.metric)).toEqual([
      "jobs_completed",
      "sessions",
      "start_compliance",
    ]);
  });

  it("RN-REP-19 · una cifra sin dato NO ocupa tarjeta: el hueco no se rellena", () => {
    const snapshot = version({
      figures: [
        { section: "operation", metric: "jobs_completed", value: 12 },
        { section: "digital", metric: "sessions", value: null, dimension: "ga4", noDataReason: "not_connected" },
        { section: "operation", metric: "start_compliance", value: 100, unit: "percent" },
      ],
    });

    // CLAUDE.md · "si no hay dato, se dice cuál es el motivo". En una
    // tarjeta de portada no cabe el motivo, así que la tarjeta no está.
    expect(headlineFigures(snapshot).map((figura) => figura.metric)).toEqual([
      "jobs_completed",
      "start_compliance",
    ]);
  });

  it("RN-REP-19 · una cifra de una sección que el equipo apagó no sube a la portada", () => {
    const snapshot = version({
      sections: [
        { key: "operation", position: 1, included: true },
        { key: "digital", position: 2, included: false },
      ],
      figures: [
        { section: "operation", metric: "jobs_completed", value: 12 },
        // Está en la versión porque la decisión 29 lo manda, pero el
        // informe no lleva esa sección: no puede abrirlo.
        { section: "digital", metric: "sessions", value: 5921, dimension: "ga4" },
      ],
    });

    expect(headlineFigures(snapshot).map((figura) => figura.metric)).toEqual(["jobs_completed"]);
  });

  it("RN-REP-19 · las visitas de la portada son las de Analytics, no la primera fuente que aparezca", () => {
    const snapshot = version({
      figures: [
        { section: "digital", metric: "sessions", value: 88, dimension: "clarity" },
        { section: "digital", metric: "sessions", value: 5921, dimension: "ga4" },
      ],
    });

    expect(headlineFigures(snapshot)[0].value).toBe(5921);
  });

  it("RN-REP-19 · no hay tarjeta de reservas, porque las reservas no se monitorizan", () => {
    const snapshot = version({
      figures: [{ section: "digital", metric: "reservation_clicks", value: 247, dimension: "ga4" }],
    });

    expect(headlineFigures(snapshot)).toEqual([]);
  });

  it("RN-REP-15 · con alcance `headline`, una cifra que no es de portada sale SIN comparación", () => {
    const pegadas = withPreviousFigures(
      [
        { section: "operation", metric: "jobs_completed", value: 12 },
        { section: "operation", metric: "jobs_blocked", value: 2 },
      ],
      [
        { section: "operation", metric: "jobs_completed", value: 10 },
        { section: "operation", metric: "jobs_blocked", value: 5 },
      ],
      "headline",
    );

    expect(pegadas[0].previous).toBe(10);
    // Sin comparación no es lo mismo que comparación vacía: `undefined` no
    // se pinta, `null` dice "sin periodo anterior".
    expect(pegadas[1].previous).toBeUndefined();
  });

  it("RN-REP-15 · con alcance `none` no se pega nada, ni siquiera un null", () => {
    const pegadas = withPreviousFigures(
      [{ section: "operation", metric: "jobs_completed", value: 12 }],
      [{ section: "operation", metric: "jobs_completed", value: 10 }],
      "none",
    );

    expect(pegadas[0].previous).toBeUndefined();
  });
});

describe("RN-REP-17 · cómo se dice la variación", () => {
  const base = { section: "operation" as const, metric: "jobs_completed" };

  it("RN-REP-17 · sin comparación pedida no se dice nada", () => {
    expect(figureChange({ ...base, value: 12 })).toEqual({ kind: "none" });
  });

  it("RN-REP-17 · una cifra sin dato no lleva variación: ya dice su motivo", () => {
    expect(figureChange({ ...base, value: null, noDataReason: "not_connected", previous: 10 })).toEqual({
      kind: "none",
    });
  });

  it("RN-REP-17 · sin cifra en el periodo anterior se dice eso, no un 0 %", () => {
    expect(figureChange({ ...base, value: 12, previous: null })).toEqual({ kind: "no_previous" });
  });

  it("RN-REP-17 · el mismo número no es +0 %: es que no cambió", () => {
    expect(figureChange({ ...base, value: 12, previous: 12 })).toEqual({ kind: "flat" });
  });

  it("RN-REP-17 · venir de cero no es un porcentaje infinito", () => {
    expect(figureChange({ ...base, value: 12, previous: 0 })).toEqual({ kind: "from_zero", value: 12 });
  });

  it("RN-REP-17 · la variación va redondeada a entero, en los dos sentidos", () => {
    expect(figureChange({ ...base, value: 5921, previous: 5018 })).toEqual({ kind: "percent", percent: 18 });
    expect(figureChange({ ...base, value: 8, previous: 10 })).toEqual({ kind: "percent", percent: -20 });
  });
});

// ---------------------------------------------------------------------
// Lo que añade Premium+ (RN-REP-21 a 26, decisión 60)
// ---------------------------------------------------------------------

describe("RN-REP-21 · los tiempos de cada cambio, uno a uno", () => {
  const calendario = contractualCalendar("Europe/Madrid", []);

  it("RN-REP-21 · mide el arranque desde que se ACEPTÓ, no desde que se creó el trabajo", () => {
    const [fila] = changeTimings(
      [
        {
          jobId: "j1",
          requestCode: "SOL-1",
          category: "small",
          // Aceptada el lunes a las 9:00; arrancada el lunes a las 12:00.
          requestAcceptedAt: new Date("2026-09-07T07:00:00Z"),
          startedAt: new Date("2026-09-07T10:00:00Z"),
          completedAt: new Date("2026-09-07T14:00:00Z"),
          startSlaHours: 24,
        },
      ],
      [],
      calendario,
      new Date("2026-09-30T10:00:00Z"),
    );

    expect(fila.code).toBe("SOL-1");
    expect(fila.startMinutes).toBe(180);
    expect(fila.startedWithinSla).toBe(true);
    expect(fila.pending).toBeNull();
  });

  it("RN-REP-21 · un cambio sin aceptar dice 'en análisis' y uno aceptado sin arrancar, 'pendiente de empezar'", () => {
    const filas = changeTimings(
      [
        {
          jobId: "j1", requestCode: "SOL-1", category: "small",
          requestAcceptedAt: null, startedAt: null, completedAt: null, startSlaHours: 24,
        },
        {
          jobId: "j2", requestCode: "SOL-2", category: "medium",
          requestAcceptedAt: new Date("2026-09-07T07:00:00Z"),
          startedAt: null, completedAt: null, startSlaHours: 24,
        },
      ],
      [],
      calendario,
      new Date("2026-09-30T10:00:00Z"),
    );

    expect(filas[0].pending).toBe("in_analysis");
    expect(filas[1].pending).toBe("not_started");
    // Y ninguno inventa un cero, que se leería como "instantáneo".
    expect(filas[0].startMinutes).toBeNull();
    expect(filas[1].startMinutes).toBeNull();
  });

  it("RN-REP-21 · un bloqueo todavía abierto cuenta hasta hoy, no cero ni infinito", () => {
    const [fila] = changeTimings(
      [
        {
          jobId: "j1", requestCode: "SOL-1", category: "small",
          requestAcceptedAt: new Date("2026-09-07T07:00:00Z"),
          startedAt: new Date("2026-09-07T07:00:00Z"),
          completedAt: null, startSlaHours: 24,
        },
      ],
      [{ jobId: "j1", startedAt: new Date("2026-09-07T08:00:00Z"), endedAt: null, reason: "client_information" }],
      calendario,
      new Date("2026-09-07T11:00:00Z"),
    );

    expect(fila.blockedMinutes).toBe(180);
    expect(fila.blockReasons).toEqual(["client_information"]);
  });

  it("RN-REP-21, P7 · un trabajo sin código de solicitud no sale: el restaurante no conoce el código del trabajo", () => {
    const filas = changeTimings(
      [
        {
          jobId: "j1", requestCode: null, category: "small",
          requestAcceptedAt: new Date("2026-09-07T07:00:00Z"),
          startedAt: new Date("2026-09-07T10:00:00Z"),
          completedAt: null, startSlaHours: 24,
        },
      ],
      [],
      calendario,
      new Date("2026-09-30T10:00:00Z"),
    );

    expect(filas).toHaveLength(0);
  });
});

describe("RN-REP-22 · la evolución dentro del mes", () => {
  it("RN-REP-22 · parte el mes en bloques de 7 días y marca el resto como parcial", () => {
    const bloques = weekBuckets({ start: "2026-08-01", end: "2026-08-31" });

    expect(bloques).toHaveLength(5);
    expect(bloques[0]).toEqual({ from: "2026-08-01", to: "2026-08-07", partial: false });
    expect(bloques[3]).toEqual({ from: "2026-08-22", to: "2026-08-28", partial: false });
    // Los 3 días que sobran de un mes de 31: se dibujan, pero marcados.
    expect(bloques[4]).toEqual({ from: "2026-08-29", to: "2026-08-31", partial: true });
  });

  it("RN-REP-22 · un mes de 28 días sale en cuatro bloques enteros, sin resto", () => {
    const bloques = weekBuckets({ start: "2026-02-01", end: "2026-02-28" });
    expect(bloques).toHaveLength(4);
    expect(bloques.every((b) => !b.partial)).toBe(true);
  });

  it("RN-REP-22 · lo que se suma se suma y lo que es proporción se promedia", () => {
    const bloques = weekBuckets({ start: "2026-08-01", end: "2026-08-14" });
    const puntos = [
      { metric: "clicks", dimension: "", periodStart: "2026-08-01", value: 10 },
      { metric: "clicks", dimension: "", periodStart: "2026-08-02", value: 20 },
      { metric: "position", dimension: "", periodStart: "2026-08-01", value: 10 },
      { metric: "position", dimension: "", periodStart: "2026-08-02", value: 20 },
    ];

    expect(weeklySeries("search_console", "clicks", "sum", puntos, bloques).values[0]).toBe(30);
    // Sumar cuatro posiciones medias daría 30, que no significa nada.
    expect(weeklySeries("search_console", "position", "mean", puntos, bloques).values[0]).toBe(15);
    // Y un bloque sin datos NO es cero: es que no hay dato.
    expect(weeklySeries("search_console", "clicks", "sum", puntos, bloques).values[1]).toBeNull();
  });

  it("RN-REP-22 · los desgloses por dimensión no entran en la serie", () => {
    const bloques = weekBuckets({ start: "2026-08-01", end: "2026-08-07" });
    const serie = weeklySeries(
      "search_console",
      "clicks",
      "sum",
      [
        { metric: "clicks", dimension: "", periodStart: "2026-08-01", value: 10 },
        { metric: "clicks", dimension: "menu del dia", periodStart: "2026-08-01", value: 500 },
      ],
      bloques,
    );

    expect(serie.values[0]).toBe(10);
  });
});

describe("RN-REP-23 · la comparación con el mismo mes del año anterior", () => {
  it("RN-REP-23 · un mes natural completo se compara con el mes completo del año anterior", () => {
    expect(sameMonthLastYear({ start: "2026-09-01", end: "2026-09-30" })).toEqual({
      start: "2025-09-01",
      end: "2025-09-30",
    });
  });

  it("RN-REP-23 · febrero contra febrero conserva sus días, no se recorta", () => {
    // 2024 es bisiesto: febrero de 2025 tiene 28 y no se le quita ninguno
    // al de 2024 ni se le añade ninguno al de 2025.
    expect(sameMonthLastYear({ start: "2025-02-01", end: "2025-02-28" })).toEqual({
      start: "2024-02-01",
      end: "2024-02-29",
    });
  });

  it("RN-REP-23 · un 29 de febrero cae al 28 del año anterior, no a un día de la semana distinto", () => {
    expect(sameMonthLastYear({ start: "2024-02-10", end: "2024-02-29" })).toEqual({
      start: "2023-02-10",
      end: "2023-02-28",
    });
  });
});

describe("RN-REP-24 · qué pasó con las oportunidades del informe anterior", () => {
  it("RN-REP-24 · los ocho estados se leen en cuatro, y lo desconocido sigue abierto", () => {
    expect(opportunityFollowUp("implemented")).toBe("done");
    expect(opportunityFollowUp("in_progress")).toBe("in_progress");
    expect(opportunityFollowUp("approved_for_report")).toBe("open");
    expect(opportunityFollowUp("detected")).toBe("open");
    expect(opportunityFollowUp("discarded")).toBe("no_longer");
    expect(opportunityFollowUp("no_longer_applicable")).toBe("no_longer");
    // Un estado que no conocemos NO desaparece del seguimiento.
    expect(opportunityFollowUp("lo_que_venga_manana")).toBe("open");
  });
});

describe("RN-REP-25 · el efecto de cada cambio publicado", () => {
  const metricas = [{ provider: "ga4", metric: "sessions" }];

  function puntos(desde: string, hasta: string, valor: number) {
    const lista = [];
    let dia = desde;
    while (dia <= hasta) {
      lista.push({ metric: "sessions", dimension: "", periodStart: dia, value: valor });
      const fecha = new Date(`${dia}T00:00:00Z`);
      fecha.setUTCDate(fecha.getUTCDate() + 1);
      dia = fecha.toISOString().slice(0, 10);
    }
    return lista;
  }

  it("RN-REP-25 · compara los 14 días de antes con los 14 de después, sin el día de la publicación", () => {
    const mapa = new Map([
      ["ga4", [...puntos("2026-08-18", "2026-08-31", 10), ...puntos("2026-09-01", "2026-09-15", 20)]],
    ]);

    const [efecto] = changeEffects(
      [{ code: "SOL-1", publishedOn: "2026-09-01" }],
      metricas,
      mapa,
      "2026-09-30",
    );

    // 14 días a 10 antes; 14 días a 20 después. El día 1 no entra en ninguna.
    expect(efecto.figures[0]).toEqual({ provider: "ga4", metric: "sessions", before: 140, after: 280 });
    expect(efecto.reason).toBeNull();
  });

  it("RN-REP-25 · si los 14 días de después no han pasado, no se mide media ventana: se dice", () => {
    const mapa = new Map([["ga4", puntos("2026-09-01", "2026-09-30", 10)]]);

    const [efecto] = changeEffects(
      [{ code: "SOL-1", publishedOn: "2026-09-25" }],
      metricas,
      mapa,
      "2026-09-30",
    );

    expect(efecto.reason).toBe("incomplete_window");
    expect(efecto.figures).toHaveLength(0);
  });

  it("RN-REP-25 · sin datos en una de las dos mitades no se pinta número", () => {
    // Solo hay datos después: comparar 14 días contra nada daría una
    // subida infinita que solo mide que faltan datos.
    const mapa = new Map([["ga4", puntos("2026-09-02", "2026-09-15", 20)]]);

    const [efecto] = changeEffects(
      [{ code: "SOL-1", publishedOn: "2026-09-01" }],
      metricas,
      mapa,
      "2026-09-30",
    );

    expect(efecto.reason).toBe("no_data");
  });

  it("RN-REP-25 · otro cambio dentro de la ventana se dice, porque si no se atribuye a uno lo que hicieron dos", () => {
    const mapa = new Map([
      ["ga4", [...puntos("2026-08-18", "2026-08-31", 10), ...puntos("2026-09-01", "2026-09-20", 20)]],
    ]);

    const [primero] = changeEffects(
      [
        { code: "SOL-1", publishedOn: "2026-09-01" },
        { code: "SOL-2", publishedOn: "2026-09-06" },
      ],
      metricas,
      mapa,
      "2026-09-30",
    );

    expect(primero.overlapping).toEqual(["SOL-2"]);
  });
});

describe("RN-REP-26 · el aprovechamiento del plan", () => {
  const ciclo = (start: string, end: string) => ({
    cycleStart: start,
    cycleEnd: end,
    included: { small: 5, photo: 3, medium: 1, large: 0 } as const,
  });

  it("RN-REP-26 · cuenta ciclo a ciclo y NO acumula lo que sobró de un mes al siguiente", () => {
    const lineas = planUsage(
      [ciclo("2026-07-01", "2026-07-31"), ciclo("2026-08-01", "2026-08-31")],
      [
        // Julio: 1 de 5. Agosto: 5 de 5.
        { category: "small", amount: -1, at: "2026-07-10" },
        { category: "small", amount: -5, at: "2026-08-10" },
      ],
      "2026-09-15",
    );

    const pequenos = lineas.find((l) => l.category === "small")!;
    expect(pequenos.included).toBe(10);
    expect(pequenos.used).toBe(6);
    // Cuatro sin usar en julio, ninguno en agosto. Si se acumulara, la
    // cuenta daría 4 igual — por eso el caso de abajo, que sí los separa.
    expect(pequenos.unused).toBe(4);
  });

  it("RN-REP-26 · un ciclo en el que se gastó de más no compensa a otro en el que sobró", () => {
    const lineas = planUsage(
      [ciclo("2026-07-01", "2026-07-31"), ciclo("2026-08-01", "2026-08-31")],
      [
        { category: "small", amount: -8, at: "2026-07-10" },
        { category: "small", amount: -2, at: "2026-08-10" },
      ],
      "2026-09-15",
    );

    const pequenos = lineas.find((l) => l.category === "small")!;
    // Julio se pasó (8 de 5) y agosto dejó 3 sin usar. Un saldo acumulado
    // diría 0 sin usar; la verdad es que hay 3 pagados y no gastados.
    expect(pequenos.unused).toBe(3);
  });

  it("RN-REP-26 · el ciclo en curso no cuenta, y sin ciclos cerrados no hay sección", () => {
    expect(planUsage([ciclo("2026-09-01", "2026-09-30")], [], "2026-09-15")).toHaveLength(0);
  });
});

describe("RN-REP-23 · pegar la cifra de hace un año", () => {
  const cifra = (metric: string, value: number | null) => ({
    section: "digital" as const, metric, value,
  });

  it("RN-REP-23 · una cifra sin dato de hace un año sale con null, no con cero", () => {
    const [visitas, nuevas] = withYearAgoFigures(
      [cifra("sessions", 100), cifra("bookings", 5)],
      [cifra("sessions", 80)],
    );

    expect(visitas.yearAgo).toBe(80);
    // Sin dato hace un año NO es un cero: sería decir que no hubo ninguna.
    expect(nuevas.yearAgo).toBeNull();
  });

  it("RN-REP-23 · una cifra que solo existía hace un año no se añade: sería una fila fantasma", () => {
    const filas = withYearAgoFigures([cifra("sessions", 100)], [cifra("sessions", 80), cifra("vieja", 3)]);
    expect(filas).toHaveLength(1);
  });
});
