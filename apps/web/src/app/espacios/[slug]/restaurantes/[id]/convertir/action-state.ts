/**
 * El estado inicial vive fuera del archivo `"use server"`: uno de esos
 * archivos solo puede exportar funciones asíncronas, y exportar una
 * constante rompe TODAS sus acciones en silencio. La explicación larga
 * está en `src/components/conversation/action-state.ts` y el barrido que
 * lo impide, en `src/app/use-server-exports.test.ts`.
 */
export type ConvertState = { error: string | null };

export const INITIAL_CONVERT: ConvertState = { error: null };
