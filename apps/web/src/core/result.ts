/**
 * `src/core/` es la lógica de dominio pura de Cuotly: sin Supabase, sin
 * Next.js, sin React. Solo funciones y tipos que se pueden probar sin
 * levantar nada (CLAUDE.md, regla de estilo de código). Esta primera pieza
 * es el tipo que usa el resto del dominio para representar un error de
 * negocio explícito, en vez de lanzar una excepción genérica.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
