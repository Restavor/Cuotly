/** Los resultados de las acciones de Plan y pagos (un archivo `"use server"` solo exporta funciones asíncronas). */
export type BillingFeedback =
  | { readonly ok: true; readonly message: string | null }
  | { readonly ok: false; readonly message: string };
