import { describe, expect, it } from "vitest";

import { isSupabaseAuthCookie, sessionExpired } from "./session-expiry";

const caducada = {
  method: "GET",
  pathname: "/espacios/restavor",
  hadAuthCookie: true,
  hasUser: false,
  errorStatus: 400,
};

describe("A08 · cuándo se dice que la sesión ha caducado", () => {
  it("con cookie de sesión que el servidor rechaza, en una página que pide sesión", () => {
    expect(sessionExpired(caducada)).toBe(true);
  });

  it("sin cookie no: es alguien que no había entrado y va a entrar", () => {
    expect(sessionExpired({ ...caducada, hadAuthCookie: false })).toBe(false);
  });

  it("con la red caída no: no se manda a entrar a quien sigue dentro", () => {
    expect(sessionExpired({ ...caducada, errorStatus: undefined })).toBe(false);
    expect(sessionExpired({ ...caducada, errorStatus: 503 })).toBe(false);
  });

  it("con sesión válida no", () => {
    expect(sessionExpired({ ...caducada, hasUser: true, errorStatus: undefined })).toBe(false);
  });

  it("en la puerta de entrada no: se lee sin sesión", () => {
    for (const ruta of ["/login", "/signup", "/solicitud/abc", "/invitaciones/x", "/sesion-caducada", "/estado"]) {
      expect(sessionExpired({ ...caducada, pathname: ruta })).toBe(false);
    }
  });

  it("un envío de formulario no se redirige: la acción contesta por su cuenta", () => {
    expect(sessionExpired({ ...caducada, method: "POST" })).toBe(false);
  });

  it("reconoce la cookie de Supabase y sus trozos, y nada más", () => {
    expect(isSupabaseAuthCookie("sb-abcd-auth-token")).toBe(true);
    expect(isSupabaseAuthCookie("sb-abcd-auth-token.0")).toBe(true);
    expect(isSupabaseAuthCookie("sb-abcd-auth-token-code-verifier")).toBe(true);
    expect(isSupabaseAuthCookie("otra")).toBe(false);
  });
});
