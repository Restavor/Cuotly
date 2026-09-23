/**
 * Estado inicial de las acciones de HU-07, fuera del archivo `"use server"`
 * por el mismo motivo que en el resto del proyecto: ese archivo solo puede
 * exportar funciones asíncronas, y una constante tira el módulo entero al
 * evaluarlo dejando todas sus acciones muertas sin decir nada
 * (`src/app/use-server-exports.test.ts` lo impide de vuelta).
 */

export type PlansState = {
  readonly error: string | null;
  readonly done: boolean;
};

export const INITIAL_PLANS: PlansState = { error: null, done: false };

/**
 * Maqueta 13 · publicar condiciones y registrar una aceptación externa.
 * Un estado propio, aunque hoy tenga la misma forma: son otro formulario
 * y otra acción.
 */
export type TermsState = { readonly error: string | null; readonly done: boolean };

export const INITIAL_TERMS: TermsState = { error: null, done: false };
