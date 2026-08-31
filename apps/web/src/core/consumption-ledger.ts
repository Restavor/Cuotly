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

// ---------------------------------------------------------------------
// Hito 7 · HU-24 y HU-25: lo que el restaurante ve de su bolsa y lo que
// el administrador ve del libro.
// ---------------------------------------------------------------------

/**
 * El ciclo vigente tal como lo guarda `consumption_cycles`: su bolsa
 * incluida (la instantánea del plan, RN-CON-05/CA-09) y cuándo termina.
 */
export type ConsumptionCycle = {
  readonly includedSmall: number;
  readonly includedPhoto: number;
  readonly includedMedium: number;
  readonly includedLarge: number;
  /** `consumption_cycles.cycle_end`: la fecha de renovación (RN-COM-06). */
  readonly renewsAt: Date;
};

/** Un apunte del ciclo, con su categoría (RN-CON-01). */
export type CategorizedLedgerEntry = LedgerEntry & { readonly category: ChangeCategory };

export type CycleAllowance = {
  readonly remaining: Readonly<Record<ChangeCategory, number>>;
  readonly included: Readonly<Record<ChangeCategory, number>>;
  /** RN-COM-06: los consumos se renuevan en esta fecha y **no se acumulan**. */
  readonly renewsAt: Date;
};

/**
 * HU-24: "ver cuántos cambios de cada categoría me quedan en el ciclo
 * actual y cuándo se renuevan."
 *
 * Cada categoría es su propia bolsa incluida más sus propios apuntes
 * (CA-08: el saldo mostrado siempre es igual a la suma de los apuntes).
 * `renewsAt` es el fin del ciclo tal como está guardado, no un "mismo día
 * del mes que viene" recalculado aquí: el corte de mes depende de la zona
 * horaria del espacio (RN-DAT-08) y lo decide el servidor al crear el
 * ciclo, una sola vez.
 *
 * Una categoría que el plan no incluye vale 0 y no es un error: en Básico
 * todo se presupuesta aparte (RN-COM-01) y en Impulso los cambios grandes
 * también (RN-COM-02). "0 restantes" y "no incluido en tu plan" son cosas
 * distintas — `included` viaja al lado de `remaining` precisamente para
 * que la pantalla pueda decir cuál de las dos es (P6, no inventar datos).
 */
export function cycleAllowance(
  cycle: ConsumptionCycle,
  entries: readonly CategorizedLedgerEntry[],
): CycleAllowance {
  const included: Record<ChangeCategory, number> = {
    small: cycle.includedSmall,
    photo: cycle.includedPhoto,
    medium: cycle.includedMedium,
    large: cycle.includedLarge,
  };

  const remaining: Record<ChangeCategory, number> = {
    small: 0,
    photo: 0,
    medium: 0,
    large: 0,
  };

  for (const category of ["small", "photo", "medium", "large"] as const) {
    remaining[category] = calculateConsumptionBalance(
      included[category],
      entries.filter((entry) => entry.category === category),
    );
  }

  return { remaining, included, renewsAt: cycle.renewsAt };
}

/**
 * HU-25: "ver el libro de consumos de un establecimiento con cada apunte,
 * su motivo y su autor."
 *
 * El motivo de un apunte tiene dos caras que no deben confundirse: **por
 * qué existe** (su `entry_type`, que es dato estructurado y no texto
 * libre) y **qué explicó la persona** (`reason`, que puede faltar en un
 * débito ordinario). Esta función devuelve la primera como identificador
 * estable para el diccionario de i18n, sin inventar un texto cuando no lo
 * hay: si no hay `reason`, se dice que no lo hay (P6), no se rellena con
 * una frase de relleno (CLAUDE.md MUST NOT).
 */
export type LedgerEntryView = {
  readonly reasonKey: "debit" | "return" | "compensatory_credit";
  readonly explanation: string | null;
  readonly authorId: string | null;
  readonly amount: number;
};

export function describeLedgerEntry(entry: {
  readonly entryType: "debit" | "return" | "compensatory_credit";
  readonly reason: string | null;
  readonly createdBy: string | null;
  readonly amount: number;
}): LedgerEntryView {
  return {
    reasonKey: entry.entryType,
    explanation: entry.reason,
    authorId: entry.createdBy,
    amount: entry.amount,
  };
}
