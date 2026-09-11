import type { NoteState } from "./notes-actions";

/**
 * Vive fuera de `notes-actions.ts` porque un archivo `"use server"` solo
 * puede exportar funciones asíncronas: una constante exportada desde ahí
 * rompe la compilación de Next.js.
 */
export const INITIAL_NOTE: NoteState = { error: null, saved: false };
