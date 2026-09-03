/**
 * Los estados iniciales de las acciones del calendario, fuera del archivo
 * `"use server"`: ese solo puede exportar funciones asíncronas, y exportar
 * una constante tira el módulo entero al evaluarlo — con lo que ninguna de
 * sus acciones funciona y la pantalla no dice nada. Es exactamente la
 * avería que destapó el recorrido de CA-19, y `use-server-exports.test.ts`
 * la impide de vuelta.
 */
export type CalendarState = { error: string | null; done: boolean };

export const INITIAL_CALENDAR: CalendarState = { error: null, done: false };
