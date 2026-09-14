import { describe, expect, it } from "vitest";

import { contractualCalendar } from "./business-clock";
import {
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
  parseFilters,
  reorderSections,
  reportCsv,
  reportIsVisibleToClient,
  reportTransitionAllowed,
  scheduleReminderDue,
  sectionRequiresJudgement,
  sendGate,
  sendIsDue,
  serializeFilters,
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

  it("las secciones son las cinco de la maqueta más Finanzas", () => {
    expect([...REPORT_SECTION_KEYS]).toEqual([
      "executive_summary",
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

  it("el borrador nace con el resumen, su familia y los anexos; las oportunidades nunca", () => {
    // Requerir criterio NO es entrar apagada: la maqueta dibuja el resumen
    // ejecutivo marcado y las oportunidades sin marcar (§99: "Incluir en
    // informe" se vuelve a decidir).
    const operacion = defaultSections("operation");
    const incluidas = operacion.filter((section) => section.included).map((section) => section.key);
    expect(incluidas).toEqual(["executive_summary", "operation", "annexes"]);

    const finanzas = defaultSections("finance").filter((s) => s.included).map((s) => s.key);
    expect(finanzas).toEqual(["executive_summary", "finance", "annexes"]);

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
