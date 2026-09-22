/**
 * El estado de R06 vive aquí y no junto a la acción: un archivo
 * `"use server"` solo puede exportar funciones asíncronas
 * (`src/app/use-server-exports.test.ts`).
 *
 * `values` vuelve con la respuesta porque React 19 vacía el formulario al
 * enviarlo: sin esto, un error se llevaba por delante lo escrito.
 */
export type NewRequestDraftValues = {
  description: string;
  context: string;
  priority: string;
  priorityReason: string;
};

export type NewRequestDraftState = {
  error: string | null;
  values: NewRequestDraftValues;
};

export const EMPTY_NEW_REQUEST_DRAFT: NewRequestDraftValues = {
  description: "",
  context: "",
  priority: "medium",
  priorityReason: "",
};

export const INITIAL_NEW_REQUEST_DRAFT: NewRequestDraftState = {
  error: null,
  values: EMPTY_NEW_REQUEST_DRAFT,
};
