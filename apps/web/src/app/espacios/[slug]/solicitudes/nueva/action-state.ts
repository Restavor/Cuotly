/**
 * El estado de M77 vive aquí y no junto a la acción: un archivo
 * `"use server"` solo puede exportar funciones asíncronas
 * (`src/app/use-server-exports.test.ts`).
 *
 * `values` vuelve con la respuesta porque React 19 vacía el formulario al
 * enviarlo: sin esto, un error se llevaba por delante lo escrito.
 */
export type OnBehalfRequestValues = {
  establishmentId: string;
  /** RN-REQ-09 · `change` o `incident`. */
  kind: string;
  description: string;
  context: string;
  category: string;
  priority: string;
  priorityReason: string;
  onBehalfReason: string;
};

export type OnBehalfRequestState = {
  error: string | null;
  values: OnBehalfRequestValues;
};

export function initialOnBehalfRequestState(establishmentId: string): OnBehalfRequestState {
  return {
    error: null,
    values: {
      establishmentId,
      kind: "change",
      description: "",
      context: "",
      category: "",
      priority: "medium",
      priorityReason: "",
      onBehalfReason: "",
    },
  };
}
