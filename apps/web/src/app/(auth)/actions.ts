"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { es } from "@/i18n/es";
import { classifySignInError, type SignInFailure } from "@/core/auth-errors";

export type AuthFormState = {
  error: string | null;
};

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
}

/**
 * Registro con correo y contraseña. El login con Google se añade en el
 * Hito 2 (ver docs/PLAN-H1-H2.md).
 */
export async function signUp(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { email, password } = readCredentials(formData);

  if (!email || !password) {
    return { error: es.auth.signup.validationRequired };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { email, password } = readCredentials(formData);

  if (!email || !password) {
    return { error: es.auth.login.validationRequired };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  const motivo = classifySignInError(error);
  if (motivo !== null) {
    /*
      No todo fallo al entrar es una contraseña mal escrita, y decirlo
      cuando no se sabe manda a la persona a arreglar lo que no está roto:
      con la red cortada la pantalla decía "Correo o contraseña
      incorrectos" con la contraseña correcta. Lo clasifica
      `src/core/auth-errors.ts`, con sus tests.

      El mensaje del servidor NO se enseña tal cual: viene en inglés y a
      veces distingue "este correo no existe" de "esta contraseña no vale",
      que es justo lo que no conviene contarle a quien prueba correos.
    */
    return { error: MENSAJE_DE_FALLO[motivo] };
  }

  redirect("/");
}

const MENSAJE_DE_FALLO: Readonly<Record<SignInFailure, string>> = {
  invalid_credentials: es.auth.login.invalidCredentials,
  email_not_confirmed: es.auth.login.emailNotConfirmed,
  rate_limited: es.auth.login.rateLimited,
  unreachable: es.auth.login.unreachable,
  unknown: es.auth.login.unknownError,
};

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
