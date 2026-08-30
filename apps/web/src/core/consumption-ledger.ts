/**
 * `src/core/consumption-ledger.ts` — lógica de dominio pura del libro de
 * consumos (PRD §12 RN-CON, Hito 5). Sin Supabase, sin Next.js, sin React
 * (CLAUDE.md, regla de estilo de código). La base de datos
 * (supabase/migrations/20260830000020_hito5_consumos.sql, funciones
 * `accept_request()`/`cancel_accepted_request()`) es la autoridad real —
 * el cliente nunca decide un saldo ni una devolución por su cuenta — pero
 * implementa exactamente estas mismas reglas, y este módulo existe para
 * poder probarlas como lógica pura, sin levantar una base de datos, y para
 * que cualquier pantalla que muestre un saldo o explique una cancelación
 * use el mismo cálculo que el servidor, nunca uno inventado en el cliente.
 */

export type ChangeCategory = "small" | "photo" | "medium" | "large";

/** Un apunte del libro, tal como lo guarda `consumption_entries` (RN-DAT-04). */
export type LedgerEntry = {
  readonly amount: number;
};

/**
 * CA-08: "El saldo mostrado siempre es igual a la suma de los apuntes del
 * libro." El saldo de una categoría en un ciclo es la bolsa incluida en
 * ESE ciclo (su instantánea — RN-CON-05/CA-09, nunca la del plan en vivo)
 * más la suma de los apuntes (débitos negativos, devoluciones y créditos
 * compensatorios positivos). Nunca un contador que se actualiza con
 * UPDATE — sumar es la única operación.
 */
export function calculateConsumptionBalance(includedInCycle: number, entries: readonly LedgerEntry[]): number {
  return entries.reduce((balance, entry) => balance + entry.amount, includedInCycle);
}

/** RN-CON-01: un débito consume exactamente una unidad de su categoría. */
export const DEBIT_AMOUNT = -1;
/** RN-CON-08/RN-CON-10: una devolución o un crédito compensatorio suman exactamente una unidad. */
export const CREDIT_AMOUNT = 1;

export type PlanAllowance = {
  readonly includedSmall: number;
  readonly includedPhoto: number;
  readonly includedMedium: number;
  readonly includedLarge: number;
};

/**
 * RN-COM-01/02/12: ¿este plan incluye la categoría del cambio? Básico y
 * "sin plan" no incluyen nada; Impulso no incluye "large" (RN-COM-02).
 * Cuando la respuesta es `false`, el cambio se presupuesta aparte
 * (RN-CON-03: no consume la bolsa) — no es un error, es una decisión de
 * negocio explícita, no un umbral inventado.
 */
export function isCategoryIncludedInPlan(plan: PlanAllowance, category: ChangeCategory): boolean {
  const included: Record<ChangeCategory, number> = {
    small: plan.includedSmall,
    photo: plan.includedPhoto,
    medium: plan.includedMedium,
    large: plan.includedLarge,
  };
  return included[category] > 0;
}

export type CancellationInput = {
  /** `jobs.started_at` — null si "Comenzar" (RN-JOB-03) todavía no se pulsó. */
  readonly jobStartedAt: Date | null;
  /** ¿Esta aceptación generó un apunte de débito (consumió bolsa), o quedó presupuestada aparte? */
  readonly hasDebitEntry: boolean;
  /**
   * ¿El ciclo al que pertenece el débito original sigue siendo el ciclo
   * vigente ahora mismo? (Se compara con
   * `get_or_create_consumption_cycle()` en el servidor — aquí se recibe
   * ya resuelto, porque qué ciclo está "vigente" depende de la fecha de
   * renovación del establecimiento y su zona horaria, RN-DAT-08, que este
   * módulo no calcula: ver la nota de cabecera.)
   */
  readonly originalCycleIsCurrent: boolean;
};

export type CancellationOutcome = {
  /** RN-JOB-04/CA-06: el nuevo estado del trabajo y de la solicitud (RN-REQ-01, mismo nombre). */
  readonly jobState: "cancelled_before_start" | "cancelled_after_start";
  /**
   * RN-CON-08/09/10 · CA-06/CA-07: qué apunte generar, o ninguno.
   * - `null`: después de Comenzar (se mantiene el consumo), o no había
   *   nada que devolver (presupuestado aparte).
   * - `"return"`: antes de Comenzar, el ciclo original sigue vigente.
   * - `"compensatory_credit"`: antes de Comenzar, pero el ciclo original
   *   ya cerró — no se reabre (RN-CON-10), se acredita en el ciclo actual.
   */
  readonly entryType: "return" | "compensatory_credit" | null;
};

/**
 * RN-JOB-04/CA-06/CA-07: decide el efecto de cancelar una solicitud ya
 * aceptada. Misma decisión, mismas condiciones, que
 * `cancel_accepted_request()` en la base de datos — probada aquí como
 * lógica pura para que CA-06/CA-07 tengan cobertura sin necesitar
 * Postgres, y como referencia para cualquier pantalla que anticipe el
 * resultado antes de llamar al servidor (que sigue siendo quien decide de
 * verdad, CLAUDE.md MUST: "el cliente nunca es la autoridad").
 */
export function resolveCancellationOutcome(input: CancellationInput): CancellationOutcome {
  const jobState = input.jobStartedAt === null ? "cancelled_before_start" : "cancelled_after_start";

  if (jobState === "cancelled_after_start" || !input.hasDebitEntry) {
    return { jobState, entryType: null };
  }

  return {
    jobState,
    entryType: input.originalCycleIsCurrent ? "return" : "compensatory_credit",
  };
}
