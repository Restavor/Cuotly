/**
 * `src/services/google-oauth.ts` — el flujo OAuth con Google para GA4,
 * Search Console y Business Profile (RN-INT-02, §116; Fase 3, Hito 14).
 *
 * Lo que hay aquí es lo que habla con Google: la dirección a la que se
 * manda a la persona, el canje del código por los tokens, el refresco del
 * token de acceso y la revocación. Y el `state` firmado, que es lo que
 * impide que una vuelta de Google se pegue a otra integración o a otra
 * persona: lleva a qué integración pertenece, quién la empezó y hasta
 * cuándo vale, firmado con HMAC; la ruta de vuelta lo comprueba antes de
 * tocar nada y compara además el nonce con la cookie que se puso al salir.
 *
 * Ninguna credencial pasa por aquí sin cifrar más allá de la memoria del
 * proceso: el token de refresco va a `credential-vault.ts` y de ahí a la
 * base; el de acceso vive lo que dura una sincronización.
 *
 * Sin `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET` el flujo no
 * existe, y la pantalla lo dice (§178, "integración no conectada" con su
 * motivo) en vez de enseñar un botón que fallaría.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { IntegrationProvider } from "@/core/integrations";

import type { EnvLike } from "./credential-vault";

export const GOOGLE_CLIENT_ID_ENV = "GOOGLE_OAUTH_CLIENT_ID";
export const GOOGLE_CLIENT_SECRET_ENV = "GOOGLE_OAUTH_CLIENT_SECRET";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/** La ruta de vuelta, relativa al origen de la aplicación. */
export const OAUTH_CALLBACK_PATH = "/api/integraciones/oauth/callback";

export type OAuthProvider = Extract<IntegrationProvider, "ga4" | "search_console" | "business_profile">;

export function isOAuthProvider(provider: IntegrationProvider): provider is OAuthProvider {
  return provider === "ga4" || provider === "search_console" || provider === "business_profile";
}

/**
 * RN-INT-02 · el permiso mínimo de cada fuente, de solo lectura donde
 * Google lo ofrece. Business Profile no tiene un ámbito de solo lectura:
 * `business.manage` es el único que da acceso a la API de rendimiento.
 * `openid email` es para saber qué cuenta se autorizó (§117: "se muestra
 * cuenta"), nunca para nada más.
 */
export function oauthScopes(provider: OAuthProvider): readonly string[] {
  const base = ["openid", "email"];
  switch (provider) {
    case "ga4":
      return [...base, "https://www.googleapis.com/auth/analytics.readonly"];
    case "search_console":
      return [...base, "https://www.googleapis.com/auth/webmasters.readonly"];
    case "business_profile":
      return [...base, "https://www.googleapis.com/auth/business.manage"];
  }
}

export interface GoogleOAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

export function googleOAuthIsConfigured(env: EnvLike = process.env): boolean {
  return Boolean(env[GOOGLE_CLIENT_ID_ENV] && env[GOOGLE_CLIENT_SECRET_ENV]);
}

export function googleOAuthConfig(
  siteUrl: string,
  env: EnvLike = process.env,
): GoogleOAuthConfig | null {
  const clientId = env[GOOGLE_CLIENT_ID_ENV];
  const clientSecret = env[GOOGLE_CLIENT_SECRET_ENV];
  if (!clientId || !clientSecret || !siteUrl) return null;
  return { clientId, clientSecret, redirectUri: `${siteUrl.replace(/\/$/, "")}${OAUTH_CALLBACK_PATH}` };
}

// ---------------------------------------------------------------------
// El `state` firmado
// ---------------------------------------------------------------------

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthStatePayload {
  readonly integrationId: string;
  readonly establishmentId: string;
  readonly provider: OAuthProvider;
  readonly slug: string;
  readonly userId: string;
  /** Lo que se guardará como `external_property_id`. */
  readonly propertyId: string | null;
  readonly nonce: string;
  readonly expiresAt: number;
}

function b64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function firma(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function newNonce(): string {
  return randomBytes(16).toString("base64url");
}

export function signOAuthState(payload: OAuthStatePayload, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${firma(body, secret)}`;
}

export type OAuthStateVerification =
  | { readonly ok: true; readonly payload: OAuthStatePayload }
  | { readonly ok: false; readonly reason: "malformed" | "bad_signature" | "expired" };

export function verifyOAuthState(
  state: string,
  secret: string,
  now: Date = new Date(),
): OAuthStateVerification {
  const parts = state.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const esperada = Buffer.from(firma(parts[0], secret));
  const recibida = Buffer.from(parts[1]);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) {
    return { ok: false, reason: "bad_signature" };
  }
  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as OAuthStatePayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof payload.integrationId !== "string" ||
    typeof payload.userId !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.expiresAt !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (payload.expiresAt < now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

// ---------------------------------------------------------------------
// Hablar con Google
// ---------------------------------------------------------------------

/**
 * `access_type=offline` y `prompt=consent` son lo que hace que Google
 * devuelva un token de REFRESCO y no solo uno de acceso: sin ellos, la
 * segunda autorización de la misma cuenta llega sin refresh_token y la
 * sincronización diaria moriría al caducar el de acceso.
 */
export function authorizationUrl(
  config: GoogleOAuthConfig,
  provider: OAuthProvider,
  state: string,
  loginHint?: string,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: oauthScopes(provider).join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export class GoogleOAuthError extends Error {
  constructor(
    message: string,
    readonly kind: "authorization" | "transient" | "configuration",
  ) {
    super(message);
    this.name = "GoogleOAuthError";
  }
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(
  body: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
  } catch (error) {
    throw new GoogleOAuthError(
      `No se pudo hablar con Google: ${error instanceof Error ? error.message : String(error)}`,
      "transient",
    );
  }
  const payload = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok) {
    // `invalid_grant` es "esta autorización ya no vale" (revocada, caducada,
    // contraseña cambiada): hace falta una persona (§117, "Requiere
    // atención"). Lo demás de 4xx es configuración (cliente mal dado de
    // alta); 5xx es transitorio.
    const kind =
      payload.error === "invalid_grant"
        ? "authorization"
        : response.status >= 500
          ? "transient"
          : "configuration";
    throw new GoogleOAuthError(
      `Google respondió ${response.status} (${payload.error ?? "sin código"}): ${payload.error_description ?? ""}`.trim(),
      kind,
    );
  }
  return payload;
}

export interface ExchangedTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: Date;
  readonly grantedScopes: readonly string[];
}

export async function exchangeCode(
  config: GoogleOAuthConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<ExchangedTokens> {
  const payload = await tokenRequest(
    {
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    },
    fetchImpl,
  );
  if (!payload.access_token) {
    throw new GoogleOAuthError("Google no devolvió un token de acceso", "configuration");
  }
  if (!payload.refresh_token) {
    throw new GoogleOAuthError(
      "Google no devolvió un token de refresco: la cuenta ya tenía la autorización concedida sin consentimiento nuevo",
      "authorization",
    );
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: new Date(now.getTime() + (payload.expires_in ?? 3600) * 1000),
    grantedScopes: (payload.scope ?? "").split(" ").filter(Boolean),
  };
}

export async function refreshAccessToken(
  config: Pick<GoogleOAuthConfig, "clientId" | "clientSecret">,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const payload = await tokenRequest(
    {
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    },
    fetchImpl,
  );
  if (!payload.access_token) {
    throw new GoogleOAuthError("Google no devolvió un token de acceso al refrescar", "authorization");
  }
  return payload.access_token;
}

/**
 * RN-INT-06 · revocar la autorización en Google. Un token que Google ya no
 * reconoce (400 `invalid_token`) cuenta como revocado: el objetivo era que
 * dejara de valer, y ya no vale.
 */
export async function revokeToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<"revoked" | "already_invalid"> {
  let response: Response;
  try {
    response = await fetchImpl(`${GOOGLE_REVOKE_URL}?${new URLSearchParams({ token }).toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch (error) {
    throw new GoogleOAuthError(
      `No se pudo hablar con Google: ${error instanceof Error ? error.message : String(error)}`,
      "transient",
    );
  }
  if (response.ok) return "revoked";
  if (response.status === 400) return "already_invalid";
  throw new GoogleOAuthError(`Google respondió ${response.status} al revocar`, response.status >= 500 ? "transient" : "configuration");
}

/** §117 · "se muestra cuenta": el correo de la cuenta de Google que autorizó. */
export async function fetchAccountEmail(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { email?: string };
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}
