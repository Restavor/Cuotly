/**
 * El estado de los formularios de Mi cuenta. Vive fuera de `actions.ts`
 * porque un archivo `"use server"` solo puede exportar funciones asíncronas
 * —lo comprueba `src/app/use-server-exports.test.ts`—.
 */
export type AccountFormState = {
  error: string | null;
  done: boolean;
};

export const ACCOUNT_INITIAL_STATE: AccountFormState = { error: null, done: false };
