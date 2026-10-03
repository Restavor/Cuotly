import { describe, expect, it } from "vitest";

import { createResendEmailProvider, emailIdempotencyKey } from "./email";
import type { EmailMessage, HttpFetch, HttpRequest } from "./provider";

const ID = "11111111-1111-4111-8111-111111111111";
const message: EmailMessage = {
  noticeId: ID,
  attempt: 1,
  to: "nuria@example.org",
  senderName: "Casa Pepe",
  replyTo: "reservas@casapepe.es",
  subject: "Tu reserva en Casa Pepe está confirmada",
  text: "Hola, Nuria",
  html: "<p>Hola, Nuria</p>",
};

function transport(response: { ok: boolean; status: number; body?: unknown } | Error) {
  const calls: { url: string; init: HttpRequest }[] = [];
  const fetchImpl: HttpFetch = async (url, init) => {
    calls.push({ url, init });
    if (response instanceof Error) throw response;
    return { ok: response.ok, status: response.status, json: async () => response.body };
  };
  return { fetchImpl, calls };
}

describe("AVI-02 · el correo con Resend", () => {
  it("AVI-02 · una llamada a la API con remitente, destinatario, Reply-To, HTML y texto, y la etiqueta del aviso", async () => {
    const { fetchImpl, calls } = transport({ ok: true, status: 200, body: { id: "re_abc" } });
    const provider = createResendEmailProvider({ apiKey: "re_key", fromAddress: "reservas@restavor.com", fetchImpl });
    expect(provider.isConfigured()).toBe(true);
    expect(await provider.send(message)).toEqual({ ok: true, providerMessageId: "re_abc" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.headers.authorization).toBe("Bearer re_key");
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(calls[0]!.init.body!)).toEqual({
      from: "Casa Pepe <reservas@restavor.com>",
      to: ["nuria@example.org"],
      subject: message.subject,
      html: message.html,
      text: message.text,
      reply_to: "reservas@casapepe.es",
      tags: [{ name: "notice_id", value: ID }],
    });
  });

  it("AVI-02 · sin Reply-To no se manda el campo", async () => {
    const { fetchImpl, calls } = transport({ ok: true, status: 200, body: { id: "re_abc" } });
    await createResendEmailProvider({ apiKey: "k", fromAddress: "reservas@restavor.com", fetchImpl }).send({ ...message, replyTo: null });
    expect(JSON.parse(calls[0]!.init.body!)).not.toHaveProperty("reply_to");
  });

  it("decisión 155 · la clave de idempotencia es el aviso y un resumen del contenido: el mismo contenido, la misma clave", async () => {
    const key = emailIdempotencyKey(ID, message.subject, message.text);
    expect(key).toMatch(new RegExp(`^notice-${ID}-[0-9a-f]{16}$`));
    expect(emailIdempotencyKey(ID, message.subject, message.text)).toBe(key);
    expect(emailIdempotencyKey(ID, message.subject, "otro texto")).not.toBe(key);
    expect(emailIdempotencyKey("22222222-2222-4222-8222-222222222222", message.subject, message.text)).not.toBe(key);
    const { fetchImpl, calls } = transport({ ok: true, status: 200, body: { id: "re_abc" } });
    await createResendEmailProvider({ apiKey: "k", fromAddress: "reservas@restavor.com", fetchImpl }).send(message);
    expect(calls[0]!.init.headers["idempotency-key"]).toBe(key);
  });

  it("decisión 160 · sin clave o sin dirección de remitente válida, de configuración y SIN llamar a nadie", async () => {
    for (const options of [
      { apiKey: undefined, fromAddress: "reservas@restavor.com" },
      { apiKey: "", fromAddress: "reservas@restavor.com" },
      { apiKey: "k", fromAddress: undefined },
      { apiKey: "k", fromAddress: "no es un correo" },
    ]) {
      const { fetchImpl, calls } = transport({ ok: true, status: 200, body: { id: "x" } });
      const provider = createResendEmailProvider({ ...options, fetchImpl });
      expect(provider.isConfigured()).toBe(false);
      expect(await provider.send(message)).toEqual({ ok: false, kind: "config", code: "resend_not_configured" });
      expect(calls).toHaveLength(0);
    }
  });

  it("decisión 155 · los errores de Resend se clasifican por su estado y se guardan como código, sin su texto", async () => {
    for (const [status, kind] of [
      [401, "config"],
      [403, "config"],
      [429, "temporary"],
      [500, "temporary"],
      [422, "permanent"],
    ] as const) {
      const { fetchImpl } = transport({ ok: false, status, body: { name: "validation_error", message: "Invalid `to` field: nuria@example.org" } });
      const result = await createResendEmailProvider({ apiKey: "k", fromAddress: "reservas@restavor.com", fetchImpl }).send(message);
      expect(result).toEqual({ ok: false, kind, code: `resend_http_${status}` });
      expect(JSON.stringify(result)).not.toContain("nuria");
    }
  });

  it("decisión 155 · una respuesta buena sin identificador no se da por enviada", async () => {
    const { fetchImpl } = transport({ ok: true, status: 200, body: {} });
    const result = await createResendEmailProvider({ apiKey: "k", fromAddress: "reservas@restavor.com", fetchImpl }).send(message);
    expect(result.ok).toBe(false);
  });

  it("decisión 155 · la red caída y el tiempo agotado son temporales", async () => {
    const timeout = Object.assign(new Error("timeout"), { name: "TimeoutError" });
    expect(await createResendEmailProvider({ apiKey: "k", fromAddress: "reservas@restavor.com", fetchImpl: transport(timeout).fetchImpl }).send(message)).toEqual({
      ok: false,
      kind: "temporary",
      code: "timeout",
    });
    expect(await createResendEmailProvider({ apiKey: "k", fromAddress: "reservas@restavor.com", fetchImpl: transport(new TypeError("fetch failed")).fetchImpl }).send(message)).toEqual({
      ok: false,
      kind: "temporary",
      code: "network_error",
    });
  });
});
