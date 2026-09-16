/**
 * Las nueve reglas del Hito 15 (PRD §28, RN-OPP; §96 a §101 de la
 * maestra), con los umbrales de la decisión 26 de `docs/DECISIONES.md`.
 *
 * Cada umbral se vuelve a escribir aquí a mano, uno a uno: si alguien
 * cambia un número en `opportunities.ts` sin pasar antes por la decisión,
 * esta suite se pone roja y dice cuál. Son los números que CLAUDE.md
 * prohibía inventar hasta que Bosco los fijó.
 */
import { describe, expect, it } from "vitest";

import type { MetricPoint, SyncWindow } from "./integrations";
import {
  CLIENT_OPPORTUNITY_ACTIONS,
  OPPORTUNITY_RULES,
  OPPORTUNITY_STATES,
  OPPORTUNITY_THRESHOLDS,
  RULE_CATEGORY,
  RULE_EFFORT,
  RULE_PROVIDERS,
  type DetectionInput,
  type OpportunityDetection,
  canTransition,
  describeEffort,
  detectOpportunities,
  planOpportunityAccess,
  planSees,
  reopensAfterDiscard,
  ruleScope,
  visibleToClient,
} from "./opportunities";

const VENTANA: SyncWindow = { from: "2026-08-17", to: "2026-09-13" };
const ANTERIOR: SyncWindow = { from: "2026-07-20", to: "2026-08-16" };

/** Un punto por día de la ventana, con el mismo valor: el total es value * días. */
function dias(metric: string, value: number, w: SyncWindow, dimension = "", unit: string | null = null): MetricPoint[] {
  const puntos: MetricPoint[] = [];
  const d = new Date(`${w.from}T00:00:00Z`);
  const fin = new Date(`${w.to}T00:00:00Z`);
  while (d <= fin) {
    const day = d.toISOString().slice(0, 10);
    puntos.push({ metric, dimension, period_start: day, period_end: day, value, unit });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return puntos;
}

function entrada(partial: Partial<DetectionInput>): DetectionInput {
  return {
    window: VENTANA,
    previousWindow: ANTERIOR,
    points: {},
    liveProviders: ["ga4", "search_console", "business_profile", "clarity", "pagespeed"],
    ...partial,
  };
}

function reglas(detecciones: readonly OpportunityDetection[]): string[] {
  return detecciones.map((d) => d.rule);
}

describe("RN-OPP-02 · los nueve umbrales son los de la decisión 26, ni uno más", () => {
  it("los números, uno a uno", () => {
    expect(OPPORTUNITY_THRESHOLDS).toEqual({
      trafficDropPercent: 30,
      trafficDropPreviousSessions: 100,
      trafficDropHighImpactPercent: 50,
      lowCtrImpressions: 100,
      lowCtrPosition: 10,
      lowCtrPercent: 2,
      positionLossImpressions: 50,
      positionLossPlaces: 3,
      positionLossWorseThan: 10,
      slownessScore: 50,
      slownessLcpMs: 4000,
      slownessMeasurements: 2,
      heavyImagesSavingsKb: 500,
      technicalErrorPercent: 5,
      technicalErrorSessions: 100,
      lowMobileConversionRatio: 0.5,
      lowMobileConversionSessions: 100,
      queriesWithoutContentImpressions: 100,
      queriesWithoutContentPosition: 20,
      lowButtonUseImpressions: 500,
      lowButtonUseActionsPercent: 2,
      frictionClicksPercent: 5,
      frictionSessions: 100,
    });
  });

  it("las nueve reglas de §96, cada una con su fuente, su categoría y su esfuerzo", () => {
    expect(OPPORTUNITY_RULES).toHaveLength(9);
    for (const rule of OPPORTUNITY_RULES) {
      expect(RULE_PROVIDERS[rule].length).toBeGreaterThan(0);
      expect(RULE_CATEGORY[rule]).toBeTruthy();
      expect(RULE_EFFORT[rule]).toBeTruthy();
    }
  });
});

describe("RN-OPP-02 · 1 · descenso de tráfico (GA4)", () => {
  const conSesiones = (actual: number, anterior: number) =>
    entrada({
      points: { ga4: [...dias("sessions", actual, VENTANA), ...dias("sessions", anterior, ANTERIOR)] },
    });

  it("salta con una caída del 30 % o más y 100 sesiones o más en el periodo anterior", () => {
    // 28 días × 5 = 140 antes; 28 × 3 = 84 ahora: una caída del 40 %.
    const salida = detectOpportunities(conSesiones(3, 5));
    expect(reglas(salida)).toContain("traffic_drop");
    expect(salida[0].measurements).toEqual([
      { provider: "ga4", metric: "sessions", dimension: "", value: 84, previous: 140, unit: "count" },
    ]);
  });

  it("una caída menor del 30 % no salta", () => {
    // 140 → 112: un 20 %.
    expect(reglas(detectOpportunities(conSesiones(4, 5)))).not.toContain("traffic_drop");
  });

  it("sin 100 sesiones antes no hay descenso: hay pocas visitas (suelo de ruido)", () => {
    // 28 × 3 = 84 antes, por debajo del suelo, aunque caiga a cero.
    expect(reglas(detectOpportunities(conSesiones(0, 3)))).not.toContain("traffic_drop");
  });

  it("caer más de la mitad del tráfico es impacto alto; menos, medio (decisión 26a)", () => {
    const fuerte = detectOpportunities(conSesiones(2, 5)).find((d) => d.rule === "traffic_drop");
    const leve = detectOpportunities(conSesiones(3, 5)).find((d) => d.rule === "traffic_drop");
    expect(fuerte?.impact).toBe("high");
    expect(leve?.impact).toBe("medium");
  });

  it("con GA4 desconectada, sin autorizar o con el dato viejo no salta nada (P6)", () => {
    const sinFuente = entrada({
      points: { ga4: [...dias("sessions", 3, VENTANA), ...dias("sessions", 5, ANTERIOR)] },
      liveProviders: [],
    });
    expect(detectOpportunities(sinFuente)).toEqual([]);
  });
});

describe("RN-OPP-02 · 2, 3 y 8 · las tres reglas por consulta (Search Console)", () => {
  /** Una consulta con sus tres cifras en una ventana. */
  function consulta(
    nombre: string,
    w: SyncWindow,
    impresionesPorDia: number,
    ctr: number,
    posicion: number,
  ): MetricPoint[] {
    return [
      ...dias("impressions_by_query", impresionesPorDia, w, nombre),
      ...dias("ctr_by_query", ctr, w, nombre, "ratio"),
      ...dias("position_by_query", posicion, w, nombre),
    ];
  }

  it("CTR bajo: 100 impresiones o más, posición 10 o mejor y CTR bajo el 2 %", () => {
    const salida = detectOpportunities(
      entrada({ points: { search_console: consulta("menú del día", VENTANA, 10, 0.01, 6) } }),
    );
    const detectada = salida.find((d) => d.rule === "low_ctr");
    expect(detectada?.subject).toBe("menú del día");
    expect(detectada?.impact).toBe("low");
  });

  it("CTR bajo no salta en la segunda página: ahí el problema es la posición, no el título", () => {
    const salida = detectOpportunities(
      entrada({ points: { search_console: consulta("menú del día", VENTANA, 10, 0.01, 14) } }),
    );
    expect(reglas(salida)).not.toContain("low_ctr");
  });

  it("CTR bajo no salta con un CTR del 2 % o más, ni con menos de 100 impresiones", () => {
    expect(
      reglas(detectOpportunities(entrada({ points: { search_console: consulta("x", VENTANA, 10, 0.03, 6) } }))),
    ).not.toContain("low_ctr");
    expect(
      reglas(detectOpportunities(entrada({ points: { search_console: consulta("x", VENTANA, 3, 0.001, 6) } }))),
    ).not.toContain("low_ctr");
  });

  it("pérdida de posición: empeora 3 puestos o más y acaba peor del 10", () => {
    const puntos = [
      ...consulta("arroz con bogavante", VENTANA, 5, 0.02, 14),
      ...consulta("arroz con bogavante", ANTERIOR, 5, 0.05, 8),
    ];
    const detectada = detectOpportunities(entrada({ points: { search_console: puntos } })).find(
      (d) => d.rule === "position_loss",
    );
    expect(detectada?.subject).toBe("arroz con bogavante");
    expect(detectada?.measurements[0]).toMatchObject({ value: 14, previous: 8, unit: "position" });
  });

  it("caer del 2 al 5 no saca a nadie de la primera página: no salta", () => {
    const puntos = [
      ...consulta("magariños", VENTANA, 5, 0.3, 5),
      ...consulta("magariños", ANTERIOR, 5, 0.4, 2),
    ];
    expect(reglas(detectOpportunities(entrada({ points: { search_console: puntos } })))).not.toContain(
      "position_loss",
    );
  });

  it("búsquedas que salen muy abajo: 100 impresiones o más en posición peor que 20", () => {
    const detectada = detectOpportunities(
      entrada({ points: { search_console: consulta("cena de empresa", VENTANA, 10, 0.001, 27) } }),
    ).find((d) => d.rule === "queries_without_content");
    expect(detectada?.subject).toBe("cena de empresa");
  });

  it("el CTR y la posición de la ventana se ponderan por impresiones, no se promedian a pelo", () => {
    // Dos días: uno con 1000 impresiones y posición 30, otro con 10 y
    // posición 3. La media simple daría 16,5 (no salta); la ponderada,
    // 29,7 (sí salta), que es lo que Search Console llama posición media.
    const puntos: MetricPoint[] = [
      { metric: "impressions_by_query", dimension: "q", period_start: "2026-09-12", period_end: "2026-09-12", value: 1000, unit: null },
      { metric: "position_by_query", dimension: "q", period_start: "2026-09-12", period_end: "2026-09-12", value: 30, unit: null },
      { metric: "impressions_by_query", dimension: "q", period_start: "2026-09-13", period_end: "2026-09-13", value: 10, unit: null },
      { metric: "position_by_query", dimension: "q", period_start: "2026-09-13", period_end: "2026-09-13", value: 3, unit: null },
    ];
    const detectada = detectOpportunities(entrada({ points: { search_console: puntos } })).find(
      (d) => d.rule === "queries_without_content",
    );
    expect(detectada).toBeDefined();
    expect(detectada?.measurements[0].value).toBeCloseTo(29.73, 1);
  });
});

describe("RN-OPP-02 · 4 y 5 · lentitud e imágenes pesadas (PageSpeed)", () => {
  function analisis(metric: string, valores: readonly number[], dimension = "mobile"): MetricPoint[] {
    return valores.map((value, i) => {
      const day = `2026-09-0${i + 1}`;
      return { metric, dimension, period_start: day, period_end: day, value, unit: null };
    });
  }

  it("lentitud: puntuación móvil bajo 50 en dos análisis seguidos", () => {
    const salida = detectOpportunities(
      entrada({ points: { pagespeed: analisis("performance_score_by_strategy", [38, 41]) } }),
    );
    expect(reglas(salida)).toContain("slowness");
  });

  it("un solo mal día no genera trabajo: hacen falta dos análisis seguidos", () => {
    const salida = detectOpportunities(
      entrada({ points: { pagespeed: analisis("performance_score_by_strategy", [72, 41]) } }),
    );
    expect(reglas(salida)).not.toContain("slowness");
    const unico = detectOpportunities(
      entrada({ points: { pagespeed: analisis("performance_score_by_strategy", [30]) } }),
    );
    expect(reglas(unico)).not.toContain("slowness");
  });

  it("lentitud también por LCP móvil sobre 4 s, aunque la puntuación aguante", () => {
    const salida = detectOpportunities(
      entrada({
        points: {
          pagespeed: [
            ...analisis("performance_score_by_strategy", [80, 78]),
            ...analisis("lcp_ms_by_strategy", [4200, 5100]),
          ],
        },
      }),
    );
    expect(reglas(salida)).toContain("slowness");
  });

  it("la lentitud del escritorio no dispara la regla: la decisión habla del móvil", () => {
    const salida = detectOpportunities(
      entrada({ points: { pagespeed: analisis("performance_score_by_strategy", [20, 25], "desktop") } }),
    );
    expect(reglas(salida)).not.toContain("slowness");
  });

  it("imágenes pesadas: 500 KB o más ahorrables en móvil, sin sumar dos veces los mismos bytes", () => {
    const salida = detectOpportunities(
      entrada({
        points: {
          pagespeed: [
            ...analisis("optimized_images_savings_kb_by_strategy", [520]),
            ...analisis("responsive_images_savings_kb_by_strategy", [300]),
          ],
        },
      }),
    );
    const detectada = salida.find((d) => d.rule === "heavy_images");
    expect(detectada?.severity).toBe(520);

    // 300 + 300 pasarían de 500 sumados, pero son las mismas imágenes
    // vistas de dos maneras: no salta.
    const sumadas = detectOpportunities(
      entrada({
        points: {
          pagespeed: [
            ...analisis("optimized_images_savings_kb_by_strategy", [300]),
            ...analisis("responsive_images_savings_kb_by_strategy", [300]),
          ],
        },
      }),
    );
    expect(reglas(sumadas)).not.toContain("heavy_images");
  });
});

describe("RN-OPP-02 · 6 y 9b · error técnico y fricción (Clarity)", () => {
  const clarity = (sesiones: number, errores: number, muertos = 0, rabia = 0) =>
    entrada({
      points: {
        clarity: [
          ...dias("sessions", sesiones, VENTANA),
          ...dias("script_errors", errores, VENTANA),
          ...dias("dead_clicks", muertos, VENTANA),
          ...dias("rage_clicks", rabia, VENTANA),
        ],
      },
    });

  it("error técnico: errores de script en el 5 % o más de las sesiones, con 100 sesiones o más", () => {
    const detectada = detectOpportunities(clarity(10, 1)).find((d) => d.rule === "technical_error");
    expect(detectada?.impact).toBe("high");
    expect(detectada?.severity).toBeCloseTo(10, 5);
  });

  it("por debajo del 5 %, o sin 100 sesiones, no salta", () => {
    expect(reglas(detectOpportunities(clarity(100, 1)))).not.toContain("technical_error");
    expect(reglas(detectOpportunities(clarity(3, 3)))).not.toContain("technical_error");
  });

  it("fricción: clics muertos o de rabia sobre el 5 % de las sesiones", () => {
    const detectada = detectOpportunities(clarity(10, 0, 1, 0)).find(
      (d) => d.rule === "low_button_use" && d.subject === "friction",
    );
    expect(detectada?.impact).toBe("medium");
  });
});

describe("RN-OPP-02 · 7 · baja conversión móvil (GA4)", () => {
  function ga4(sesionesMovil: number, conversionesMovil: number, sesionesEscritorio: number, conversionesEscritorio: number) {
    return entrada({
      points: {
        ga4: [
          ...dias("sessions_by_device", sesionesMovil, VENTANA, "mobile"),
          ...dias("conversions_by_device", conversionesMovil, VENTANA, "mobile"),
          ...dias("sessions_by_device", sesionesEscritorio, VENTANA, "desktop"),
          ...dias("conversions_by_device", conversionesEscritorio, VENTANA, "desktop"),
        ],
      },
    });
  }

  it("salta cuando el móvil convierte la mitad o menos que el escritorio, con 100 sesiones móviles o más", () => {
    // Móvil: 280 sesiones y 2,8 % de conversión. Escritorio: 10 %.
    const detectada = detectOpportunities(ga4(10, 0.28, 5, 0.5)).find((d) => d.rule === "low_mobile_conversion");
    expect(detectada?.impact).toBe("high");
    expect(detectada?.subject).toBe("mobile");
  });

  it("si el móvil convierte más de la mitad de lo que convierte el escritorio, no salta", () => {
    // Móvil 30 %, escritorio 40 %: peor, sí, pero no la mitad.
    expect(reglas(detectOpportunities(ga4(10, 3, 5, 2)))).not.toContain("low_mobile_conversion");
  });

  it("sin escritorio con el que comparar no hay regla: no es que el móvil vaya bien, es que no se sabe", () => {
    expect(reglas(detectOpportunities(ga4(10, 0, 0, 0)))).not.toContain("low_mobile_conversion");
  });

  it("con menos de 100 sesiones móviles no salta (suelo de ruido)", () => {
    expect(reglas(detectOpportunities(ga4(3, 0, 5, 1)))).not.toContain("low_mobile_conversion");
  });
});

describe("RN-OPP-02 · 9a · poco uso de los botones de la ficha (Business Profile)", () => {
  const ficha = (impresiones: number, web: number, llamadas: number, comoLlegar: number) =>
    entrada({
      points: {
        business_profile: [
          ...dias("profile_impressions", impresiones, VENTANA),
          ...dias("website_clicks", web, VENTANA),
          ...dias("call_clicks", llamadas, VENTANA),
          ...dias("direction_requests", comoLlegar, VENTANA),
        ],
      },
    });

  it("500 impresiones o más y acciones bajo el 2 %: la ven y no hacen nada", () => {
    const detectada = detectOpportunities(ficha(100, 0.5, 0.5, 0.5)).find((d) => d.rule === "low_button_use");
    expect(detectada?.subject).toBe("profile");
    expect(detectada?.impact).toBe("high");
  });

  it("con las acciones por encima del 2 % no salta", () => {
    expect(reglas(detectOpportunities(ficha(100, 2, 1, 1)))).not.toContain("low_button_use");
  });

  it("con menos de 500 impresiones no salta", () => {
    expect(reglas(detectOpportunities(ficha(10, 0, 0, 0)))).not.toContain("low_button_use");
  });
});

describe("RN-OPP-08 · básicas, avanzadas y qué deja ver cada plan (§101, decisión 26e)", () => {
  it("avanzada es la que cruza dos fuentes; hoy solo 'poco uso de botones'", () => {
    expect(ruleScope("low_button_use")).toBe("advanced");
    for (const rule of OPPORTUNITY_RULES) {
      if (rule === "low_button_use") continue;
      expect(ruleScope(rule), rule).toBe("basic");
    }
  });

  it("RN-OPP-08: Básico no ve ninguna; Impulso, Impulso+ y Premium las básicas; Premium+ también las avanzadas (decisión 39)", () => {
    const basico = { includedSmall: 0, includedPhoto: 0, includedMedium: 0, includedLarge: 0, grantsPriority: false };
    const impulso = { includedSmall: 6, includedPhoto: 6, includedMedium: 1, includedLarge: 0, grantsPriority: false };
    const impulsoPlus = { includedSmall: 16, includedPhoto: 12, includedMedium: 3, includedLarge: 0, grantsPriority: false };
    const premium = { includedSmall: 10, includedPhoto: 12, includedMedium: 2, includedLarge: 0, grantsPriority: false };
    const premiumPlus = { includedSmall: 25, includedPhoto: 24, includedMedium: 5, includedLarge: 1, grantsPriority: true };

    expect(planOpportunityAccess(null)).toBe("none");
    expect(planOpportunityAccess(basico)).toBe("none");
    expect(planOpportunityAccess(impulso)).toBe("basic");
    expect(planOpportunityAccess(impulsoPlus)).toBe("basic");
    expect(planOpportunityAccess(premium)).toBe("basic");
    expect(planOpportunityAccess(premiumPlus)).toBe("advanced");

    expect(planSees(planOpportunityAccess(basico), "basic")).toBe(false);
    expect(planSees(planOpportunityAccess(impulso), "basic")).toBe(true);
    expect(planSees(planOpportunityAccess(impulsoPlus), "basic")).toBe(true);
    expect(planSees(planOpportunityAccess(premium), "basic")).toBe(true);
    expect(planSees(planOpportunityAccess(premium), "advanced")).toBe(false);
    expect(planSees(planOpportunityAccess(premiumPlus), "advanced")).toBe(true);
  });
});

describe("RN-OPP-04 · el esfuerzo es la categoría del cambio (decisión 26b)", () => {
  // Impulso+: 16/12/3/0.
  const impulso = { includedSmall: 16, includedPhoto: 12, includedMedium: 3, includedLarge: 0, grantsPriority: false };

  it("dice lo que gasta y de cuánto saldo, y gasta siempre una unidad", () => {
    expect(describeEffort("medium", impulso, 3)).toEqual({
      category: "medium",
      spends: 1,
      remaining: 3,
      includedInPlan: true,
    });
  });

  it("sin plan, con la categoría fuera del plan o con la bolsa agotada, va a presupuesto (RN-CON-03)", () => {
    expect(describeEffort("medium", null, 0).includedInPlan).toBe(false);
    // Impulso+ no incluye grandes (RN-COM-02).
    expect(describeEffort("large", impulso, 0).includedInPlan).toBe(false);
    expect(describeEffort("medium", impulso, 0).includedInPlan).toBe(false);
  });
});

describe("RN-OPP-05 · los ocho estados de §98 y quién los mueve (§97)", () => {
  it("son ocho y son los de §98", () => {
    expect(OPPORTUNITY_STATES).toEqual([
      "detected",
      "recommended",
      "under_review",
      "approved_for_report",
      "discarded",
      "in_progress",
      "implemented",
      "no_longer_applicable",
    ]);
  });

  it("el trabajador recomienda pero NO aprueba ni descarta (§97)", () => {
    expect(canTransition("detected", "recommended", "worker")).toBe(true);
    expect(canTransition("recommended", "approved_for_report", "worker")).toBe(false);
    expect(canTransition("detected", "discarded", "worker")).toBe(false);
    expect(canTransition("detected", "approved_for_report", "worker")).toBe(false);
    // Y quien aprueba no tiene que esperar a que alguien la recomiende.
    expect(canTransition("detected", "approved_for_report", "approver")).toBe(true);
    expect(canTransition("under_review", "approved_for_report", "approver")).toBe(true);
  });

  it("de descartada no se sale a mano: la reapertura la hace la detección (§99)", () => {
    for (const actor of ["worker", "approver"] as const) {
      expect(canTransition("discarded", "detected", actor)).toBe(false);
      expect(canTransition("discarded", "approved_for_report", actor)).toBe(false);
    }
  });
});

describe("RN-OPP-07 · se detectan solas pero no se enseñan solas (§96, §295)", () => {
  it("el restaurante solo ve las aprobadas y lo que viene después", () => {
    expect(visibleToClient("detected")).toBe(false);
    expect(visibleToClient("recommended")).toBe(false);
    expect(visibleToClient("under_review")).toBe(false);
    expect(visibleToClient("discarded")).toBe(false);
    expect(visibleToClient("approved_for_report")).toBe(true);
    expect(visibleToClient("in_progress")).toBe(true);
    expect(visibleToClient("implemented")).toBe(true);
    expect(visibleToClient("no_longer_applicable")).toBe(true);
  });
});

describe("RN-OPP-06 · §99 · una descartada reaparece si empeora o en otro periodo", () => {
  const deteccion = (severity: number, periodStart: string): OpportunityDetection => ({
    rule: "traffic_drop",
    subject: "",
    category: "traffic",
    scope: "basic",
    impact: "medium",
    effort: "medium",
    periodStart,
    periodEnd: "2026-09-13",
    severity,
    measurements: [],
  });

  it("el mismo dato dentro de la misma ventana no la resucita", () => {
    expect(reopensAfterDiscard(deteccion(35, "2026-08-17"), { severity: 35, periodEnd: "2026-09-10" })).toBe(false);
  });

  it("si empeora, vuelve aunque la ventana se solape", () => {
    expect(reopensAfterDiscard(deteccion(48, "2026-08-17"), { severity: 35, periodEnd: "2026-09-10" })).toBe(true);
  });

  it("si vuelve a cumplirse en un periodo que ya no se solapa, vuelve igual", () => {
    expect(reopensAfterDiscard(deteccion(31, "2026-09-11"), { severity: 35, periodEnd: "2026-09-10" })).toBe(true);
  });
});

describe("RN-OPP-09 · lo que el restaurante puede hacer (§100)", () => {
  it("son las tres de §100 y las tres crean borrador de solicitud", () => {
    expect(CLIENT_OPPORTUNITY_ACTIONS).toEqual(["request_change", "request_quote", "ask_question"]);
  });
});

describe("RN-OPP-01 · la detección es determinista (RN-CLS-06: sin IA)", () => {
  it("la misma entrada da la misma salida, en el mismo orden", () => {
    const input = entrada({
      points: {
        ga4: [...dias("sessions", 3, VENTANA), ...dias("sessions", 5, ANTERIOR)],
        clarity: [...dias("sessions", 10, VENTANA), ...dias("script_errors", 1, VENTANA)],
      },
    });
    expect(detectOpportunities(input)).toEqual(detectOpportunities(input));
    expect(reglas(detectOpportunities(input))).toEqual(["traffic_drop", "technical_error"]);
  });

  it("sin datos no hay oportunidades: ninguna se inventa por defecto", () => {
    expect(detectOpportunities(entrada({}))).toEqual([]);
  });
});
