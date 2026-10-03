import { describe, expect, it } from "vitest";

import { createFakeProviders, fakeCaseOf } from "./fake";

const ID = "11111111-1111-4111-8111-111111111111";

describe("decisión 159 · el proveedor falso simula casos por el final del teléfono", () => {
  const providers = createFakeProviders();

  it("decisión 159 · un envío normal «sale» con un identificador `fake_…` y está siempre configurado", async () => {
    expect(providers.mode).toBe("fake");
    expect(providers.email.isConfigured() && providers.whatsapp.isConfigured() && providers.sms.isConfigured()).toBe(true);
    expect(await providers.email.send({ noticeId: ID, attempt: 1, to: "a@b.test", senderName: "X", replyTo: null, subject: "s", text: "t", html: "h" })).toEqual({
      ok: true,
      providerMessageId: `fake_email_${ID}`,
    });
    expect(
      await providers.whatsapp.sendTemplate({ noticeId: ID, attempt: 1, to: "+34600000001", templateName: "restavor_confirmed", language: "es", variables: [], buttonSuffix: null }),
    ).toEqual({ ok: true, providerMessageId: `fake_whatsapp_${ID}` });
    expect(await providers.sms.send({ noticeId: ID, attempt: 1, to: "+34600000001", text: "hola" })).toEqual({ ok: true, providerMessageId: `fake_sms_${ID}` });
  });

  it("decisión 159 · `…0404` no tiene WhatsApp pero sí recibe SMS", async () => {
    expect(fakeCaseOf("+34600000404")).toBe("no_whatsapp");
    expect(
      await providers.whatsapp.sendTemplate({ noticeId: ID, attempt: 1, to: "+34600000404", templateName: "x", language: "es", variables: [], buttonSuffix: null }),
    ).toEqual({ ok: false, kind: "undeliverable", code: "meta_131026" });
    expect(await providers.sms.send({ noticeId: ID, attempt: 1, to: "+34600000404", text: "hola" })).toEqual({ ok: true, providerMessageId: `fake_sms_${ID}` });
  });

  it("decisión 159 · `…0405` no es entregable ni por WhatsApp ni por SMS", async () => {
    expect(fakeCaseOf("+34600000405")).toBe("undeliverable");
    expect(
      await providers.whatsapp.sendTemplate({ noticeId: ID, attempt: 1, to: "+34600000405", templateName: "x", language: "es", variables: [], buttonSuffix: null }),
    ).toEqual({ ok: false, kind: "undeliverable", code: "meta_131026" });
    expect(await providers.sms.send({ noticeId: ID, attempt: 1, to: "+34600000405", text: "hola" })).toEqual({ ok: false, kind: "undeliverable", code: "sms_30006" });
  });

  it("decisión 159 · `…0500` falla de forma temporal en los intentos 1 y 2 y sale en el 3", async () => {
    const send = (attempt: number) => providers.sms.send({ noticeId: ID, attempt, to: "+34600000500", text: "hola" });
    expect(fakeCaseOf("+34600000500")).toBe("temporary");
    expect(await send(1)).toEqual({ ok: false, kind: "temporary", code: "sms_30001" });
    expect(await send(2)).toEqual({ ok: false, kind: "temporary", code: "sms_30001" });
    expect(await send(3)).toEqual({ ok: true, providerMessageId: `fake_sms_${ID}` });
  });

  it("decisión 159 · el correo falso no simula casos y el precio del SMS falso no se consulta", async () => {
    expect(fakeCaseOf("+34600000001")).toBeNull();
    expect(await providers.email.send({ noticeId: ID, attempt: 1, to: "x0404@b.test", senderName: "X", replyTo: null, subject: "s", text: "t", html: "h" })).toEqual({
      ok: true,
      providerMessageId: `fake_email_${ID}`,
    });
    expect(await providers.sms.fetchPrice("x")).toBeNull();
  });
});
