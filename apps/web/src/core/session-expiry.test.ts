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

describe("RN-APP-08 · la tablet del local manda sobre la sesión personal (PRD de agents §3.3)", () => {
  const enAgents = { ...caducada, pathname: "/agents/e5200000-0000-0000-0000-000000000001/reservas" };

  it("RN-APP-08 · con la cookie de un dispositivo no se manda a «sesión caducada» aunque la personal haya caducado", () => {
    expect(sessionExpired({ ...enAgents, hasDeviceCookie: false })).toBe(true);
    expect(sessionExpired({ ...enAgents, hasDeviceCookie: true })).toBe(false);
    expect(sessionExpired({ ...enAgents, pathname: "/agents", hasDeviceCookie: true })).toBe(false);
  });

  it("RN-APP-08 · la cookie del dispositivo solo vale en Restavor agents: en el resto de la aplicación no cambia nada", () => {
    expect(sessionExpired({ ...caducada, pathname: "/espacios/restavor", hasDeviceCookie: true })).toBe(true);
    expect(sessionExpired({ ...caducada, pathname: "/web", hasDeviceCookie: true })).toBe(true);
    // La raíz sí: la tablet se salta el Inicio y la página la lleva a Hoy.
    expect(sessionExpired({ ...caducada, pathname: "/", hasDeviceCookie: true })).toBe(false);
    expect(sessionExpired({ ...caducada, pathname: "/", hasDeviceCookie: false })).toBe(true);
    // Ni un prefijo que solo se le parece.
    expect(sessionExpired({ ...caducada, pathname: "/agentsfake/x", hasDeviceCookie: true })).toBe(true);
  });

  it("RN-APP-08 · las rutas públicas y de máquinas de Reservas se leen sin sesión", () => {
    for (const ruta of ["/r/casa-pepe", "/widget/casa-pepe", "/reservar.js", "/c/abc123", "/api/public/reservas/casa-pepe", "/api/agents/v1/health"]) {
      expect(sessionExpired({ ...caducada, pathname: ruta }), ruta).toBe(false);
    }
  });
});
