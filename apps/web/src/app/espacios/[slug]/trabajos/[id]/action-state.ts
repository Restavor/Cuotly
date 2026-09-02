/**
 * El estado inicial de INITIAL_JOB_ACTION vive aquí y no junto a la acción, y no es
 * una manía de organización: **un archivo `"use server"` solo puede
 * exportar funciones asíncronas**. Exportar una constante hace que Next.js
 * tire el módulo entero al evaluarlo, con
 * "A \"use server\" file can only export async functions, found object",
 * y entonces NINGUNA acción de ese archivo funciona: el formulario envía,
 * el servidor devuelve un 500 y `useActionState` deja la pantalla igual
 * que estaba. Se ve como si no hubiera pasado nada.
 *
 * Así estaban cinco archivos de acciones —mensajes, trabajos, solicitudes,
 * finanzas y correcciones—, o sea casi todo lo que ESCRIBE en la
 * aplicación. Lo destapó el recorrido de CA-19 en un móvil, y el test que
 * lo impide volver está en `src/app/use-server-exports.test.ts`.
 */
export type JobActionState = { error: string | null; done: boolean };

export const INITIAL_JOB_ACTION: JobActionState = { error: null, done: false };
