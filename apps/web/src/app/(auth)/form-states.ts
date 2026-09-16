/**
 * Los estados iniciales y los tipos de los formularios de la puerta de
 * entrada (PRD §37, RN-ACC).
 *
 * Viven aquí y no en `actions.ts` por una razón mecánica: un archivo
 * `"use server"` solo puede exportar funciones asíncronas —lo comprueba
 * `src/app/use-server-exports.test.ts`—, y una constante exportada desde
 * ahí rompería la frontera de servidor sin decir por qué.
 */

export type AuthFormState = {
  error: string | null;
};

export type AccessRequestFormState = {
  error: string | null;
  /** A09 · qué campo señalar, uno a uno. */
  fields: readonly string[];
  /** RN-ACC-12 · la única respuesta posible, pase lo que pase por detrás. */
  done: boolean;
};

export const accessRequestInitialState: AccessRequestFormState = {
  error: null,
  fields: [],
  done: false,
};

export type FollowUpReplyState = {
  error: string | null;
  done: boolean;
};

export const followUpReplyInitialState: FollowUpReplyState = { error: null, done: false };

export type PasswordFormState = {
  error: string | null;
};

export const passwordInitialState: PasswordFormState = { error: null };
