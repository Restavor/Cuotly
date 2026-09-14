/**
 * Estados iniciales de las acciones de integraciones, fuera del archivo
 * `"use server"` por el motivo de siempre: ese archivo solo puede exportar
 * funciones asíncronas (`src/app/use-server-exports.test.ts`).
 */

export type IntegrationActionState = {
  readonly error: string | null;
  readonly done: boolean;
};

export const INITIAL_INTEGRATION_ACTION: IntegrationActionState = { error: null, done: false };

/** El nombre de la cookie que ata la vuelta de Google al navegador que salió. */
export const OAUTH_NONCE_COOKIE = "cuotly_oauth_nonce";

/** El parámetro con el que la vuelta de Google (o una acción) le dice a la pantalla qué pasó. */
export const INTEGRATION_FLASH_PARAM = "integracion";
