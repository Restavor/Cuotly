/**
 * El estado inicial de los formularios de canales, fuera del archivo
 * `"use server"` porque uno de esos solo puede exportar funciones
 * asíncronas (ver `src/app/use-server-exports.test.ts`).
 */
export type ChannelState = { error: string | null; done: boolean };

export const INITIAL_CHANNEL: ChannelState = { error: null, done: false };
