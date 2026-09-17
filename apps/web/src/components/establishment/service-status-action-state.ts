/**
 * El estado inicial de los formularios del bloque "Estado del servicio"
 * vive aquí y no junto a las acciones por el motivo de siempre: **un
 * archivo `"use server"` solo puede exportar funciones asíncronas**.
 * Exportar de ahí una constante tira el módulo entero al evaluarlo y deja
 * sin funcionar TODAS sus acciones, con la pantalla igual que estaba y un
 * 500 silencioso. Lo vigila `src/app/use-server-exports.test.ts`.
 */
export type ServiceStatusState = { error: string | null; done: boolean };

export const INITIAL_SERVICE_STATUS: ServiceStatusState = { error: null, done: false };
