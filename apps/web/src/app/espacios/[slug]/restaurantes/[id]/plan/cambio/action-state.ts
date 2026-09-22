/**
 * El estado de R24 vive aquí: un archivo `"use server"` solo puede
 * exportar funciones asíncronas (`src/app/use-server-exports.test.ts`).
 */
export type PlanChangeState = { error: string | null; sent: boolean; text: string };

export const INITIAL_PLAN_CHANGE: PlanChangeState = { error: null, sent: false, text: "" };
