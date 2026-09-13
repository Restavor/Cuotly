/**
 * El estado inicial de INITIAL_QUOTE_ACTION vive aquí y no junto a la
 * acción: **un archivo `"use server"` solo puede exportar funciones
 * asíncronas**. Exportar una constante hace que Next.js tire el módulo
 * entero al evaluarlo, y entonces NINGUNA acción de ese archivo funciona.
 * El test que lo impide volver está en `src/app/use-server-exports.test.ts`.
 */
export type QuoteActionState = {
  readonly error: string | null;
  readonly done: boolean;
  readonly notice: string | null;
};

export const INITIAL_QUOTE_ACTION: QuoteActionState = { error: null, done: false, notice: null };
