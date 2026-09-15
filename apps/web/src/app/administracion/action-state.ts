/**
 * Estado inicial de las acciones del panel, fuera del archivo `"use server"`
 * por el motivo de siempre: ese archivo solo puede exportar funciones
 * asíncronas (`src/app/use-server-exports.test.ts`).
 */
export type AdminActionState = {
  readonly error: string | null;
  readonly done: boolean;
};

export const INITIAL_ADMIN_STATE: AdminActionState = { error: null, done: false };
