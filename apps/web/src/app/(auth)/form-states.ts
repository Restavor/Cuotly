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

/** Lo que la persona escribió, tal cual lo mandó. */
export type AccessRequestValues = {
  contact_name: string;
  business_name: string;
  phone: string;
  email: string;
  /** Decisión 67 · el DNI, CIF o NIF, tal como lo escribió. */
  tax_id: string;
  comments: string;
};

export type AccessRequestFormState = {
  error: string | null;
  /** A09 · qué campo señalar, uno a uno. */
  fields: readonly string[];
  /** A09 · y qué le pasa a cada uno: falta, o está mal escrito. */
  problems: Partial<Record<"contact_name" | "business_name" | "phone" | "email" | "tax_id", "missing" | "invalid">>;
  /** RN-ACC-12 · la única respuesta posible, pase lo que pase por detrás. */
  done: boolean;
  /**
   * A10 · lo escrito vuelve con la respuesta. React 19 vacía el formulario
   * después de cada envío, así que "tus datos siguen en el formulario" solo
   * es verdad si la pantalla los vuelve a poner. Y A01 los enseña en
   * "Datos de tu solicitud": son los que la persona acaba de escribir, no
   * nada que conteste la base (RN-ACC-12).
   */
  values: AccessRequestValues;
};

export const emptyAccessRequestValues: AccessRequestValues = {
  contact_name: "",
  business_name: "",
  phone: "",
  email: "",
  tax_id: "",
  comments: "",
};

export const accessRequestInitialState: AccessRequestFormState = {
  error: null,
  fields: [],
  problems: {},
  done: false,
  values: emptyAccessRequestValues,
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
