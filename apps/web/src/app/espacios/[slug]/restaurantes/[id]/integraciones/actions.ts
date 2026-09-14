"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { isIntegrationProvider } from "@/core/integrations";
import { es } from "@/i18n/es";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { VAULT_KEY_ENV, createCredentialVault, vaultIsConfigured } from "@/services/credential-vault";
import {
  OAUTH_STATE_TTL_MS,
  authorizationUrl,
  googleOAuthConfig,
  isOAuthProvider,
  newNonce,
  signOAuthState,
} from "@/services/google-oauth";
import { storeEncryptedCredential } from "@/services/integration-gateway";

import { INTEGRATION_FLASH_PARAM, OAUTH_NONCE_COOKIE, type IntegrationActionState } from "./action-state";

/**
 * Las acciones del bloque de integraciones (RN-INT-02, RN-INT-05, RN-INT-06).
 *
 * **Ninguna autoriza nada.** Quién puede conectar, comprobar o desconectar
 * lo decide `assert_can_manage_integrations()` dentro de cada función de
 * la base, con la sesión de la persona; guardar una credencial pasa por
 * `store_integration_credential()`, reservada a `service_role`, que
 * comprueba el permiso del actor como si fuera él (§126). Enviar estos
 * formularios con otra sesión, o llamar a las RPC a pelo, falla igual.
 *
 * Lo que sí hacen estas acciones, y solo puede hacer el servidor: cifrar la
 * clave antes de guardarla (`credential-vault.ts`) y firmar el `state`
 * con el que se manda a la persona a Google.
 */

function campo(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre);
  return typeof valor === "string" ? valor.trim() : "";
}

function mensajeDeFallo(fallo: unknown): string {
  return fallo instanceof Error ? fallo.message : String(fallo);
}

function conFlash(returnTo: string, flash: string): string {
  const separador = returnTo.includes("?") ? "&" : "?";
  return `${returnTo}${separador}${INTEGRATION_FLASH_PARAM}=${flash}`;
}

/** El origen de la aplicación, para la dirección de vuelta de Google. */
async function origen(): Promise<string> {
  const configurado = process.env.NEXT_PUBLIC_SITE_URL;
  if (configurado) return configurado;
  const cabeceras = await headers();
  const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host") ?? "";
  const protocolo = cabeceras.get("x-forwarded-proto") ?? "https";
  return host ? `${protocolo}://${host}` : "";
}

/**
 * RN-INT-02 · empezar una conexión por OAuth. Deja la integración
 * "Pendiente de autorización" en la base (con la sesión de la persona,
 * que es quien tiene que poder), firma el `state` y manda a Google.
 *
 * `redirect()` lanza a propósito y no se envuelve en `try`: un `catch`
 * que lo tragara dejaría a la persona en la pantalla sin explicación.
 */
export async function startOAuthConnection(formData: FormData): Promise<void> {
  const establishmentId = campo(formData, "establishmentId");
  const provider = campo(formData, "provider");
  const propertyId = campo(formData, "propertyId");
  const slug = campo(formData, "slug");
  const returnTo = campo(formData, "returnTo") || `/espacios/${slug}/restaurantes/${establishmentId}`;

  if (!isIntegrationProvider(provider) || !isOAuthProvider(provider)) {
    redirect(conFlash(returnTo, "not_configured"));
  }

  const config = googleOAuthConfig(await origen());
  const secret = process.env[VAULT_KEY_ENV];
  if (config === null || !secret) {
    redirect(conFlash(returnTo, "not_configured"));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: integrationId, error } = await supabase.rpc("begin_integration_connection", {
    p_establishment_id: establishmentId,
    p_provider: provider,
  });
  if (error || !integrationId) {
    console.error("[integraciones] begin_integration_connection devolvió error", {
      establishmentId,
      provider,
      message: error?.message,
    });
    redirect(conFlash(returnTo, "store_failed"));
  }

  const nonce = newNonce();
  const jar = await cookies();
  jar.set(OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/integraciones/oauth",
    maxAge: OAUTH_STATE_TTL_MS / 1000,
  });

  const state = signOAuthState(
    {
      integrationId,
      establishmentId,
      provider,
      slug,
      userId: user.id,
      propertyId: propertyId || null,
      nonce,
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    },
    secret,
  );

  redirect(authorizationUrl(config, provider, state, user.email ?? undefined));
}

/**
 * RN-INT-02/05 · guardar una clave API (Clarity, PageSpeed). Dos pasos:
 * la conexión se empieza con la sesión de la persona (que comprueba
 * RN-INT-05), y la clave se cifra aquí y se guarda con `service_role`
 * por `store_integration_credential()`, que vuelve a comprobar que el
 * actor es el propietario del espacio (§126). La clave en claro no sale
 * de esta función.
 */
export async function saveApiKey(
  _prev: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  const establishmentId = campo(formData, "establishmentId");
  const provider = campo(formData, "provider");
  const propertyId = campo(formData, "propertyId");
  const apiKey = campo(formData, "apiKey");
  const t = es.integrations;

  if (!apiKey) return { error: t.apiKeyRequired, done: false };
  if (!isIntegrationProvider(provider) || isOAuthProvider(provider)) {
    return { error: es.states.errorDescription, done: false };
  }
  if (!vaultIsConfigured()) return { error: t.vaultNotConfigured, done: false };

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: es.states.errorDescription, done: false };

    const { data: integrationId, error } = await supabase.rpc("begin_integration_connection", {
      p_establishment_id: establishmentId,
      p_provider: provider,
    });
    if (error || !integrationId) {
      return { error: error?.message ?? es.states.errorDescription, done: false };
    }

    const { ciphertext, keyVersion } = createCredentialVault().encrypt(apiKey);
    await storeEncryptedCredential(createAdminClient(), {
      integrationId,
      actorId: user.id,
      kind: "api_key",
      ciphertext,
      keyVersion,
      externalPropertyId: propertyId || null,
    });

    revalidatePath(`/espacios`, "layout");
    return { error: null, done: true };
  } catch (fallo) {
    console.error("[integraciones] no se pudo guardar la clave", { establishmentId, provider, message: mensajeDeFallo(fallo) });
    return { error: mensajeDeFallo(fallo), done: false };
  }
}

async function rpcSimple(
  fn: "request_integration_check" | "cancel_integration_connection",
  integrationId: string,
): Promise<IntegrationActionState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc(fn, { p_integration_id: integrationId });
    if (error) return { error: error.message, done: false };
    revalidatePath(`/espacios`, "layout");
    return { error: null, done: true };
  } catch (fallo) {
    return { error: mensajeDeFallo(fallo), done: false };
  }
}

/** RN-INT-02 · el botón de comprobación: pide una ejecución `check`; la hace la cola. */
export async function requestIntegrationCheck(
  _prev: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  return rpcSimple("request_integration_check", campo(formData, "integrationId"));
}

export async function cancelIntegrationConnection(
  _prev: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  return rpcSimple("cancel_integration_connection", campo(formData, "integrationId"));
}

/** RN-INT-06 · desconectar revoca; los datos importados se quedan (RN-INT-07). */
export async function disconnectIntegration(
  _prev: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  const integrationId = campo(formData, "integrationId");
  const reason = campo(formData, "reason");
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("disconnect_integration", {
      p_integration_id: integrationId,
      p_reason: reason || undefined,
    });
    if (error) return { error: error.message, done: false };
    revalidatePath(`/espacios`, "layout");
    return { error: null, done: true };
  } catch (fallo) {
    return { error: mensajeDeFallo(fallo), done: false };
  }
}
