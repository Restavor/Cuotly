/**
 * Estado inicial de las acciones de HU-07, fuera del archivo `"use server"`
 * por el mismo motivo que en el resto del proyecto: ese archivo solo puede
 * exportar funciones asíncronas, y una constante tira el módulo entero al
 * evaluarlo dejando todas sus acciones muertas sin decir nada
 * (`src/app/use-server-exports.test.ts` lo impide de vuelta).
 */

/**
 * El prorrateo que devuelve `plan_change_preview()` (RN-COM-18). Se enseña
 * antes de confirmar: cobrar sin haber dicho cuánto es justo lo que P6
 * prohíbe. Los números son del servidor; aquí no se recalcula ninguno.
 */
export type PlanChangePreview = {
  readonly differenceCents: number;
  readonly fractionPercent: number;
  readonly extraSmall: number;
  readonly extraPhoto: number;
  readonly extraMedium: number;
  readonly extraLarge: number;
  readonly targetPlanId: string;
};

export type PlansState = {
  readonly error: string | null;
  readonly done: boolean;
  readonly preview: PlanChangePreview | null;
};

export const INITIAL_PLANS: PlansState = { error: null, done: false, preview: null };
