/** El resultado de pedir una recarga (un archivo `"use server"` solo exporta funciones asíncronas). */
export type TopupFeedback =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly message: string };
