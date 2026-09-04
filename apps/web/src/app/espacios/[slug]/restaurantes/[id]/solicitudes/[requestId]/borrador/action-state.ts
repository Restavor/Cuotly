/**
 * Los estados iniciales de los formularios de la revisión del borrador.
 * Viven fuera del archivo `"use server"` porque uno de esos archivos solo
 * puede exportar funciones asíncronas; exportar una constante rompe todas
 * sus acciones en silencio (ver `src/app/use-server-exports.test.ts`).
 */
export type DraftScopeState = { error: string | null; saved: boolean; unchanged: boolean };

export const INITIAL_SCOPE: DraftScopeState = { error: null, saved: false, unchanged: false };

export type DraftFileState = { error: string | null; done: boolean };

export const INITIAL_FILE: DraftFileState = { error: null, done: false };

export type DraftSubmitState = { error: string | null };

export const INITIAL_SUBMIT: DraftSubmitState = { error: null };
