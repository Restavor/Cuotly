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
