/**
 * `src/core/opportunities.ts` — oportunidades por reglas deterministas
 * (PRD §28, RN-OPP; §96 a §101 de la maestra; Fase 3, Hito 15).
 * Lógica de dominio pura, sin Supabase ni React ni red (CLAUDE.md).
 *
 * **De dónde sale cada número de este archivo.** De la decisión 26 de
 * `docs/DECISIONES.md`, que Bosco fijó el 14/09/2026 sobre
 * `docs/PROPUESTA-OPORTUNIDADES.md`. Hasta ese día CLAUDE.md prohibía
 * expresamente inventarlos ("umbrales concretos de detección y definición
 * de impacto/esfuerzo"), y por eso el Hito 15 estuvo bloqueado. Aquí no
 * se decide ninguno: se citan. Si un umbral hay que cambiarlo, se cambia
 * en la decisión y luego aquí, nunca al revés.
 *
 * Tres cosas valen para las nueve reglas (decisión 26c):
 *
 *   · **La ventana** son los 28 últimos días completos comparados con los
 *     28 anteriores, la misma que "Informes y datos" (decisión 25b,
 *     `summaryWindow()` / `previousWindow()` de `integrations.ts`).
 *   · **El suelo de ruido**: ninguna regla salta sin bastante dato. Un
 *     restaurante con doce visitas al mes no tiene un descenso: tiene doce
 *     visitas.
 *   · **La fuente viva**: nada salta si su integración está desconectada,
 *     sin autorizar, con error o con el dato desactualizado. Eso lo decide
 *     `noDataReason()` y aquí llega ya resuelto en `liveProviders`.
 *
 * Lo que NO está aquí, a propósito:
 *
 *   · **El texto.** Una oportunidad automática guarda su regla, su sujeto
 *     y su evidencia; el título, la categoría en palabras y la acción
 *     recomendada los pone la pantalla desde `src/i18n/es.ts`. Guardar
 *     frases en español en la base sería un literal de interfaz fuera del
 *     sistema de i18n (CLAUDE.md). El título escrito a mano solo existe en
 *     la oportunidad manual de §97, porque ahí lo escribe una persona.
 *   · **El control de acceso.** Quién aprueba, quién descarta y qué ve el
 *     restaurante lo vuelve a decidir el servidor (migración 84). Lo de
 *     aquí es la misma cuenta, para que la pantalla no ofrezca un botón
 *     que el servidor va a rechazar.
 *   · **La IA.** RN-CLS-06: las oportunidades son deterministas y no la
 *     usan. Dos veces la misma entrada da dos veces la misma salida, que
 *     es lo que permite que §99 actualice en vez de duplicar.
 */

import type { ChangeCategory } from "./consumption-ledger";
import {
  type IntegrationProvider,
  type MetricPoint,
  type SyncWindow,
  topDimensions,
} from "./integrations";

// ---------------------------------------------------------------------
// 1 · Las nueve reglas (§96) y de qué fuente sale cada una
// ---------------------------------------------------------------------

/**
 * Los nueve ejemplos de §96, en su orden, con el nombre corto que usan la
 * base (`opportunities.rule_key`), la pantalla y esta cuenta.
 */
export const OPPORTUNITY_RULES = [
  "traffic_drop",
  "low_ctr",
  "position_loss",
  "slowness",
  "heavy_images",
  "technical_error",
  "low_mobile_conversion",
  "queries_without_content",
  "low_button_use",
] as const;
export type OpportunityRule = (typeof OPPORTUNITY_RULES)[number];

export function isOpportunityRule(value: string): value is OpportunityRule {
  return (OPPORTUNITY_RULES as readonly string[]).includes(value);
}

/** Con qué fuentes se calcula cada regla (decisión 26c, columna "se calcula con"). */
export const RULE_PROVIDERS: Readonly<Record<OpportunityRule, readonly IntegrationProvider[]>> = {
  traffic_drop: ["ga4"],
  low_ctr: ["search_console"],
  position_loss: ["search_console"],
  slowness: ["pagespeed"],
  heavy_images: ["pagespeed"],
  technical_error: ["clarity"],
  low_mobile_conversion: ["ga4"],
  queries_without_content: ["search_console"],
  // La única que mira dos: la ficha de Google (la ven y no hacen nada) y
  // la fricción de Clarity (pulsan algo que no responde).
  low_button_use: ["business_profile", "clarity"],
};

/**
 * La categoría de §96. La maestra la pide como campo y no la enumera, así
 * que son las cinco áreas en que caen las nueve reglas, y ninguna más.
 * Es una lectura aplicada (pendiente 15 de `docs/DECISIONES.md`).
 */
export const OPPORTUNITY_CATEGORIES = ["traffic", "search", "performance", "technical", "conversion"] as const;
export type OpportunityCategory = (typeof OPPORTUNITY_CATEGORIES)[number];

export const RULE_CATEGORY: Readonly<Record<OpportunityRule, OpportunityCategory>> = {
  traffic_drop: "traffic",
  low_ctr: "search",
  position_loss: "search",
  queries_without_content: "search",
  slowness: "performance",
  heavy_images: "performance",
  technical_error: "technical",
  low_mobile_conversion: "conversion",
  low_button_use: "conversion",
};

// ---------------------------------------------------------------------
// 2 · Básica o avanzada (§101, decisión 26e)
// ---------------------------------------------------------------------

/**
 * "Avanzadas son las que cruzan dos fuentes y básicas las que salen de
 * una sola" (decisión 26e). No es una etiqueta escrita a mano regla por
 * regla: se cuenta sobre `RULE_PROVIDERS`, así que una regla que mañana
 * mire una fuente más se vuelve avanzada sola y nadie tiene que acordarse.
 */
export type OpportunityScope = "basic" | "advanced";

export function ruleScope(rule: OpportunityRule): OpportunityScope {
  return RULE_PROVIDERS[rule].length > 1 ? "advanced" : "basic";
}

/**
 * Qué oportunidades deja ver el plan vigente (§101): Básico ninguna
 * ("detección interna"), Impulso las básicas aprobadas, Premium también
 * las avanzadas.
 *
 * Se decide por lo que el plan ES, no por cómo se llama: Cuotly es
 * multiempresa (CLAUDE.md) y otro espacio llamará "Total" a su plan alto.
 * Sin ningún cambio incluido es el plan de entrada (Básico, que "NO
 * incluye ningún cambio"); con prioridad concedida es el alto
 * (`plans.grants_priority`, el mismo criterio de la decisión 20).
 */
export type PlanOpportunityAccess = "none" | "basic" | "advanced";

export interface PlanShape {
  readonly includedSmall: number;
  readonly includedPhoto: number;
  readonly includedMedium: number;
  readonly includedLarge: number;
  readonly grantsPriority: boolean;
}

export function planOpportunityAccess(plan: PlanShape | null): PlanOpportunityAccess {
  if (plan === null) return "none";
  const incluye = plan.includedSmall + plan.includedPhoto + plan.includedMedium + plan.includedLarge;
  if (incluye === 0) return "none";
  return plan.grantsPriority ? "advanced" : "basic";
}

/** Si una oportunidad de este alcance entra en lo que ese plan deja ver. */
export function planSees(access: PlanOpportunityAccess, scope: OpportunityScope): boolean {
  if (access === "none") return false;
  return access === "advanced" || scope === "basic";
}

// ---------------------------------------------------------------------
// 3 · Impacto (decisión 26a)
// ---------------------------------------------------------------------

/**
 * "Cuánto gana el restaurante si esto se arregla", para poder ordenar la
 * lista. **No son euros**: Cuotly no sabe lo que vale una reserva ni
 * cuántas visitas acaban en cena, y un euro inventado en una pantalla de
 * producción es lo que CLAUDE.md prohíbe.
 *
 *   · **Alto** — rompe o estorba el camino por el que un cliente contacta
 *     (el teléfono, cómo llegar, la reserva, el formulario), o afecta a
 *     más de la mitad del tráfico.
 *   · **Medio** — afecta a una parte visible del sitio o a una entrada de
 *     tráfico importante, pero no al camino de contacto.
 *   · **Bajo** — afecta a una página, una consulta o un detalle suelto.
 *
 * El nivel lo PROPONE Cuotly con esa regla; el equipo lo puede cambiar
 * antes de enseñárselo al restaurante (§96: impacto, prioridad y esfuerzo
 * son propuestas editables). Lo que no cambia es la evidencia.
 */
export const OPPORTUNITY_IMPACTS = ["high", "medium", "low"] as const;
export type OpportunityImpact = (typeof OPPORTUNITY_IMPACTS)[number];

// ---------------------------------------------------------------------
// 4 · Esfuerzo: la categoría del cambio, sin escala nueva (decisión 26b)
// ---------------------------------------------------------------------

/**
 * Bosco lo definió como "lo que se tarda en hacer y los cambios que
 * gasta", y eso es exactamente lo que la categoría del cambio ya lleva
 * dentro: su duración —1 a 3 días laborables, 3 a 5 el grande; es el rango
 * que se le dice al cliente (RN-SLA-16), y la decisión 26b lo cita como
 * RN-SLA-12, que es la misma tabla vista por dentro— y una unidad de la
 * bolsa del plan. Por eso el esfuerzo no es una escala
 * paralela: ES la categoría.
 *
 * Así la pantalla dice "Mediano: 1 a 3 días laborables, y te gasta 1 de
 * los 3 medianos que te quedan este mes" en vez de "esfuerzo: medio"; y
 * en un plan que no incluye la categoría, o con la bolsa agotada, dice
 * que va a presupuesto en vez de fingir que está incluido (RN-CON-03).
 *
 * El esfuerzo de cada regla es una PROPUESTA (§96), como el impacto.
 */
export const RULE_EFFORT: Readonly<Record<OpportunityRule, ChangeCategory>> = {
  // Mirar qué se cayó y cambiar lo que lo causó: no es un retoque.
  traffic_drop: "medium",
  // Reescribir el título y la descripción de una página.
  low_ctr: "small",
  position_loss: "medium",
  // Contenido nuevo para una búsqueda que hoy no tiene el suyo.
  queries_without_content: "medium",
  slowness: "medium",
  // Recomprimir y redimensionar las imágenes que ya están puestas.
  heavy_images: "small",
  technical_error: "small",
  low_mobile_conversion: "medium",
  low_button_use: "small",
};

/** Lo que el restaurante ve del esfuerzo, ya cruzado con su plan y su bolsa. */
export interface EffortView {
  readonly category: ChangeCategory;
  /** Lo que gasta de la bolsa: siempre una unidad de su categoría (RN-CON-01). */
  readonly spends: 1;
  /** Saldo de esa categoría en el ciclo vigente, del libro (nunca un contador). */
  readonly remaining: number;
  /**
   * `true` cuando el plan incluye la categoría y queda saldo. `false` es
   * "esto va a presupuesto" (RN-CON-03), que es lo que hay que decir en
   * Básico y con la bolsa agotada.
   */
  readonly includedInPlan: boolean;
}

export function describeEffort(
  category: ChangeCategory,
  plan: PlanShape | null,
  remaining: number,
): EffortView {
  const incluidas: Record<ChangeCategory, number> =
    plan === null
      ? { small: 0, photo: 0, medium: 0, large: 0 }
      : {
          small: plan.includedSmall,
          photo: plan.includedPhoto,
          medium: plan.includedMedium,
          large: plan.includedLarge,
        };
  return {
    category,
    spends: 1,
    remaining,
    includedInPlan: incluidas[category] > 0 && remaining > 0,
  };
}

// ---------------------------------------------------------------------
// 5 · Los ocho estados (§98) y quién los mueve (§97)
// ---------------------------------------------------------------------

export const OPPORTUNITY_STATES = [
  "detected",
  "recommended",
  "under_review",
  "approved_for_report",
  "discarded",
  "in_progress",
  "implemented",
  "no_longer_applicable",
] as const;
export type OpportunityState = (typeof OPPORTUNITY_STATES)[number];

export function isOpportunityState(value: string): value is OpportunityState {
  return (OPPORTUNITY_STATES as readonly string[]).includes(value);
}

/**
 * Quién mueve una oportunidad. `worker` es el trabajador asignado al
 * restaurante (§97: ve las automáticas, añade una manual, aporta
 * evidencia, recomienda inclusión y añade observaciones, **y no la
 * aprueba definitivamente**); `approver` es propietario o administrador
 * con `Aprobar informes` (§97: editar, ordenar, aprobar o descartar). El
 * restaurante no mueve ninguna: actúa sobre ella (§100), que es otra cosa.
 */
export type OpportunityActor = "worker" | "approver";

/** §98 · las transiciones que existen, con quién puede hacer cada una. */
export const OPPORTUNITY_TRANSITIONS: readonly {
  readonly from: OpportunityState;
  readonly to: OpportunityState;
  readonly actors: readonly OpportunityActor[];
}[] = [
  // El trabajador recomienda; recomendar no es aprobar.
  { from: "detected", to: "recommended", actors: ["worker", "approver"] },
  { from: "detected", to: "under_review", actors: ["approver"] },
  // Quien aprueba puede aprobar lo que está mirando, sin obligar a que
  // alguien la recomiende antes: §95 dice que revisa, selecciona y
  // aprueba, no que haga escala en un estado intermedio.
  { from: "detected", to: "approved_for_report", actors: ["approver"] },
  { from: "detected", to: "discarded", actors: ["approver"] },
  { from: "recommended", to: "under_review", actors: ["approver"] },
  { from: "recommended", to: "approved_for_report", actors: ["approver"] },
  { from: "recommended", to: "discarded", actors: ["approver"] },
  { from: "under_review", to: "approved_for_report", actors: ["approver"] },
  { from: "under_review", to: "discarded", actors: ["approver"] },
  // Aprobada y ya no vigente: "ya no aplicable" (§98) sin pasar por
  // descartada, que es una decisión y no un hecho.
  { from: "approved_for_report", to: "in_progress", actors: ["approver"] },
  { from: "approved_for_report", to: "no_longer_applicable", actors: ["approver"] },
  { from: "approved_for_report", to: "discarded", actors: ["approver"] },
  { from: "in_progress", to: "implemented", actors: ["approver"] },
  { from: "in_progress", to: "no_longer_applicable", actors: ["approver"] },
  // §99 · "una descartada conserva historial" y puede reaparecer. La
  // reapertura la hace la detección, no una persona: por eso no hay
  // transición desde `discarded` para nadie.
  { from: "implemented", to: "no_longer_applicable", actors: ["approver"] },
];

export function canTransition(
  from: OpportunityState,
  to: OpportunityState,
  actor: OpportunityActor,
): boolean {
  return OPPORTUNITY_TRANSITIONS.some(
    (t) => t.from === from && t.to === to && t.actors.includes(actor),
  );
}

/**
 * §96 + §295 · se detectan solas pero no se enseñan solas: hasta que el
 * equipo no aprueba una, el restaurante no la ve. "Descartada" no la ve
 * nunca; "ya no aplicable" e "implementada" sí, porque son el final de
 * algo que ya había visto aprobado.
 */
export function visibleToClient(state: OpportunityState): boolean {
  return (
    state === "approved_for_report" ||
    state === "in_progress" ||
    state === "implemented" ||
    state === "no_longer_applicable"
  );
}

/** §100 · lo que el restaurante puede hacer con una oportunidad que ve. */
export const CLIENT_OPPORTUNITY_ACTIONS = ["request_change", "request_quote", "ask_question"] as const;
export type ClientOpportunityAction = (typeof CLIENT_OPPORTUNITY_ACTIONS)[number];

/**
 * Las tres crean un BORRADOR de solicitud con la evidencia adjunta, y a
 * partir de ahí sigue el camino normal (análisis, aceptación, consumo o
 * presupuesto). Ninguna consume nada por sí sola: §100 dice "crea
 * borrador", y un borrador no gasta bolsa (RN-CON-06: el consumo nace al
 * aceptar).
 */
export function actionCreatesRequestDraft(action: ClientOpportunityAction): boolean {
  return (CLIENT_OPPORTUNITY_ACTIONS as readonly string[]).includes(action);
}

// ---------------------------------------------------------------------
// 6 · Los umbrales (decisión 26c)
// ---------------------------------------------------------------------

/**
 * Los nueve umbrales, con nombre, en un solo sitio. Cada uno es
 * literalmente una celda de la tabla de la decisión 26c; el test los
 * vuelve a escribir uno a uno para que cambiar un número sin cambiar la
 * decisión rompa la suite.
 */
export const OPPORTUNITY_THRESHOLDS = {
  /** 1 · las sesiones caen un 30 % o más… */
  trafficDropPercent: 30,
  /** …y el periodo anterior tenía al menos 100 sesiones. */
  trafficDropPreviousSessions: 100,
  /** "Afecta a más de la mitad del tráfico" (decisión 26a): impacto alto. */
  trafficDropHighImpactPercent: 50,

  /** 2 · consulta con 100 impresiones o más, en posición 10 o mejor, con CTR bajo el 2 %. */
  lowCtrImpressions: 100,
  lowCtrPosition: 10,
  lowCtrPercent: 2,

  /** 3 · consulta con 50 impresiones o más que empeora 3 puestos o más y acaba peor del 10. */
  positionLossImpressions: 50,
  positionLossPlaces: 3,
  positionLossWorseThan: 10,

  /** 4 · puntuación móvil bajo 50 (banda roja de Lighthouse) o LCP móvil sobre 4 s… */
  slownessScore: 50,
  slownessLcpMs: 4000,
  /** …en dos análisis seguidos, para que un mal día no genere trabajo. */
  slownessMeasurements: 2,

  /** 5 · 500 KB o más ahorrables en móvil. */
  heavyImagesSavingsKb: 500,

  /** 6 · errores de script en el 5 % o más de las sesiones, con 100 sesiones o más. */
  technicalErrorPercent: 5,
  technicalErrorSessions: 100,

  /** 7 · el móvil convierte la mitad o menos que el escritorio, con 100 sesiones móviles o más. */
  lowMobileConversionRatio: 0.5,
  lowMobileConversionSessions: 100,

  /** 8 · consulta con 100 impresiones o más en posición media peor que 20. */
  queriesWithoutContentImpressions: 100,
  queriesWithoutContentPosition: 20,

  /** 9a · ficha de Google con 500 impresiones o más y acciones bajo el 2 %. */
  lowButtonUseImpressions: 500,
  lowButtonUseActionsPercent: 2,
  /** 9b · clics muertos o de rabia sobre el 5 % de las sesiones. */
  frictionClicksPercent: 5,
  /**
   * El suelo de 9b. La decisión 26c no le pone uno (sí a 6, que divide
   * entre las mismas sesiones de Clarity), así que se aplica el mismo:
   * un tanto por ciento sobre doce sesiones no es una señal. Lectura
   * aplicada, pendiente 15 de `docs/DECISIONES.md`.
   */
  frictionSessions: 100,
} as const;

// ---------------------------------------------------------------------
// 7 · La detección
// ---------------------------------------------------------------------

/** La unidad de una cifra de la evidencia, para que la pantalla sepa escribirla. */
export type EvidenceUnit = "count" | "ratio" | "percent" | "position" | "ms" | "kb" | "score";

export interface EvidenceMeasurement {
  readonly provider: IntegrationProvider;
  readonly metric: string;
  /** El desglose: la consulta, la estrategia, el dispositivo. Vacío para un total. */
  readonly dimension: string;
  readonly value: number;
  /** La misma cifra en los 28 días anteriores, cuando la regla la compara. */
  readonly previous: number | null;
  readonly unit: EvidenceUnit;
}

export interface OpportunityDetection {
  readonly rule: OpportunityRule;
  /**
   * Qué caso concreto de la regla es: la consulta, la estrategia, el
   * dispositivo o la fuente del caso. Vacío cuando la regla habla del
   * sitio entero. Junto con la regla es la clave de §99: una detección
   * repetida del mismo sujeto ACTUALIZA la oportunidad que ya existe, no
   * crea otra.
   */
  readonly subject: string;
  readonly category: OpportunityCategory;
  readonly scope: OpportunityScope;
  readonly impact: OpportunityImpact;
  readonly effort: ChangeCategory;
  readonly periodStart: string;
  readonly periodEnd: string;
  /**
   * Cuánto de mal está, en la unidad de la regla y siempre "más alto es
   * peor". Sirve para §99: una descartada reaparece si EMPEORA, y eso se
   * compara con esto, no a ojo.
   */
  readonly severity: number;
  readonly measurements: readonly EvidenceMeasurement[];
}

export interface DetectionInput {
  readonly window: SyncWindow;
  readonly previousWindow: SyncWindow;
  /** Los puntos de cada fuente, de las dos ventanas. */
  readonly points: Readonly<Partial<Record<IntegrationProvider, readonly MetricPoint[]>>>;
  /**
   * Las fuentes con dato actual (`noDataReason() === null`). Una fuente
   * que no esté aquí no dispara nada: ni desconectada, ni sin autorizar,
   * ni con error, ni con el dato desactualizado (P6, RN-INT-07).
   */
  readonly liveProviders: readonly IntegrationProvider[];
}

// --- Lecturas sobre los puntos ---------------------------------------

function pointsOf(input: DetectionInput, provider: IntegrationProvider): readonly MetricPoint[] {
  return input.liveProviders.includes(provider) ? (input.points[provider] ?? []) : [];
}

function inWindow(points: readonly MetricPoint[], metric: string, w: SyncWindow, dimension?: string) {
  return points.filter(
    (p) =>
      p.metric === metric &&
      p.period_start >= w.from &&
      p.period_end <= w.to &&
      (dimension === undefined || p.dimension === dimension),
  );
}

/** La suma de un total (sin desglose) en la ventana; `null` si no hay ningún punto. */
function total(points: readonly MetricPoint[], metric: string, w: SyncWindow): number | null {
  const dentro = inWindow(points, metric, w, "");
  return dentro.length === 0 ? null : dentro.reduce((acc, p) => acc + p.value, 0);
}

/** La suma de un desglose concreto en la ventana; `null` si no hay ningún punto. */
function dimensionTotal(
  points: readonly MetricPoint[],
  metric: string,
  dimension: string,
  w: SyncWindow,
): number | null {
  const dentro = inWindow(points, metric, w, dimension);
  return dentro.length === 0 ? null : dentro.reduce((acc, p) => acc + p.value, 0);
}

/**
 * La media de una métrica por desglose PONDERADA por otra: es como se
 * promedian el CTR y la posición de una consulta. La media simple de los
 * CTR diarios no es el CTR del periodo; ponderada por impresiones sí es
 * exactamente clics totales entre impresiones totales, que es lo que
 * Search Console llama CTR medio.
 */
function weightedByDimension(
  points: readonly MetricPoint[],
  metric: string,
  weightMetric: string,
  w: SyncWindow,
): Map<string, number> {
  const pesos = new Map<string, Map<string, number>>();
  for (const p of inWindow(points, weightMetric, w)) {
    if (p.dimension === "") continue;
    const porDia = pesos.get(p.dimension) ?? new Map<string, number>();
    porDia.set(p.period_start, p.value);
    pesos.set(p.dimension, porDia);
  }

  const acumulado = new Map<string, { suma: number; peso: number }>();
  for (const p of inWindow(points, metric, w)) {
    if (p.dimension === "") continue;
    const peso = pesos.get(p.dimension)?.get(p.period_start) ?? 0;
    if (peso <= 0) continue;
    const actual = acumulado.get(p.dimension) ?? { suma: 0, peso: 0 };
    acumulado.set(p.dimension, { suma: actual.suma + p.value * peso, peso: actual.peso + peso });
  }

  const salida = new Map<string, number>();
  for (const [dimension, { suma, peso }] of acumulado) {
    if (peso > 0) salida.set(dimension, suma / peso);
  }
  return salida;
}

/** Las últimas N mediciones de una métrica por estrategia, de más reciente a más antigua. */
function lastMeasurements(
  points: readonly MetricPoint[],
  metric: string,
  dimension: string,
  w: SyncWindow,
  count: number,
): MetricPoint[] {
  return [...inWindow(points, metric, w, dimension)]
    .sort((a, b) => b.period_end.localeCompare(a.period_end))
    .slice(0, count);
}

function measurement(
  provider: IntegrationProvider,
  metric: string,
  dimension: string,
  value: number,
  previous: number | null,
  unit: EvidenceUnit,
): EvidenceMeasurement {
  return { provider, metric, dimension, value, previous, unit };
}

const MOBILE = "mobile";
const DESKTOP = "desktop";

// --- Las nueve reglas -------------------------------------------------

function base(
  rule: OpportunityRule,
  input: DetectionInput,
  subject: string,
  impact: OpportunityImpact,
  severity: number,
  measurements: readonly EvidenceMeasurement[],
): OpportunityDetection {
  return {
    rule,
    subject,
    category: RULE_CATEGORY[rule],
    scope: ruleScope(rule),
    impact,
    effort: RULE_EFFORT[rule],
    periodStart: input.window.from,
    periodEnd: input.window.to,
    severity,
    measurements,
  };
}

/** 1 · Descenso de tráfico (GA4 `sessions`). */
function trafficDrop(input: DetectionInput): OpportunityDetection[] {
  const puntos = pointsOf(input, "ga4");
  const actual = total(puntos, "sessions", input.window);
  const anterior = total(puntos, "sessions", input.previousWindow);
  if (actual === null || anterior === null) return [];
  if (anterior < OPPORTUNITY_THRESHOLDS.trafficDropPreviousSessions) return [];

  const caida = ((anterior - actual) / anterior) * 100;
  if (caida < OPPORTUNITY_THRESHOLDS.trafficDropPercent) return [];

  const impact: OpportunityImpact =
    caida >= OPPORTUNITY_THRESHOLDS.trafficDropHighImpactPercent ? "high" : "medium";
  return [
    base("traffic_drop", input, "", impact, caida, [
      measurement("ga4", "sessions", "", actual, anterior, "count"),
    ]),
  ];
}

/** 2 · CTR bajo, 3 · pérdida de posición y 8 · búsquedas que salen muy abajo. */
function queryRules(input: DetectionInput): OpportunityDetection[] {
  const puntos = pointsOf(input, "search_console");
  const w = input.window;
  const anterior = input.previousWindow;

  const impresiones = new Map(
    topDimensions(puntos, "impressions_by_query", w, Number.MAX_SAFE_INTEGER).map((d) => [d.dimension, d.value]),
  );
  const ctr = weightedByDimension(puntos, "ctr_by_query", "impressions_by_query", w);
  const posicion = weightedByDimension(puntos, "position_by_query", "impressions_by_query", w);
  const posicionAnterior = weightedByDimension(puntos, "position_by_query", "impressions_by_query", anterior);

  const salida: OpportunityDetection[] = [];
  for (const [consulta, impresionesConsulta] of impresiones) {
    const ctrConsulta = ctr.get(consulta);
    const posicionConsulta = posicion.get(consulta);
    if (posicionConsulta === undefined) continue;

    // 2 · está en la primera página y nadie entra: el problema es el
    // título o la descripción.
    if (
      ctrConsulta !== undefined &&
      impresionesConsulta >= OPPORTUNITY_THRESHOLDS.lowCtrImpressions &&
      posicionConsulta <= OPPORTUNITY_THRESHOLDS.lowCtrPosition &&
      ctrConsulta * 100 < OPPORTUNITY_THRESHOLDS.lowCtrPercent
    ) {
      salida.push(
        base("low_ctr", input, consulta, "low", OPPORTUNITY_THRESHOLDS.lowCtrPercent - ctrConsulta * 100, [
          measurement("search_console", "ctr_by_query", consulta, ctrConsulta, null, "ratio"),
          measurement("search_console", "impressions_by_query", consulta, impresionesConsulta, null, "count"),
          measurement("search_console", "position_by_query", consulta, posicionConsulta, null, "position"),
        ]),
      );
    }

    // 3 · caer del 2 al 5 no saca a nadie de la primera página; caer del
    // 8 al 14, sí.
    const antes = posicionAnterior.get(consulta);
    if (
      antes !== undefined &&
      impresionesConsulta >= OPPORTUNITY_THRESHOLDS.positionLossImpressions &&
      posicionConsulta - antes >= OPPORTUNITY_THRESHOLDS.positionLossPlaces &&
      posicionConsulta > OPPORTUNITY_THRESHOLDS.positionLossWorseThan
    ) {
      salida.push(
        base("position_loss", input, consulta, "low", posicionConsulta - antes, [
          measurement("search_console", "position_by_query", consulta, posicionConsulta, antes, "position"),
          measurement("search_console", "impressions_by_query", consulta, impresionesConsulta, null, "count"),
        ]),
      );
    }

    // 8 · Google cree que el sitio va de eso y lo enseña muy abajo. Ojo:
    // esto detecta "sale muy abajo", no "el contenido no es adecuado":
    // juzgar eso exigiría leer la web, y Cuotly no la lee (decisión 26c).
    if (
      impresionesConsulta >= OPPORTUNITY_THRESHOLDS.queriesWithoutContentImpressions &&
      posicionConsulta > OPPORTUNITY_THRESHOLDS.queriesWithoutContentPosition
    ) {
      salida.push(
        base("queries_without_content", input, consulta, "low", posicionConsulta, [
          measurement("search_console", "position_by_query", consulta, posicionConsulta, antes ?? null, "position"),
          measurement("search_console", "impressions_by_query", consulta, impresionesConsulta, null, "count"),
        ]),
      );
    }
  }
  return salida;
}

/** 4 · Lentitud (PageSpeed, móvil, dos análisis seguidos). */
function slowness(input: DetectionInput): OpportunityDetection[] {
  const puntos = pointsOf(input, "pagespeed");
  const n = OPPORTUNITY_THRESHOLDS.slownessMeasurements;
  const puntuaciones = lastMeasurements(puntos, "performance_score_by_strategy", MOBILE, input.window, n);
  const lcp = lastMeasurements(puntos, "lcp_ms_by_strategy", MOBILE, input.window, n);

  const puntuacionMala =
    puntuaciones.length === n && puntuaciones.every((p) => p.value < OPPORTUNITY_THRESHOLDS.slownessScore);
  const lcpMalo = lcp.length === n && lcp.every((p) => p.value > OPPORTUNITY_THRESHOLDS.slownessLcpMs);
  if (!puntuacionMala && !lcpMalo) return [];

  const measurements: EvidenceMeasurement[] = [];
  if (puntuaciones.length > 0) {
    measurements.push(
      measurement(
        "pagespeed",
        "performance_score_by_strategy",
        MOBILE,
        puntuaciones[0].value,
        puntuaciones[1]?.value ?? null,
        "score",
      ),
    );
  }
  if (lcp.length > 0) {
    measurements.push(
      measurement("pagespeed", "lcp_ms_by_strategy", MOBILE, lcp[0].value, lcp[1]?.value ?? null, "ms"),
    );
  }

  // Más alto es peor: lo que le falta a la puntuación para llegar a la
  // banda, o los segundos de LCP por encima del límite.
  const severidad = puntuacionMala
    ? OPPORTUNITY_THRESHOLDS.slownessScore - puntuaciones[0].value
    : (lcp[0].value - OPPORTUNITY_THRESHOLDS.slownessLcpMs) / 1000;

  return [base("slowness", input, MOBILE, "medium", severidad, measurements)];
}

/** 5 · Imágenes pesadas (PageSpeed, kilobytes ahorrables en móvil). */
function heavyImages(input: DetectionInput): OpportunityDetection[] {
  const puntos = pointsOf(input, "pagespeed");
  const optimizar = lastMeasurements(puntos, "optimized_images_savings_kb_by_strategy", MOBILE, input.window, 1)[0];
  const redimensionar = lastMeasurements(puntos, "responsive_images_savings_kb_by_strategy", MOBILE, input.window, 1)[0];
  if (optimizar === undefined && redimensionar === undefined) return [];

  // El MAYOR de los dos, no la suma: las dos auditorías miran las mismas
  // imágenes desde dos lados (comprimirlas y servirlas a su tamaño), y
  // sumarlas contaría dos veces los mismos kilobytes.
  const ahorro = Math.max(optimizar?.value ?? 0, redimensionar?.value ?? 0);
  if (ahorro < OPPORTUNITY_THRESHOLDS.heavyImagesSavingsKb) return [];

  const measurements: EvidenceMeasurement[] = [];
  if (optimizar !== undefined) {
    measurements.push(
      measurement("pagespeed", "optimized_images_savings_kb_by_strategy", MOBILE, optimizar.value, null, "kb"),
    );
  }
  if (redimensionar !== undefined) {
    measurements.push(
      measurement("pagespeed", "responsive_images_savings_kb_by_strategy", MOBILE, redimensionar.value, null, "kb"),
    );
  }
  return [base("heavy_images", input, MOBILE, "medium", ahorro, measurements)];
}

/** 6 · Error técnico (Clarity, errores de script sobre las sesiones). */
function technicalError(input: DetectionInput): OpportunityDetection[] {
  const puntos = pointsOf(input, "clarity");
  const sesiones = total(puntos, "sessions", input.window);
  const errores = total(puntos, "script_errors", input.window);
  if (sesiones === null || errores === null) return [];
  if (sesiones < OPPORTUNITY_THRESHOLDS.technicalErrorSessions) return [];

  const porcentaje = (errores / sesiones) * 100;
  if (porcentaje < OPPORTUNITY_THRESHOLDS.technicalErrorPercent) return [];

  return [
    // Alto: es la única regla que dice que algo está ROTO, y lo que se
    // rompe puede ser el formulario o la reserva (decisión 26a).
    base("technical_error", input, "", "high", porcentaje, [
      measurement("clarity", "script_errors", "", errores, null, "count"),
      measurement("clarity", "sessions", "", sesiones, null, "count"),
    ]),
  ];
}

/** 7 · Baja conversión móvil (GA4, eventos clave por dispositivo). */
function lowMobileConversion(input: DetectionInput): OpportunityDetection[] {
  const puntos = pointsOf(input, "ga4");
  const w = input.window;
  const sesionesMovil = dimensionTotal(puntos, "sessions_by_device", MOBILE, w);
  const sesionesEscritorio = dimensionTotal(puntos, "sessions_by_device", DESKTOP, w);
  const conversionesMovil = dimensionTotal(puntos, "conversions_by_device", MOBILE, w);
  const conversionesEscritorio = dimensionTotal(puntos, "conversions_by_device", DESKTOP, w);
  if (
    sesionesMovil === null ||
    sesionesEscritorio === null ||
    conversionesMovil === null ||
    conversionesEscritorio === null
  ) {
    return [];
  }
  if (sesionesMovil < OPPORTUNITY_THRESHOLDS.lowMobileConversionSessions) return [];
  if (sesionesEscritorio <= 0) return [];

  const tasaMovil = conversionesMovil / sesionesMovil;
  const tasaEscritorio = conversionesEscritorio / sesionesEscritorio;
  // Sin escritorio con el que comparar no hay regla: no es que el móvil
  // vaya bien, es que no se sabe.
  if (tasaEscritorio <= 0) return [];
  if (tasaMovil > tasaEscritorio * OPPORTUNITY_THRESHOLDS.lowMobileConversionRatio) return [];

  return [
    // Alto: convertir ES el camino de contacto —el formulario, la
    // reserva—, y es justo el que no funciona en el móvil.
    base("low_mobile_conversion", input, MOBILE, "high", (1 - tasaMovil / tasaEscritorio) * 100, [
      measurement("ga4", "conversions_by_device", MOBILE, conversionesMovil, null, "count"),
      measurement("ga4", "sessions_by_device", MOBILE, sesionesMovil, null, "count"),
      measurement("ga4", "conversions_by_device", DESKTOP, conversionesEscritorio, null, "count"),
      measurement("ga4", "sessions_by_device", DESKTOP, sesionesEscritorio, null, "count"),
    ]),
  ];
}

/**
 * 9 · Poco uso de botones importantes, en sus dos casos: (a) la ficha de
 * Google la ven y no hacen nada; (b) pulsan algo que no responde. Cada
 * caso es un sujeto distinto, así que son dos oportunidades distintas y
 * aprobar una no aprueba la otra.
 */
function lowButtonUse(input: DetectionInput): OpportunityDetection[] {
  const salida: OpportunityDetection[] = [];
  const w = input.window;

  const ficha = pointsOf(input, "business_profile");
  const impresiones = total(ficha, "profile_impressions", w);
  const web = total(ficha, "website_clicks", w);
  const llamadas = total(ficha, "call_clicks", w);
  const comoLlegar = total(ficha, "direction_requests", w);
  if (impresiones !== null && impresiones >= OPPORTUNITY_THRESHOLDS.lowButtonUseImpressions) {
    const acciones = (web ?? 0) + (llamadas ?? 0) + (comoLlegar ?? 0);
    const porcentaje = (acciones / impresiones) * 100;
    if (porcentaje < OPPORTUNITY_THRESHOLDS.lowButtonUseActionsPercent) {
      salida.push(
        // Alto: esos tres botones SON el camino de contacto (el teléfono,
        // cómo llegar, la web).
        base(
          "low_button_use",
          input,
          "profile",
          "high",
          OPPORTUNITY_THRESHOLDS.lowButtonUseActionsPercent - porcentaje,
          [
            measurement("business_profile", "profile_impressions", "", impresiones, null, "count"),
            measurement("business_profile", "website_clicks", "", web ?? 0, null, "count"),
            measurement("business_profile", "call_clicks", "", llamadas ?? 0, null, "count"),
            measurement("business_profile", "direction_requests", "", comoLlegar ?? 0, null, "count"),
          ],
        ),
      );
    }
  }

  const clarity = pointsOf(input, "clarity");
  const sesiones = total(clarity, "sessions", w);
  const muertos = total(clarity, "dead_clicks", w);
  const rabia = total(clarity, "rage_clicks", w);
  if (
    sesiones !== null &&
    sesiones >= OPPORTUNITY_THRESHOLDS.frictionSessions &&
    (muertos !== null || rabia !== null)
  ) {
    const porcentaje = (((muertos ?? 0) + (rabia ?? 0)) / sesiones) * 100;
    if (porcentaje > OPPORTUNITY_THRESHOLDS.frictionClicksPercent) {
      salida.push(
        // Medio: estorba una parte visible del sitio, pero no se sabe que
        // sea el camino de contacto el que no responde.
        base("low_button_use", input, "friction", "medium", porcentaje, [
          measurement("clarity", "dead_clicks", "", muertos ?? 0, null, "count"),
          measurement("clarity", "rage_clicks", "", rabia ?? 0, null, "count"),
          measurement("clarity", "sessions", "", sesiones, null, "count"),
        ]),
      );
    }
  }

  return salida;
}

/**
 * Las nueve reglas sobre los datos de un restaurante. Determinista: la
 * misma entrada da la misma salida, sin IA (RN-CLS-06) y sin azar. El
 * orden de salida es el de `OPPORTUNITY_RULES` y, dentro de una regla,
 * el del sujeto, para que dos pasadas seguidas no reordenen nada.
 */
export function detectOpportunities(input: DetectionInput): readonly OpportunityDetection[] {
  const todas = [
    ...trafficDrop(input),
    ...queryRules(input),
    ...slowness(input),
    ...heavyImages(input),
    ...technicalError(input),
    ...lowMobileConversion(input),
    ...lowButtonUse(input),
  ];
  const orden = new Map(OPPORTUNITY_RULES.map((r, i) => [r, i]));
  return [...todas].sort(
    (a, b) => (orden.get(a.rule) ?? 0) - (orden.get(b.rule) ?? 0) || a.subject.localeCompare(b.subject),
  );
}

// ---------------------------------------------------------------------
// 8 · §99 · persistencia, duplicados y reaparición
// ---------------------------------------------------------------------

/**
 * Si una detección de hoy debe REABRIR una oportunidad descartada. §99:
 * "puede reaparecer si empeora o vuelve a cumplirse en otro periodo,
 * indicando el descarte anterior".
 *
 * "Empeora" es que su severidad supere la que tenía al descartarla.
 * "Otro periodo" se lee como una ventana que ya no se solapa con la que
 * se descartó: si no, una descartada volvería al día siguiente con el
 * mismo dato y descartar no significaría nada durante 28 días. Es una
 * lectura aplicada (pendiente 15 de `docs/DECISIONES.md`).
 */
export function reopensAfterDiscard(
  detection: OpportunityDetection,
  discarded: { readonly severity: number; readonly periodEnd: string },
): boolean {
  if (detection.severity > discarded.severity) return true;
  return detection.periodStart > discarded.periodEnd;
}
