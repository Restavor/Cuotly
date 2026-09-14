import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OAUTH_NONCE_COOKIE } from "@/app/espacios/[slug]/restaurantes/[id]/integraciones/action-state";
import { VAULT_KEY_ENV } from "@/services/credential-vault";
import { GoogleOAuthError, signOAuthState, type OAuthStatePayload } from "@/services/google-oauth";

/**
 * La vuelta de Google (RN-INT-02). Lo que se defiende: que una vuelta sin
 * state válido, con otro nonce o con otra sesión NO guarde nada, y que la
 * buena cifre el token de refresco antes de guardarlo con el actor de la
 * sesión (RN-INT-05, §126). El token en claro no llega a la base.
 */
const CLAVE = randomBytes(32).toString("base64");

const cookieGet = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet }),
}));

const getUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ admin: true }),
}));

const exchangeCodeMock = vi.hoisted(() => vi.fn());
const fetchAccountEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/google-oauth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/services/google-oauth")>();
  return { ...real, exchangeCode: exchangeCodeMock, fetchAccountEmail: fetchAccountEmailMock };
});

const storeMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/integration-gateway", () => ({
  storeEncryptedCredential: storeMock,
}));

import { GET } from "./route";

const payload: OAuthStatePayload = {
  integrationId: "int-1",
  establishmentId: "est-1",
  provider: "ga4",
  slug: "restavor",
  userId: "user-1",
  propertyId: "properties/123",
  nonce: "nonce-1",
  expiresAt: Date.now() + 60_000,
};

function peticion(params: Record<string, string>) {
  return new Request(`https://cuotly.test/api/integraciones/oauth/callback?${new URLSearchParams(params).toString()}`);
}

function destino(respuesta: Response): URL {
  expect(respuesta.status).toBeGreaterThanOrEqual(300);
  return new URL(respuesta.headers.get("location")!);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env[VAULT_KEY_ENV] = CLAVE;
  process.env.GOOGLE_OAUTH_CLIENT_ID = "cliente";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secreto";
  cookieGet.mockReturnValue({ value: "nonce-1" });
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  exchangeCodeMock.mockResolvedValue({ accessToken: "ya29.acceso", refreshToken: "1//refresco", expiresAt: new Date(), grantedScopes: [] });
  fetchAccountEmailMock.mockResolvedValue("cuenta@gmail.com");
  storeMock.mockResolvedValue("cred-1");
});

afterEach(() => {
  delete process.env[VAULT_KEY_ENV];
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
});

describe("GET /api/integraciones/oauth/callback", () => {
  it("RN-INT-02 · la vuelta buena cifra el token de refresco y lo guarda con el actor de la sesión", async () => {
    const respuesta = await GET(peticion({ code: "codigo", state: signOAuthState(payload, CLAVE) }));

    const url = destino(respuesta);
    expect(url.pathname).toBe("/espacios/restavor/restaurantes/est-1");
    expect(url.searchParams.get("integracion")).toBe("connected");
    expect(url.searchParams.get("bloque")).toBe("integraciones");

    expect(storeMock).toHaveBeenCalledOnce();
    const guardado = storeMock.mock.calls[0][1] as { ciphertext: string; kind: string; actorId: string; accountLabel: string; externalPropertyId: string };
    expect(guardado.kind).toBe("oauth_refresh_token");
    expect(guardado.actorId).toBe("user-1");
    expect(guardado.accountLabel).toBe("cuenta@gmail.com");
    expect(guardado.externalPropertyId).toBe("properties/123");
    expect(guardado.ciphertext.startsWith("cv1.")).toBe(true);
    expect(guardado.ciphertext).not.toContain("1//refresco");
    // La cookie del nonce se retira.
    expect(respuesta.headers.get("set-cookie")).toContain(`${OAUTH_NONCE_COOKIE}=;`);
  });

  it("un state alterado o firmado con otra clave no guarda nada", async () => {
    const respuesta = await GET(peticion({ code: "codigo", state: signOAuthState(payload, "otra-clave") }));
    expect(destino(respuesta).searchParams.get("integracion")).toBe("state_invalid");
    expect(exchangeCodeMock).not.toHaveBeenCalled();
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("un nonce que no es el de la cookie no guarda nada: la vuelta tiene que ser del navegador que salió", async () => {
    cookieGet.mockReturnValue({ value: "otro-nonce" });
    const respuesta = await GET(peticion({ code: "codigo", state: signOAuthState(payload, CLAVE) }));
    expect(destino(respuesta).searchParams.get("integracion")).toBe("state_invalid");
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("RN-INT-05 · otra sesión no puede terminar la autorización que empezó otra persona", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-2" } } });
    const respuesta = await GET(peticion({ code: "codigo", state: signOAuthState(payload, CLAVE) }));
    expect(destino(respuesta).searchParams.get("integracion")).toBe("wrong_user");
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("si la persona no concede el permiso, la integración sigue pendiente y se dice", async () => {
    const respuesta = await GET(peticion({ error: "access_denied", state: signOAuthState(payload, CLAVE) }));
    expect(destino(respuesta).searchParams.get("integracion")).toBe("denied");
    expect(exchangeCodeMock).not.toHaveBeenCalled();
  });

  it("si Google no devuelve la autorización completa no se guarda nada y se dice", async () => {
    exchangeCodeMock.mockRejectedValue(new GoogleOAuthError("sin refresh_token", "authorization"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const respuesta = await GET(peticion({ code: "codigo", state: signOAuthState(payload, CLAVE) }));
    expect(destino(respuesta).searchParams.get("integracion")).toBe("exchange_failed");
    expect(storeMock).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("sin bóveda no hay vuelta que valga: no se puede cifrar, así que no se guarda", async () => {
    delete process.env[VAULT_KEY_ENV];
    const respuesta = await GET(peticion({ code: "codigo", state: signOAuthState(payload, CLAVE) }));
    expect(destino(respuesta).searchParams.get("integracion")).toBe("not_configured");
    expect(storeMock).not.toHaveBeenCalled();
  });
});
