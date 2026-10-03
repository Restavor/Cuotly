/**
 * Errores de negocio como tipos de resultado explícitos, no como excepciones genéricas
 * (CLAUDE.md, estilo de código). Misma forma que `apps/web/src/core/result.ts`.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
