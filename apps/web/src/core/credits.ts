/**
 * `src/core/credits.ts` — los créditos de mantenimiento (PRD §41,
 * decisión 85) como lógica pura: sin Supabase, sin Next.js, sin React
 * (CLAUDE.md).
 *
 * La autoridad es el servidor: el saldo, el porcentaje de la barra y el
 * plazo los calcula la base (`establishment_credit_balance()`,
 * `credit_execution_sla_hours()`) y aquí no se decide nada que cobre. Lo
 * que vive aquí es cómo se **escribe** una cantidad de créditos, qué tramo
 * de plazo se le enseña al cliente y si una solicitud cabe, para que las
 * pantallas no repitan la cuenta cada una a su manera.
 *
 * Todas las cantidades van en **medios créditos enteros**, como en la base
 * (RN-CRE-04): 7 son 3,5 créditos. Nada de decimales en coma flotante.
 */

/** RN-CRE-05 · lo que cuesta procesar una solicitud: 0,5 créditos. */
export const PROCESSING_HALF = 1;

/**
 * RN-CRE-04 · escribe una cantidad de medios créditos como la lee una
 * persona en España: "3,5", "20", "0,5". Sin unidad: la pone quien la
 * enseña.
 */
export function formatCredits(half: number): string {
  if (!Number.isInteger(half) || half < 0) {
    throw new RangeError(`Cantidad de medios créditos no válida: ${half}`);
  }
  const whole = Math.floor(half / 2);
  return half % 2 === 0 ? String(whole) : `${whole},5`;
}

/**
 * RN-CRE-16 · el mismo redondeo que el servidor: el entero más cercano,
 * sin pasar de 100. Sirve para enseñar cuánto del plan va a usar una
 * solicitud **antes** de aceptarla (RN-CRE-11); la barra de lo ya gastado
 * la da el servidor.
 */
export function percentOfPlan(half: number, includedHalf: number): number | null {
  if (includedHalf <= 0) return null;
  return Math.min(100, Math.round((Math.max(0, half) * 100) / includedHalf));
}

/**
 * RN-CRE-18 · el plazo de ejecución en horas laborables según los créditos
 * de la solicitud. Espejo de `credit_execution_sla_hours()`: si cambia uno,
 * cambia el otro, y los tests de los dos lo vigilan. `null` por encima de
 * 20 créditos (RN-CRE-19): lo fija el equipo.
 */
export function creditExecutionSlaHours(half: number): number | null {
  if (!Number.isInteger(half) || half < 1) return null;
  if (half <= 8) return 48;
  if (half <= 20) return 72;
  if (half <= 30) return 96;
  if (half <= 40) return 120;
  return null;
}

/**
 * RN-CRE-18 · lo que ve el cliente: "de 1 a N días laborables". Siempre
 * empieza en 1 y acaba en el máximo del tramo (24 h laborables por día).
 */
export function clientSlaRange(half: number): { minDays: number; maxDays: number } | null {
  const hours = creditExecutionSlaHours(half);
  return hours === null ? null : { minDays: 1, maxDays: hours / 24 };
}

/** Una partida del desglose de una solicitud (RN-CRE-05). */
export type CreditItem = {
  readonly description: string;
  readonly creditsHalf: number;
};

/**
 * RN-CRE-05 · lo que suma un desglose: los 0,5 de procesamiento, una sola
 * vez, más las partidas. Es la misma cuenta que exige el servidor para
 * aceptar un desglose (`assert_credit_breakdown_internal()`).
 */
export function breakdownTotal(items: readonly CreditItem[]): number {
  return PROCESSING_HALF + items.reduce((sum, item) => sum + item.creditsHalf, 0);
}

/**
 * RN-CRE-14 · qué puede hacer el restaurante con una solicitud según lo
 * que le queda:
 *
 * - `accept`: cabe y la acepta.
 * - `choose`: no cabe ahora pero sí en un ciclo entero: quitar cosas,
 *   esperar al ciclo siguiente o pedir presupuesto.
 * - `quote_or_trim`: no cabe ni en un ciclo entero; esperar no sirve.
 * - `quote`: su plan no incluye créditos (Básico o sin plan): presupuesto.
 */
export type CreditFit = "accept" | "choose" | "quote_or_trim" | "quote";

export function creditFit(neededHalf: number, remainingHalf: number, includedHalf: number): CreditFit {
  if (includedHalf <= 0) return "quote";
  if (neededHalf <= remainingHalf) return "accept";
  if (neededHalf <= includedHalf) return "choose";
  return "quote_or_trim";
}

/**
 * Qué camino sigue una solicitud al enviarse (PRD §41). Mientras convivan
 * los planes por categorías y los de créditos (Cuotly es multiempresa y el
 * catálogo cambia por partes), lo decide el plan del restaurante:
 *
 * - Una **incidencia** no se valora: va al equipo por su camino
 *   (RN-REQ-11, RN-CRE-07).
 * - Un plan con **créditos** se valora en créditos (RN-CRE-09).
 * - Un plan con **cambios por categoría** sigue con las categorías de §10.
 * - Sin plan, o con un plan que no incluye nada (el Básico): créditos,
 *   que es lo que ve el restaurante como coste aunque vaya a presupuesto
 *   (RN-CRE-07).
 */
export type ValuationMode = "credits" | "categories" | "incident";

export function valuationMode(input: {
  readonly kind: string;
  readonly plan: { readonly creditsHalf: number; readonly categoryUnits: number } | null;
}): ValuationMode {
  if (input.kind === "incident") return "incident";
  if (input.plan === null) return "credits";
  if (input.plan.creditsHalf > 0) return "credits";
  if (input.plan.categoryUnits > 0) return "categories";
  return "credits";
}

/**
 * RN-CRE-11 y RN-CRE-16 · lo que ve el restaurante antes de aceptar una
 * solicitud: cuánto de su plan usará, cuánto le quedará si acepta, qué
 * puede hacer y en cuánto se hace. Sin plan con créditos no hay
 * porcentajes: solo el camino del presupuesto (RN-CRE-07).
 */
export type CreditCostView = {
  readonly percentOfPlan: number | null;
  readonly remainingAfterPercent: number | null;
  readonly fit: CreditFit;
  readonly slaRange: { minDays: number; maxDays: number } | null;
};

export function creditCostView(
  neededHalf: number,
  balance: { readonly includedHalf: number; readonly remainingHalf: number } | null,
): CreditCostView {
  const includedHalf = balance?.includedHalf ?? 0;
  const remainingHalf = balance?.remainingHalf ?? 0;
  const fit = creditFit(neededHalf, remainingHalf, includedHalf);
  return {
    percentOfPlan: percentOfPlan(neededHalf, includedHalf),
    remainingAfterPercent:
      fit === "accept" ? percentOfPlan(remainingHalf - neededHalf, includedHalf) : null,
    fit,
    slaRange: clientSlaRange(neededHalf),
  };
}

/**
 * Lee el desglose guardado (`requests.credit_breakdown`,
 * `{"items": [{"description", "credits_half"}]}`). Lo que no tenga esa
 * forma se ignora partida a partida: la pantalla enseña lo que hay, no lo
 * inventa (CLAUDE.md, sin datos de relleno).
 */
export function parseCreditBreakdown(value: unknown): CreditItem[] {
  if (typeof value !== "object" || value === null) return [];
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((raw): CreditItem[] => {
    if (typeof raw !== "object" || raw === null) return [];
    const { description, credits_half: half } = raw as { description?: unknown; credits_half?: unknown };
    if (typeof description !== "string" || description.trim() === "") return [];
    if (typeof half !== "number" || !Number.isInteger(half) || half < 1) return [];
    return [{ description: description.trim(), creditsHalf: half }];
  });
}

/**
 * Lo que escribe el equipo en el formulario ("2,5", "2.5", "3") en medios
 * créditos; `null` si no es un múltiplo positivo de 0,5 (RN-CRE-04). El
 * servidor lo vuelve a comprobar.
 */
export function parseCreditsInput(text: string): number | null {
  const normal = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normal)) return null;
  const half = Number(normal) * 2;
  return Number.isInteger(half) && half >= 1 ? half : null;
}

/**
 * RN-CRE-10 · cuando el equipo fija o corrige los créditos escribe el
 * total, no las partidas. Si el total coincide con un desglose que ya
 * existía (el vigente o el que propuso la IA), se conserva, para que el
 * restaurante siga viendo qué se va a hacer; si no coincide con ninguno,
 * no se inventa uno: se guarda sin desglose y el restaurante lee el
 * resumen. El servidor vuelve a comprobar la suma
 * (`assert_credit_breakdown_internal()`).
 */
export function breakdownMatchingTotal(
  totalHalf: number,
  ...candidates: readonly unknown[]
): { items: { description: string; credits_half: number }[] } | null {
  for (const candidate of candidates) {
    const items = parseCreditBreakdown(candidate);
    if (items.length > 0 && breakdownTotal(items) === totalHalf) {
      return { items: items.map((i) => ({ description: i.description, credits_half: i.creditsHalf })) };
    }
  }
  return null;
}
