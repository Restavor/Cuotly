/**
 * El estado del formulario de justificante, en su propio archivo porque
 * `actions.ts` lleva `"use server"` y ahí solo pueden exportarse funciones
 * asíncronas: exportar una constante mata todas las acciones del archivo
 * al evaluarse el módulo.
 */
export type ReceiptState = { readonly error: string | null; readonly done: boolean };

export const INITIAL_RECEIPT: ReceiptState = { error: null, done: false };

/** §84 · el estado de aceptar o rechazar un presupuesto, por la misma razón. */
export type QuoteAnswerState = { readonly error: string | null; readonly done: boolean; readonly notice: string | null };

export const INITIAL_QUOTE_ANSWER: QuoteAnswerState = { error: null, done: false, notice: null };
