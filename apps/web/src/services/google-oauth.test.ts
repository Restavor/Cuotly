import { describe, expect, it, vi } from "vitest";

import {
  GOOGLE_CLIENT_ID_ENV,
  GOOGLE_CLIENT_SECRET_ENV,
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  GoogleOAuthError,
  OAUTH_CALLBACK_PATH,
  authorizationUrl,
  exchangeCode,
  fetchAccountEmail,
  googleOAuthConfig,
  googleOAuthIsConfigured,
  isOAuthProvider,
  oauthScopes,
  refreshAccessToken,
  revokeToken,
  signOAuthState,
  verifyOAuthState,
  type OAuthStatePayload,
} from "./google-oauth";

/**
 * RN-INT-02 · OAuth con Google para las tres fuentes que lo tienen. Lo
 * que se vigila: los permisos mínimos por fuente, que la vuelta de Google
 * no se pueda pegar a otra integración (el `state` firmado), que se pida
 * un token de refresco, y que los fallos de Google se clasifiquen como
 * RN-INT-08 manda.
 */
const CONFIG = { clientId: "cliente", clientSecret: "secreto", redirectUri: "https://cuotly.test/api/integraciones/oauth/callback" };

function respuesta(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const payload: OAuthStatePayload = {
  integrationId: "int-1",
  establishmentId: "est-1",
  provider: "ga4",
  slug: "restavor",
  userId: "user-1",
  propertyId: "properties/123",
  nonce: "nonce-1",
  expiresAt: Date.parse("2026-09-14T10:10:00Z"),
};

describe("google-oauth (RN-INT-02)", () => {
  it("RN-INT-02 · OAuth para GA4, Search Console y Business Profile, con el permiso mínimo de cada una", () => {
    expect(isOAuthProvider("ga4") && isOAuthProvider("search_console") && isOAuthProvider("business_profile")).toBe(true);
    expect(isOAuthProvider("clarity") || isOAuthProvider("pagespeed")).toBe(false);

    expect(oauthScopes("ga4")).toContain("https://www.googleapis.com/auth/analytics.readonly");
    expect(oauthScopes("search_console")).toContain("https://www.googleapis.com/auth/webmasters.readonly");
    expect(oauthScopes("business_profile")).toContain("https://www.googleapis.com/auth/business.manage");
    // Ninguna pide más que leer, salvo Business Profile, que no tiene ámbito de solo lectura.
    expect(oauthScopes("ga4").some((s) => s.includes("analytics.edit"))).toBe(false);
    expect(oauthScopes("search_console").some((s) => s === "https://www.googleapis.com/auth/webmasters")).toBe(false);
  });

  it("sin cliente configurado no hay flujo, y con él la vuelta es la ruta de callback sobre el origen", () => {
    expect(googleOAuthIsConfigured({})).toBe(false);
    expect(googleOAuthConfig("https://cuotly.test", {})).toBeNull();

    const env = { [GOOGLE_CLIENT_ID_ENV]: "cliente", [GOOGLE_CLIENT_SECRET_ENV]: "secreto" };
    expect(googleOAuthIsConfigured(env)).toBe(true);
    expect(googleOAuthConfig("https://cuotly.test/", env)).toEqual({
      clientId: "cliente",
      clientSecret: "secreto",
      redirectUri: `https://cuotly.test${OAUTH_CALLBACK_PATH}`,
    });
    // Sin origen no hay a dónde volver.
    expect(googleOAuthConfig("", env)).toBeNull();
  });

  it("la dirección de autorización pide consentimiento y acceso sin conexión: es lo que da el token de refresco", () => {
    const url = new URL(authorizationUrl(CONFIG, "search_console", "estado-firmado", "bosco@restavor.com"));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("estado-firmado");
    expect(url.searchParams.get("redirect_uri")).toBe(CONFIG.redirectUri);
    expect(url.searchParams.get("scope")).toContain("webmasters.readonly");
    expect(url.searchParams.get("login_hint")).toBe("bosco@restavor.com");
  });

  it("el state firmado vuelve entero, y alterado, con otra clave o caducado no vale", () => {
    const state = signOAuthState(payload, "clave");
    const ahora = new Date("2026-09-14T10:00:00Z");

    const ok = verifyOAuthState(state, "clave", ahora);
    expect(ok.ok && ok.payload).toEqual(payload);

    expect(verifyOAuthState(state, "otra-clave", ahora)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyOAuthState(state, "clave", new Date("2026-09-14T10:11:00Z"))).toEqual({ ok: false, reason: "expired" });
    expect(verifyOAuthState("sin-punto", "clave", ahora)).toEqual({ ok: false, reason: "malformed" });

    // Cambiar el cuerpo (otra integración) invalida la firma.
    const [, firma] = state.split(".");
    const otroCuerpo = Buffer.from(JSON.stringify({ ...payload, integrationId: "int-2" })).toString("base64url");
    expect(verifyOAuthState(`${otroCuerpo}.${firma}`, "clave", ahora)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("canjear el código devuelve los dos tokens, y sin token de refresco es un fallo de autorización", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      respuesta(200, { access_token: "ya29.acceso", refresh_token: "1//refresco", expires_in: 3600, scope: "openid email" }),
    );
    const ahora = new Date("2026-09-14T10:00:00Z");

    const tokens = await exchangeCode(CONFIG, "codigo", fetchImpl, ahora);

    expect(tokens).toEqual({
      accessToken: "ya29.acceso",
      refreshToken: "1//refresco",
      expiresAt: new Date("2026-09-14T11:00:00Z"),
      grantedScopes: ["openid", "email"],
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(GOOGLE_TOKEN_URL);
    expect(String(init?.body)).toContain("grant_type=authorization_code");
    expect(String(init?.body)).toContain("code=codigo");

    fetchImpl.mockResolvedValue(respuesta(200, { access_token: "ya29.acceso" }));
    await expect(exchangeCode(CONFIG, "codigo", fetchImpl, ahora)).rejects.toMatchObject({ kind: "authorization" });
  });

  it("RN-INT-08 · refrescar clasifica el fallo: invalid_grant es autorización, 5xx transitorio, otro 4xx configuración, sin red transitorio", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    fetchImpl.mockResolvedValueOnce(respuesta(200, { access_token: "ya29.nuevo" }));
    expect(await refreshAccessToken(CONFIG, "1//refresco", fetchImpl)).toBe("ya29.nuevo");

    fetchImpl.mockResolvedValueOnce(respuesta(400, { error: "invalid_grant", error_description: "Token has been revoked" }));
    await expect(refreshAccessToken(CONFIG, "1//refresco", fetchImpl)).rejects.toMatchObject({ kind: "authorization" });

    fetchImpl.mockResolvedValueOnce(respuesta(503, { error: "unavailable" }));
    await expect(refreshAccessToken(CONFIG, "1//refresco", fetchImpl)).rejects.toMatchObject({ kind: "transient" });

    fetchImpl.mockResolvedValueOnce(respuesta(401, { error: "invalid_client" }));
    await expect(refreshAccessToken(CONFIG, "1//refresco", fetchImpl)).rejects.toMatchObject({ kind: "configuration" });

    fetchImpl.mockRejectedValueOnce(new Error("ECONNRESET"));
    const fallo = await refreshAccessToken(CONFIG, "1//refresco", fetchImpl).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(GoogleOAuthError);
    expect((fallo as GoogleOAuthError).kind).toBe("transient");
  });

  it("RN-INT-06 · revocar: 200 es revocado, 400 es un token que ya no vale (cuenta como revocado), 5xx es transitorio", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    fetchImpl.mockResolvedValueOnce(new Response("", { status: 200 }));
    expect(await revokeToken("1//refresco", fetchImpl)).toBe("revoked");
    expect(String(fetchImpl.mock.calls[0][0])).toContain(GOOGLE_REVOKE_URL);

    fetchImpl.mockResolvedValueOnce(respuesta(400, { error: "invalid_token" }));
    expect(await revokeToken("1//refresco", fetchImpl)).toBe("already_invalid");

    fetchImpl.mockResolvedValueOnce(respuesta(500, {}));
    await expect(revokeToken("1//refresco", fetchImpl)).rejects.toMatchObject({ kind: "transient" });
  });

  it("§117 · la cuenta que autorizó es su correo, y si Google no lo da no se inventa", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(respuesta(200, { email: "cuenta@gmail.com" }));
    expect(await fetchAccountEmail("ya29.acceso", fetchImpl)).toBe("cuenta@gmail.com");

    fetchImpl.mockResolvedValueOnce(respuesta(401, {}));
    expect(await fetchAccountEmail("ya29.acceso", fetchImpl)).toBeNull();
  });
});
