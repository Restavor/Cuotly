/**
 * `src/core/cuotly-subscription.ts` — la suscripción de Cuotly de un espacio
 * (PRD §31, RN-SUB; §4.1 a §4.7 de la maestra; Fase 4, Hito 18). Lógica de
 * dominio pura, sin Supabase, sin Next y sin React (CLAUDE.md).
 *
 * Es la otra cara de `finance.ts`: allí un espacio le cobra a sus
 * restaurantes; aquí el propietario del espacio le paga a Cuotly. Las
 * cuentas son las mismas —un libro con signo, un estado que se deriva, una
 * fracción natural del periodo— con otro pagador.
 *
 * Qué decide este archivo:
 *
 *   · **El catálogo de los dos planes** (RN-SUB-01) y **las constantes**
 *     del apartado, duplicados a propósito con `cuotly_plan_terms()` y
 *     `cuotly_constant()` de la migración 90. Son dos sistemas que no
 *     pueden importarse el uno al otro, y `listas-compartidas.test.ts`
 *     vigila que no se separen.
 *   · **Los límites** de cada modo (RN-SUB-03), la misma cuenta que
 *     `cuotly_space_limits()`: lo incluido más los adicionales en Pro, sin
 *     límite en Agency, dos establecimientos en la prueba, y el menor de
 *     los dos cuando hay un cambio a Pro programado (RN-SUB-10).
 *   · **Los cinco avisos** de §4.5 como horas respecto al vencimiento
 *     (RN-SUB-07), y **cuándo se corta** (RN-SUB-05, RN-SUB-08).
 *   · **El estado de un cobro** (RN-SUB-06) y **la parte proporcional** de
 *     una mejora o de un adicional (RN-SUB-04, RN-SUB-10).
 *
 * Lo que NO está aquí: el control de acceso, los cobros, el libro y el
 * corte de verdad —todo eso lo hace la base de datos (migración 90) y lo
 * comprueba `plataforma_suscripcion_de_cuotly.sql`—. Lo de aquí es la misma
 * cuenta, para que la pantalla no ofrezca lo que el servidor va a rechazar.
 */

import type { CuotlyPlan } from "./space-requests";

export type { CuotlyPlan } from "./space-requests";

/** §4.1 y §4.2, en céntimos. `null` es "ilimitado" o "no aplica". */
export interface CuotlyPlanTerms {
  readonly priceCents: number;
  readonly includedEstablishments: number | null;
  readonly includedUsers: number | null;
  readonly storageGb: number;
  readonly extraEstablishmentCents: number | null;
  readonly extraUserCents: number | null;
}

export const CUOTLY_PLAN_TERMS: Readonly<Record<CuotlyPlan, CuotlyPlanTerms>> = {
  pro: {
    priceCents: 14900,
    includedEstablishments: 5,
    includedUsers: 5,
    storageGb: 20,
    extraEstablishmentCents: 2500,
    extraUserCents: 1500,
  },
  agency: {
    priceCents: 49900,
    includedEstablishments: null,
    includedUsers: null,
    storageGb: 100,
    extraEstablishmentCents: null,
    extraUserCents: null,
  },
};

/** Los enteros del apartado, con nombre. El mismo espejo que `cuotly_constant()`. */
export const CUOTLY_CONSTANTS = {
  /** §4.4 */
  trial_days: 7,
  /** §4.4 */
  trial_max_establishments: 2,
  /** §4.6 */
  grace_hours: 72,
  /** §4.4 y §4.6 */
  reactivation_days: 30,
  /** RN-SUB-11 */
  charge_lead_days: 7,
  /** RN-SUB-01, "+ IVA" */
  tax_rate_percent: 21,
} as const;

/**
 * RN-SUB-02 · los modos de `spaces.cuotly_status`. Eran cuatro hasta el
 * Hito 20, que añadió el quinto: §127 deja a un propietario terminar su
 * espacio, y eso es un modo más y no un estado paralelo (RN-CIC-07). Así
 * hereda sin tocar nada la solo lectura de RN-SUB-08.
 */
export const SPACE_CUOTLY_STATES = [
  "trial",
  "active",
  "archived_trial_ended",
  "archived_nonpayment",
  "archived_by_owner",
] as const;
export type SpaceCuotlyState = (typeof SPACE_CUOTLY_STATES)[number];

/**
 * RN-SUB-08 + RN-CIC-07 · los tres modos de solo lectura. Espejo de
 * `space_status_is_archived()`; lo vigila `listas-compartidas.test.ts`.
 */
export function isSpaceReadOnly(state: SpaceCuotlyState | null): boolean {
  return (
    state === "archived_trial_ended" ||
    state === "archived_nonpayment" ||
    state === "archived_by_owner"
  );
}

export interface SubscriptionShape {
  readonly plan: CuotlyPlan;
  readonly extraEstablishments: number;
  readonly extraUsers: number;
  readonly pendingPlan: CuotlyPlan | null;
  readonly pendingExtraEstablishments: number;
  readonly pendingExtraUsers: number;
}

export interface SpaceLimits {
  readonly maxEstablishments: number | null;
  readonly maxUsers: number | null;
}

function planLimit(included: number | null, extras: number): number | null {
  return included === null ? null : included + extras;
}

function lesser(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

/**
 * RN-SUB-03 y RN-SUB-10 · la misma cuenta que `cuotly_space_limits()`.
 * Sin suscripción (los espacios anteriores al Hito 17) no hay límite.
 */
export function spaceLimits(
  subscription: SubscriptionShape | null,
  state: SpaceCuotlyState | null,
): SpaceLimits {
  if (subscription === null) return { maxEstablishments: null, maxUsers: null };

  const terms = CUOTLY_PLAN_TERMS[subscription.plan];
  let maxEstablishments = planLimit(terms.includedEstablishments, subscription.extraEstablishments);
  let maxUsers = planLimit(terms.includedUsers, subscription.extraUsers);

  if (subscription.pendingPlan !== null) {
    const pending = CUOTLY_PLAN_TERMS[subscription.pendingPlan];
    maxEstablishments = lesser(
      maxEstablishments,
      planLimit(pending.includedEstablishments, subscription.pendingExtraEstablishments),
    );
    maxUsers = lesser(maxUsers, planLimit(pending.includedUsers, subscription.pendingExtraUsers));
  }

  if (state === "trial") {
    maxEstablishments = lesser(maxEstablishments, CUOTLY_CONSTANTS.trial_max_establishments);
  }

  return { maxEstablishments, maxUsers };
}

/** RN-SUB-03 · si cabe uno más. `null` de límite es "siempre cabe". */
export function fitsLimit(current: number, limit: number | null): boolean {
  return limit === null || current < limit;
}

/** RN-SUB-01 y RN-SUB-04 · la base de una mensualidad: plan más adicionales. */
export function monthlyBaseCents(plan: CuotlyPlan, extraEstablishments: number, extraUsers: number): number {
  const terms = CUOTLY_PLAN_TERMS[plan];
  return (
    terms.priceCents +
    (terms.extraEstablishmentCents ?? 0) * extraEstablishments +
    (terms.extraUserCents ?? 0) * extraUsers
  );
}

/** RN-FIN-08 aplicada a Cuotly: base, impuesto y total. Decisión 7: en céntimos. */
export function cuotlyChargeAmounts(baseCents: number): {
  readonly baseCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
} {
  const taxCents = Math.round((baseCents * CUOTLY_CONSTANTS.tax_rate_percent) / 100);
  return { baseCents, taxCents, totalCents: baseCents + taxCents };
}

/** RN-COM-18, aplicada a Cuotly: fracción NATURAL restante del periodo. */
export function remainingPeriodFraction(periodStart: Date, periodEnd: Date, now: Date): number {
  const total = periodEnd.getTime() - periodStart.getTime();
  if (total <= 0) return 0;
  const remaining = periodEnd.getTime() - Math.max(now.getTime(), periodStart.getTime());
  return Math.min(1, Math.max(0, remaining / total));
}

/** RN-SUB-04 y RN-SUB-10 · la parte proporcional, redondeada a céntimos (decisión 7). */
export function prorationCents(differenceCents: number, fraction: number): number {
  return Math.max(0, Math.round(differenceCents * fraction));
}

/** RN-SUB-10 · Pro → Agency inmediato; Agency → Pro en la renovación. */
export type PlanChangeKind = "immediate" | "at_renewal" | "none";

export function planChangeKind(current: CuotlyPlan, next: CuotlyPlan): PlanChangeKind {
  if (current === next) return "none";
  return next === "agency" ? "immediate" : "at_renewal";
}

/** RN-SUB-07 · los cinco avisos de §4.5, como horas respecto al vencimiento. */
export const CUOTLY_PAYMENT_REMINDERS = [
  { event: "cuotly_payment_due_soon", offsetHours: -72 },
  { event: "cuotly_payment_due_today", offsetHours: 0 },
  { event: "cuotly_payment_overdue_24h", offsetHours: 24 },
  { event: "cuotly_payment_overdue_48h", offsetHours: 48 },
  { event: "cuotly_payment_final_notice", offsetHours: 60 },
] as const;
export type CuotlyReminderEvent = (typeof CUOTLY_PAYMENT_REMINDERS)[number]["event"];

const HOUR_MS = 60 * 60 * 1000;

/** Qué avisos tocan ya para un cobro con deuda viva. Cada uno se manda una vez (CA-17). */
export function remindersDue(dueAt: Date, now: Date): readonly CuotlyReminderEvent[] {
  return CUOTLY_PAYMENT_REMINDERS.filter(
    (r) => now.getTime() >= dueAt.getTime() + r.offsetHours * HOUR_MS,
  ).map((r) => r.event);
}

/**
 * RN-SUB-05 y RN-SUB-08 · cuándo se archiva un espacio con un cobro sin
 * pagar: la prueba, al vencer (§4.4 no da gracia); la suscripción activa, a
 * las 72 h (§4.6).
 */
export function archiveAt(dueAt: Date, state: "trial" | "active"): Date {
  const grace = state === "trial" ? 0 : CUOTLY_CONSTANTS.grace_hours;
  return new Date(dueAt.getTime() + grace * HOUR_MS);
}

/** RN-SUB-09 · hasta cuándo el pago reactiva solo. */
export function reactivationDeadline(archivedAt: Date): Date {
  return new Date(archivedAt.getTime() + CUOTLY_CONSTANTS.reactivation_days * 24 * HOUR_MS);
}

/** RN-SUB-06 · `pending` · `declared` · `paid` · `overdue`, la misma cuenta que `cuotly_charge_status()`. */
export type CuotlyChargeStatus = "pending" | "declared" | "paid" | "overdue";

export function cuotlyChargeStatus(input: {
  readonly outstandingCents: number;
  readonly hasPendingDeclaration: boolean;
  readonly dueAt: Date;
  readonly now: Date;
}): CuotlyChargeStatus {
  if (input.outstandingCents <= 0) return "paid";
  if (input.hasPendingDeclaration) return "declared";
  if (input.dueAt.getTime() < input.now.getTime()) return "overdue";
  return "pending";
}

/** §4.5 · transferencia o Bizum. Los mismos dos que `finance.ts`. */
export const CUOTLY_PAYMENT_METHODS = ["transfer", "bizum"] as const;
export type CuotlyPaymentMethod = (typeof CUOTLY_PAYMENT_METHODS)[number];

export function isCuotlyPaymentMethod(value: string): value is CuotlyPaymentMethod {
  return (CUOTLY_PAYMENT_METHODS as readonly string[]).includes(value);
}
