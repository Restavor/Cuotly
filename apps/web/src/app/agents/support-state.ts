/** Los resultados de las acciones de soporte (un archivo `"use server"` solo exporta funciones asíncronas). */
export type SupportFeedback =
  | { readonly ok: true; readonly message: string | null; readonly href: string }
  | { readonly ok: false; readonly message: string };
