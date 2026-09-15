/**
 * Estado inicial de las acciones de Ayuda, fuera del archivo `"use server"`
 * por el motivo de siempre (`src/app/use-server-exports.test.ts`).
 */
export type HelpActionState = {
  readonly error: string | null;
  readonly done: boolean;
};

export const INITIAL_HELP_STATE: HelpActionState = { error: null, done: false };
