/**
 * Estado inicial del alta, fuera del archivo `"use server"` por el motivo
 * de siempre: ese archivo solo puede exportar funciones asíncronas, y una
 * constante tira el módulo entero al evaluarlo dejando su acción muerta
 * sin decir nada (`src/app/use-server-exports.test.ts` lo impide de
 * vuelta).
 */

export type NewEstablishmentState = {
  readonly error: string | null;
};

export const INITIAL_NEW_ESTABLISHMENT: NewEstablishmentState = { error: null };
