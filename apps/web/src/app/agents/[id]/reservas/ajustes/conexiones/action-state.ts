/** El resultado de guardar los canales de aviso. Vive aquí: un archivo `"use server"` solo exporta funciones asíncronas. */
export type NoticeChannelsFeedback = { readonly ok: true } | { readonly ok: false; readonly message: string };
