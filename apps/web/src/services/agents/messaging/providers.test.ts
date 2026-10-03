import { describe, expect, it } from "vitest";

import { dispatchPolicy, fakeMessagingAllowed, fakeMessagingBlocked, isProduction, parseAllowlist, selectProviders } from "./providers";

describe("decisión 159 · el proveedor falso solo con la variable y fuera de producción", () => {
  it("decisión 159 · con la variable a `true` y fuera de producción: el falso", () => {
    expect(selectProviders({ ENABLE_FAKE_MESSAGING: "true", VERCEL_ENV: "preview" }).mode).toBe("fake");
    expect(selectProviders({ ENABLE_FAKE_MESSAGING: "true" }).mode).toBe("fake");
    expect(selectProviders({ ENABLE_FAKE_MESSAGING: " TRUE ", VERCEL_ENV: "development" }).mode).toBe("fake");
  });

  it("decisión 159 · en PRODUCCIÓN la variable se ignora: siempre los reales", () => {
    const env = { ENABLE_FAKE_MESSAGING: "true", VERCEL_ENV: "production" };
    expect(fakeMessagingAllowed(env)).toBe(false);
    expect(fakeMessagingBlocked(env)).toBe(true);
    expect(selectProviders(env).mode).toBe("real");
    expect(selectProviders({ ...env, VERCEL_ENV: " Production " }).mode).toBe("real");
  });

  it("decisión 159 · sin la variable (o con otro valor) los reales, también en pruebas", () => {
    expect(selectProviders({ VERCEL_ENV: "preview" }).mode).toBe("real");
    expect(selectProviders({ ENABLE_FAKE_MESSAGING: "false" }).mode).toBe("real");
    expect(selectProviders({ ENABLE_FAKE_MESSAGING: "1" }).mode).toBe("real");
    expect(fakeMessagingBlocked({ VERCEL_ENV: "production" })).toBe(false);
  });

  it("decisión 160 · los reales sin claves dicen que no están configurados (no fingen que envían)", () => {
    const providers = selectProviders({});
    expect(providers.email.isConfigured()).toBe(false);
    expect(providers.whatsapp.isConfigured()).toBe(false);
    expect(providers.sms.isConfigured()).toBe(false);
    expect(providers.email.name).toBe("resend");
    expect(providers.whatsapp.name).toBe("meta");
    expect(providers.sms.name).toBe("sms");
  });

  it("decisión 160 · con las claves, configurados", () => {
    const providers = selectProviders({
      RESEND_API_KEY: "re_123",
      RESERVATIONS_EMAIL_ADDRESS: "reservas@restavor.com",
      WHATSAPP_ACCESS_TOKEN: "EAAB",
      WHATSAPP_PHONE_NUMBER_ID: "1234567890",
      SMS_ACCOUNT_SID: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      SMS_AUTH_TOKEN: "token",
    });
    expect(providers.email.isConfigured()).toBe(true);
    expect(providers.whatsapp.isConfigured()).toBe(true);
    expect(providers.sms.isConfigured()).toBe(true);
  });

  it("decisión 159 · producción es solo `VERCEL_ENV=production`", () => {
    expect(isProduction({ VERCEL_ENV: "production" })).toBe(true);
    expect(isProduction({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isProduction({})).toBe(false);
  });
});

describe("decisión 165 · límites de envío", () => {
  it("decisión 165 · el falso no necesita límites: no sale nada de verdad", () => {
    expect(dispatchPolicy({}, "fake")).toEqual({ enforceAllowlist: false, allowlist: [], blockReservedDomains: false });
  });

  it("decisión 165 · reales fuera de producción: solo a la lista permitida (vacía = a nadie) y sin dominios de prueba", () => {
    expect(dispatchPolicy({ VERCEL_ENV: "preview" }, "real")).toEqual({ enforceAllowlist: true, allowlist: [], blockReservedDomains: true });
    expect(dispatchPolicy({}, "real").enforceAllowlist).toBe(true);
    expect(dispatchPolicy({ VERCEL_ENV: "preview", MESSAGING_RECIPIENT_ALLOWLIST: "info@restavor.com, +34600000001;\n+34600000002" }, "real").allowlist).toEqual([
      "info@restavor.com",
      "+34600000001",
      "+34600000002",
    ]);
  });

  it("decisión 165 · reales en producción: a cualquiera, pero nunca a un dominio de prueba", () => {
    expect(dispatchPolicy({ VERCEL_ENV: "production", MESSAGING_RECIPIENT_ALLOWLIST: "x@y.es" }, "real")).toEqual({
      enforceAllowlist: false,
      allowlist: ["x@y.es"],
      blockReservedDomains: true,
    });
  });

  it("decisión 165 · la lista se lee con comas, punto y coma, espacios y saltos de línea", () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist("")).toEqual([]);
    expect(parseAllowlist("a@b.es,,  c@d.es\t;e@f.es")).toEqual(["a@b.es", "c@d.es", "e@f.es"]);
  });
});
