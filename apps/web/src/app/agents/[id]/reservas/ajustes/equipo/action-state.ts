/** Los resultados de las acciones del Equipo (un archivo `"use server"` solo exporta funciones asíncronas). */
export type TeamFeedback =
  | { readonly ok: true; readonly message: string | null }
  | { readonly ok: false; readonly message: string; readonly field?: "name" | "pin" | "pinRepeat" | "email" };
