/**
 * Estado inicial de las acciones de supervisión, fuera del archivo
 * `"use server"` por el mismo motivo que en el resto del proyecto: ese
 * archivo solo puede exportar funciones asíncronas, y una constante tira
 * el módulo entero al evaluarlo dejando todas sus acciones muertas sin
 * decir nada (`src/app/use-server-exports.test.ts` lo impide de vuelta).
 */
export type TeamState = { error: string | null; done: boolean };

export const INITIAL_TEAM: TeamState = { error: null, done: false };
