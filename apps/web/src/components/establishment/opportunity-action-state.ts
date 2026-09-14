/**
 * El estado inicial de los formularios de Oportunidades vive aquí y no
 * junto a las acciones por el motivo que explica
 * `src/components/conversation/action-state.ts`: **un archivo
 * `"use server"` solo puede exportar funciones asíncronas**. Exportar de
 * ahí una constante tira el módulo entero al evaluarlo y deja sin
 * funcionar TODAS las acciones del archivo, con la pantalla igual que
 * estaba y un 500 silencioso. Lo vigila
 * `src/app/use-server-exports.test.ts`.
 */
export type OpportunityFormState = { error: string | null; done: boolean };

export const INITIAL_OPPORTUNITY_STATE: OpportunityFormState = { error: null, done: false };
