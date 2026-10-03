/** Los resultados de las acciones de la ficha de Reservas (un archivo `"use server"` solo exporta funciones asíncronas). */
export type SheetFeedback =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly message: string };
