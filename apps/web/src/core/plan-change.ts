/**
 * Cambio de plan (PRD §6.4, RN-COM-15 a RN-COM-18).
 *
 * Lógica de dominio pura: sin Supabase, sin React, sin red (CLAUDE.md).
 * La misma fórmula vive en `plan_change_proration()` en la base de datos,
 * que es la autoridad; esta mitad existe para poder enseñar el importe
 * antes de confirmar sin inventarlo en la pantalla.
 */

export interface PlanTerms {
  readonly priceCents: number;
  readonly includedSmall: number;
  readonly includedPhoto: number;
  readonly includedMedium: number;
  readonly includedLarge: number;
}

export interface Proration {
  readonly fraction: number;
  readonly differenceCents: number;
  readonly extraSmall: number;
  readonly extraPhoto: number;
  readonly extraMedium: number;
  readonly extraLarge: number;
}

/**
 * RN-COM-18: `fracción_restante = minutos_naturales_restantes / totales`.
 * Minutos NATURALES: no es el reloj laboral, que se usa para los plazos.
 */
export function remainingCycleFraction(
  cycleStart: Date,
  cycleEnd: Date,
  now: Date,
): number {
  const total = cycleEnd.getTime() - cycleStart.getTime();
  if (total <= 0) return 0;
  const remaining = cycleEnd.getTime() - Math.max(now.getTime(), cycleStart.getTime());
  return Math.min(1, Math.max(0, remaining / total));
}

/** Una mejora nunca quita consumos: si sale negativo, es 0. */
function extraUnits(current: number, next: number, fraction: number): number {
  return Math.max(0, Math.ceil((next - current) * fraction));
}

/**
 * RN-COM-15 y RN-COM-18. El importe se devuelve en céntimos, que es lo que
 * significa "redondeada a 2 decimales" en la moneda con la que trabaja
 * todo el esquema.
 */
export function prorateePlanChange(
  current: PlanTerms,
  next: PlanTerms,
  fraction: number,
): Proration {
  return {
    fraction,
    differenceCents: Math.round((next.priceCents - current.priceCents) * fraction),
    extraSmall: extraUnits(current.includedSmall, next.includedSmall, fraction),
    extraPhoto: extraUnits(current.includedPhoto, next.includedPhoto, fraction),
    extraMedium: extraUnits(current.includedMedium, next.includedMedium, fraction),
    extraLarge: extraUnits(current.includedLarge, next.includedLarge, fraction),
  };
}

export type PlanChangeDirection = "upgrade" | "downgrade";

export function planChangeDirection(current: PlanTerms, next: PlanTerms): PlanChangeDirection {
  return next.priceCents > current.priceCents ? "upgrade" : "downgrade";
}

/** RN-COM-04 y RN-COM-05: tres meses, al alta y tras cada cambio voluntario. */
export const COMMITMENT_MONTHS = 3;

/**
 * RN-COM-17: la reducción solo en renovación y solo tras cumplir la
 * permanencia vigente. Devuelve el motivo cuando no se puede, para que la
 * pantalla lo diga en vez de esconder el botón — ocultar un botón no es un
 * control de acceso, y tampoco es una explicación.
 */
export type PlanChangeDecision =
  | { readonly allowed: true; readonly applies: "immediately" | "at_renewal" }
  | { readonly allowed: false; readonly reason: "commitment_not_met" };

export function decidePlanChange(
  current: PlanTerms,
  next: PlanTerms,
  renewalAt: Date,
  commitmentEndsAt: Date | null,
): PlanChangeDecision {
  if (planChangeDirection(current, next) === "upgrade") {
    return { allowed: true, applies: "immediately" };
  }
  if (commitmentEndsAt !== null && renewalAt.getTime() < commitmentEndsAt.getTime()) {
    return { allowed: false, reason: "commitment_not_met" };
  }
  return { allowed: true, applies: "at_renewal" };
}
