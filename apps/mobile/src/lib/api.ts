import type { PostgrestError } from "@supabase/supabase-js";

import { web } from "../i18n/es";

/**
 * Lo que devuelve una acción del servidor a la pantalla: o salió, o un
 * motivo en español. El motivo es el que dice la función del servidor
 * (RN-MOV-03: "lo que un rol no puede hacer no se esconde, se dice"), y
 * no se traduce aquí a un segundo motivo que pueda discrepar.
 */
export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

export function fromError(error: PostgrestError | Error | null): ActionResult {
  if (!error) return { ok: true };
  return { ok: false, error: error.message || web.states.errorDescription };
}

/** Un `data` nulo con error nulo es un fallo que hay que decir, no callar. */
export function must<T>(data: T | null, error: PostgrestError | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error(web.states.errorDescription);
  return data;
}

/** RN-MOV-10 · "ya hecho" no es un error de red que invite a insistir. */
export function isAlreadyDone(message: string): boolean {
  return /ya (se |está |ha |fue )|ya estaba|no está en borrador|no se puede (volver|repetir)/i.test(message);
}
