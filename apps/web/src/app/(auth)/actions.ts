"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { es } from "@/i18n/es";
import { accessRequestFieldProblems, accessRequestSubmitFailure } from "@/core/access-requests";
import { classifySignInError, signInFailureMessage } from "@/core/auth-errors";

import type {
  AccessRequestFormState,
  AuthFormState,
  FollowUpReplyState,
  PasswordFormState,
} from "./form-states";

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
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
    return { error: signInFailureMessage(motivo) };
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------------
// PRD §37 (RN-ACC) · las dos puertas, y el registro abierto que ya no está
//
// Aquí ya no hay `signUp()`. Desde la decisión 41 (16/09/2026) nadie se
// crea una cuenta por su cuenta: se solicita acceso y la cuenta llega al
// aprobarlo (RN-ACC-03), o se recibe una invitación, que ya es la
// autorización (RN-ACC-09). El cierre de verdad no está en este archivo
// —quien crea filas en `auth.users` es GoTrue— sino en `[auth]
// enable_signup = false` de `supabase/config.toml`, y lo vigila
// `src/core/registro-cerrado.test.ts`, que además exige que el proveedor
// de correo siga ENCENDIDO: apagarlo no cierra ninguna puerta y deja a
// todo el mundo fuera.
// ---------------------------------------------------------------------

/**
 * RN-ACC-02 · el formulario público, que ocupa el lugar del registro.
 *
 * Contesta siempre lo mismo. La función de la base devuelve `void` a
 * propósito y aquí no se añade ninguna distinción: si esta acción dijera
 * "ese correo ya tiene cuenta", el formulario sería un oráculo y bastaría
 * con escribir direcciones ajenas para saber quién está en Cuotly
 * (RN-ACC-12). Quien se entera de lo que pasó es la dirección, por correo.
 */
export async function requestAccess(
  _prevState: AccessRequestFormState,
  formData: FormData,
): Promise<AccessRequestFormState> {
  const contactName = String(formData.get("contact_name") ?? "").trim();
  const businessName = String(formData.get("business_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const comments = String(formData.get("comments") ?? "").trim();

  const values = {
    contact_name: contactName,
    business_name: businessName,
    phone,
    email,
    comments,
  };

  // A09 · los campos mal rellenados se señalan uno a uno, y todos a la vez.
  // La comprobación es la de `core/access-requests.ts`, la misma expresión
  // del correo que usa la pantalla del teléfono: escrita dos veces se
  // separaría.
  const problems = accessRequestFieldProblems({ contactName, businessName, phone, email });
  const fields = Object.keys(problems);
  if (fields.length > 0) {
    const soloCorreo = fields.length === 1 && problems.email === "invalid";
    const texto = soloCorreo ? es.auth.signup.validationEmail : es.auth.signup.validationRequired;
    return { error: texto, fields, problems, done: false, values };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_access_request", {
    p_contact_name: contactName,
    p_business_name: businessName,
    p_phone: phone,
    p_email: email,
    p_comments: comments === "" ? undefined : comments,
  });

  if (error) {
    // A11 · si el envío falla, lo escrito no se pierde y se puede
    // reintentar. La acción no redirige, así que el formulario conserva
    // sus valores y la persona vuelve a pulsar.
    const motivo = accessRequestSubmitFailure(error.message);
    return {
      error: motivo === "unreachable" ? es.auth.signup.unreachable : es.auth.signup.unknownError,
      fields: [],
      problems: {},
      done: false,
      values,
    };
  }

  return { error: null, fields: [], problems: {}, done: true, values };
}

/**
 * RN-ACC-05 y RN-ACC-12 · quien solicita contesta a "necesita información"
 * por el enlace con clave, sin tener cuenta. La clave es la barrera: la
 * función de la base filtra por ella y no acepta un identificador de
 * solicitud.
 */
export async function replyToAccessRequest(
  _prevState: FollowUpReplyState,
  formData: FormData,
): Promise<FollowUpReplyState> {
  const token = String(formData.get("token") ?? "");
  const reply = String(formData.get("reply") ?? "").trim();

  if (reply === "") {
    return { error: es.auth.followUp.replyRequired, done: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("reply_to_access_request", {
    p_token: token,
    p_reply: reply,
  });

  if (error) {
    return { error: es.auth.signup.unknownError, done: false };
  }

  return { error: null, done: true };
}

/** Lo que las dos puertas comprueban igual antes de crear nada. */
function leerContrasena(formData: FormData): { password: string } | { error: string } {
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");

  if (password.length < 8) return { error: es.auth.setup.tooShort };
  if (password !== repeat) return { error: es.auth.setup.mismatch };
  return { password };
}

/**
 * RN-ACC-03 y RN-ACC-04 · gastar el enlace de un solo uso: se crea la
 * cuenta con el correo **aprobado** —nunca con uno que venga del
 * formulario— y se marca el enlace como gastado en la misma acción.
 *
 * El orden importa y es el que es: primero la cuenta, después el enlace.
 * Si `consume_account_setup_token()` falla —porque el enlace ya se gastó,
 * porque caducó o porque el correo no coincide— se **deshace el alta**, de
 * modo que no queda una cuenta que ninguna puerta autorizó (RN-ACC-01).
 */
export async function completeAccountSetup(
  _prevState: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const token = String(formData.get("token") ?? "");
  const leida = leerContrasena(formData);
  if ("error" in leida) return { error: leida.error };

  const supabase = await createClient();
  const { data, error: detalleError } = await supabase
    .rpc("account_setup_details", { p_token: token })
    .maybeSingle();

  if (detalleError || !data || data.state !== "valid" || !data.email) {
    return { error: es.auth.setup.unknownError };
  }

  const creada = await crearCuenta(data.email, leida.password);
  if ("error" in creada) return { error: creada.error };

  const admin = createAdminClient();
  const { error: consumeError } = await admin.rpc("consume_account_setup_token", {
    p_token: token,
    p_user_id: creada.userId,
  });

  if (consumeError) {
    await admin.auth.admin.deleteUser(creada.userId);
    return { error: es.auth.setup.unknownError };
  }

  const { error: entrarError } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: leida.password,
  });
  if (entrarError) redirect("/login");

  redirect("/");
}

/**
 * RN-ACC-09 · la otra puerta. El correo sale de la invitación, no del
 * formulario: `accept_space_invitation_as()` exige que coincida (migración
 * 7), y por eso la pantalla lo enseña bloqueado.
 */
export async function completeInvitationSignup(
  _prevState: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const token = String(formData.get("token") ?? "");
  const leida = leerContrasena(formData);
  if ("error" in leida) return { error: leida.error };

  const supabase = await createClient();
  const { data, error: detalleError } = await supabase
    .rpc("invitation_signup_details", { p_token: token })
    .maybeSingle();

  if (detalleError || !data || data.state !== "valid" || !data.email || data.has_account) {
    return { error: es.auth.invitation.unknownError };
  }

  const creada = await crearCuenta(data.email, leida.password);
  if ("error" in creada) return { error: creada.error };

  const admin = createAdminClient();
  const { error: aceptarError } = await admin.rpc("accept_space_invitation_as", {
    p_token: token,
    p_user_id: creada.userId,
  });

  if (aceptarError) {
    await admin.auth.admin.deleteUser(creada.userId);
    return { error: es.auth.invitation.unknownError };
  }

  const { error: entrarError } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: leida.password,
  });
  if (entrarError) redirect("/login");

  redirect("/");
}

/**
 * Crear la fila de `auth.users`. Es lo único que la clave de
 * administración hace en toda la puerta de entrada, y solo se llega aquí
 * con un enlace vivo comprobado contra la base.
 *
 * `email_confirm: true` no se salta ninguna verificación: el correo **ya
 * está verificado** por el camino, porque el enlace con el que se llega
 * aquí solo pudo salir de ese buzón.
 */
/**
 * RN-ACC-13 · la tercera puerta: gastar el enlace de una invitación al
 * panel de un restaurante.
 *
 * Es hermana de `completeAccountSetup()` y el orden es el mismo, por la
 * misma razón: **primero la cuenta, después el enlace**. Si
 * `consume_establishment_invitation()` falla —porque ya se gastó, porque
 * caducó, porque el equipo no la aprobó, o porque el restaurante cambió de
 * espacio— se **deshace el alta**, y así no queda una cuenta que ninguna
 * puerta autorizó (RN-ACC-01).
 *
 * El correo NO sale del formulario: sale de la invitación. Lo que el
 * formulario manda es la contraseña y el token, y nada más.
 */
export async function completePanelInvitation(
  _prevState: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const token = String(formData.get("token") ?? "");
  const leida = leerContrasena(formData);
  if ("error" in leida) return { error: leida.error };

  const supabase = await createClient();
  const { data, error: detalleError } = await supabase
    .rpc("establishment_invitation_details", { p_token: token })
    .maybeSingle();

  if (detalleError || !data || data.state !== "valid" || !data.email) {
    return { error: es.auth.panelInvitation.unknownError };
  }

  const creada = await crearCuenta(data.email, leida.password);
  if ("error" in creada) return { error: creada.error };

  const admin = createAdminClient();
  const { error: consumeError } = await admin.rpc("consume_establishment_invitation", {
    p_token: token,
    p_user_id: creada.userId,
  });

  if (consumeError) {
    await admin.auth.admin.deleteUser(creada.userId);
    return { error: es.auth.panelInvitation.unknownError };
  }

  const { error: entrarError } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: leida.password,
  });
  if (entrarError) redirect("/login");

  redirect("/");
}

async function crearCuenta(
  email: string,
  password: string,
): Promise<{ userId: string } | { error: string }> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Sin la clave no se puede crear ninguna cuenta, y eso hay que decirlo
    // con su motivo en vez de fingir un fallo de contraseña (CLAUDE.md).
    return { error: es.auth.setup.unknownError };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) return { error: es.auth.setup.unknownError };
  return { userId: data.user.id };
}
