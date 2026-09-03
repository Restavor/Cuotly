/**
 * El estado inicial de las acciones de tarea, aparte de las acciones
 * mismas por la razón que explica `action-state.ts`: **un archivo
 * `"use server"` solo puede exportar funciones asíncronas**. Exportar aquí
 * la constante es lo que impide que `tasks-actions.ts` se caiga entero al
 * evaluarlo, dejando todos sus formularios sin efecto y sin error visible.
 *
 * Lo vigila `src/app/use-server-exports.test.ts`.
 */
export type TaskActionState = { error: string | null; done: boolean };

export const INITIAL_TASK_ACTION: TaskActionState = { error: null, done: false };
