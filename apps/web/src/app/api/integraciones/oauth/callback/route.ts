import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  INTEGRATION_FLASH_PARAM,
  OAUTH_NONCE_COOKIE,
} from "@/app/espacios/[slug]/restaurantes/[id]/integraciones/action-state";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { VAULT_KEY_ENV, createCredentialVault, vaultIsConfigured } from "@/services/credential-vault";
import {
  GoogleOAuthError,
  exchangeCode,
  fetchAccountEmail,
  googleOAuthConfig,
  verifyOAuthState,
} from "@/services/google-oauth";
import { storeEncryptedCredential } from "@/services/integration-gateway";

/**
 * La vuelta de Google (RN-INT-02). Google redirige aquí con `code` y el
 * `state` que se firmó al salir. En este orden, y cada paso cierra la
 * puerta si falla:
 *
 *   1. El `state` tiene que estar firmado con la clave de este servidor y
 *      no haber caducado: si no, no se sabe de qué integración es y no se
 *      toca nada.
 *   2. El nonce del `state` tiene que ser el de la cookie que se puso al
 *      salir: una vuelta pegada desde otro navegador no vale.
 *   3. Quien vuelve tiene que ser quien salió: la sesión de Cuotly tiene
 *      que ser la del `state`.
 *   4. Solo entonces se canjea el código, se cifra el token de refresco y
 *      se guarda con `store_integration_credential()`, que vuelve a
 *      comprobar el permiso del actor (RN-INT-05).
 *
 * El token en claro no se registra ni se devuelve nunca: vive en esta
 * función el tiempo que tarda en cifrarse.
 */
export const dynamic = "force-dynamic";

function volver(origin: string, base: string, flash: string): NextResponse {
  const url = new URL(base, origin);
  url.searchParams.set(INTEGRATION_FLASH_PARAM, flash);
  const respuesta = NextResponse.redirect(url);
  respuesta.cookies.set(OAUTH_NONCE_COOKIE, "", { path: "/api/integraciones/oauth", maxAge: 0 });
  return respuesta;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const state = searchParams.get("state") ?? "";
  const code = searchParams.get("code");
  const denied = searchParams.get("error");

  const secret = process.env[VAULT_KEY_ENV];
  if (!secret || !vaultIsConfigured()) {
    return volver(origin, "/", "not_configured");
  }

  const verificacion = verifyOAuthState(state, secret);
  if (!verificacion.ok) {
    return volver(origin, "/", "state_invalid");
  }
  const { payload } = verificacion;
  const base = `/espacios/${payload.slug}/restaurantes/${payload.establishmentId}?vista=gestion&bloque=integraciones`;

  const jar = await cookies();
  if (jar.get(OAUTH_NONCE_COOKIE)?.value !== payload.nonce) {
    return volver(origin, base, "state_invalid");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== payload.userId) {
    return volver(origin, base, "wrong_user");
  }

  if (denied || !code) {
    return volver(origin, base, "denied");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin;
  const config = googleOAuthConfig(siteUrl);
  if (config === null) {
    return volver(origin, base, "not_configured");
  }

  let refreshToken: string;
  let accessToken: string;
  try {
    const tokens = await exchangeCode(config, code);
    refreshToken = tokens.refreshToken;
    accessToken = tokens.accessToken;
  } catch (fallo) {
    console.error("[integraciones] el canje del código con Google falló", {
      integrationId: payload.integrationId,
      kind: fallo instanceof GoogleOAuthError ? fallo.kind : "unknown",
    });
    return volver(origin, base, "exchange_failed");
  }

  const accountLabel = await fetchAccountEmail(accessToken);

  try {
    const { ciphertext, keyVersion } = createCredentialVault().encrypt(refreshToken);
    await storeEncryptedCredential(createAdminClient(), {
      integrationId: payload.integrationId,
      actorId: user.id,
      kind: "oauth_refresh_token",
      ciphertext,
      keyVersion,
      accountLabel,
      externalPropertyId: payload.propertyId,
    });
  } catch (fallo) {
    console.error("[integraciones] no se pudo guardar la autorización", {
      integrationId: payload.integrationId,
      message: fallo instanceof Error ? fallo.message : String(fallo),
    });
    return volver(origin, base, "store_failed");
  }

  return volver(origin, base, "connected");
}
