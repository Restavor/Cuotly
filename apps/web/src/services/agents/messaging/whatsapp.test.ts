import { describe, expect, it } from "vitest";

import type { HttpFetch, HttpRequest, WhatsAppTemplateMessage } from "./provider";
import { createMetaWhatsAppProvider, DEFAULT_GRAPH_VERSION, metaRecipient, templatePayload } from "./whatsapp";

const ID = "11111111-1111-4111-8111-111111111111";
const message: WhatsAppTemplateMessage = {
  noticeId: ID,
  attempt: 1,
  to: "+34600000001",
  templateName: "restavor_confirmed",
  language: "es",
  variables: ["Nuria", "Casa Pepe", "sábado 26 de septiembre · 21:00 · 4 personas", "Calle Sierpes 12", "+34954000000"],
  buttonSuffix: "0123456789abcdef0123456789abcdef",
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

const options = { accessToken: "EAAB", phoneNumberId: "1234567890", graphVersion: undefined };

describe("AVI-03 · WhatsApp con la Cloud API de Meta", () => {
  it("AVI-03 · la plantilla lleva el cuerpo con sus variables, el botón con el token y el dato de correlación del aviso", () => {
    expect(templatePayload(message)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "34600000001",
      type: "template",
      template: {
        name: "restavor_confirmed",
        language: { code: "es" },
        components: [
          { type: "body", parameters: message.variables.map((text) => ({ type: "text", text })) },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "0123456789abcdef0123456789abcdef" }] },
        ],
      },
      biz_opaque_callback_data: `notice:${ID}`,
    });
  });

  it("AVI-03 · sin botón (rechazada y cancelada) no hay componente de botón", () => {
    const components = (templatePayload({ ...message, buttonSuffix: null }).template as { components: { type: string }[] }).components;
    expect(components.map((c) => c.type)).toEqual(["body"]);
  });

  it("AVI-03 · una llamada a Graph con el número de Restavor, la versión por defecto y el token, y devuelve el identificador del mensaje", async () => {
    const { fetchImpl, calls } = transport({ ok: true, status: 200, body: { messaging_product: "whatsapp", messages: [{ id: "wamid.ABC" }] } });
    const provider = createMetaWhatsAppProvider({ ...options, fetchImpl });
    expect(provider.isConfigured()).toBe(true);
    expect(await provider.sendTemplate(message)).toEqual({ ok: true, providerMessageId: "wamid.ABC" });
    expect(calls[0]!.url).toBe(`https://graph.facebook.com/${DEFAULT_GRAPH_VERSION}/1234567890/messages`);
    expect(calls[0]!.init.headers.authorization).toBe("Bearer EAAB");
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("AVI-03 · la versión de Graph sale de la variable de entorno", async () => {
    const { fetchImpl, calls } = transport({ ok: true, status: 200, body: { messages: [{ id: "wamid.ABC" }] } });
    await createMetaWhatsAppProvider({ ...options, graphVersion: "v30.1", fetchImpl }).sendTemplate(message);
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v30.1/1234567890/messages");
    expect(createMetaWhatsAppProvider({ ...options, graphVersion: "mala" }).isConfigured()).toBe(false);
  });

  it("AVI-03 · el texto libre de la respuesta automática va como mensaje de texto", async () => {
    const { fetchImpl, calls } = transport({ ok: true, status: 200, body: { messages: [{ id: "wamid.TXT" }] } });
    expect(await createMetaWhatsAppProvider({ ...options, fetchImpl }).sendText("+34600000001", "Este número solo envía avisos")).toEqual({
      ok: true,
      providerMessageId: "wamid.TXT",
    });
    expect(JSON.parse(calls[0]!.init.body!)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "34600000001",
      type: "text",
      text: { preview_url: false, body: "Este número solo envía avisos" },
    });
  });

  it("decisión 160 · sin token o sin número de teléfono de Meta, de configuración y SIN llamar a nadie", async () => {
    for (const bad of [
      { accessToken: undefined, phoneNumberId: "1234567890" },
      { accessToken: "EAAB", phoneNumberId: undefined },
      { accessToken: "EAAB", phoneNumberId: "no-es-un-numero" },
    ]) {
      const { fetchImpl, calls } = transport({ ok: true, status: 200, body: {} });
      const provider = createMetaWhatsAppProvider({ ...bad, graphVersion: undefined, fetchImpl });
      expect(provider.isConfigured()).toBe(false);
      expect(await provider.sendTemplate(message)).toEqual({ ok: false, kind: "config", code: "meta_not_configured" });
      expect(calls).toHaveLength(0);
    }
  });

  it("decisión 155 · el error de Meta se clasifica por su código: no entregable, temporal, de configuración", async () => {
    for (const [code, kind] of [
      [131026, "undeliverable"],
      [131048, "temporary"],
      [190, "config"],
      [132000, "permanent"],
      [999999, "temporary"],
    ] as const) {
      const { fetchImpl } = transport({ ok: false, status: 400, body: { error: { code, message: "El número +34600000001 no existe", type: "OAuthException" } } });
      const result = await createMetaWhatsAppProvider({ ...options, fetchImpl }).sendTemplate(message);
      expect(result).toEqual({ ok: false, kind, code: `meta_${code}` });
      expect(JSON.stringify(result)).not.toContain("600000001");
    }
  });

  it("decisión 155 · sin cuerpo legible manda el estado HTTP, y la red caída es temporal", async () => {
    expect(await createMetaWhatsAppProvider({ ...options, fetchImpl: transport({ ok: false, status: 503, body: null }).fetchImpl }).sendTemplate(message)).toEqual({
      ok: false,
      kind: "temporary",
      code: "meta_http_503",
    });
    expect(await createMetaWhatsAppProvider({ ...options, fetchImpl: transport(new TypeError("fetch failed")).fetchImpl }).sendTemplate(message)).toEqual({
      ok: false,
      kind: "temporary",
      code: "network_error",
    });
  });

  it("AVI-03 · el destinatario va solo con cifras, sin el «+»", () => {
    expect(metaRecipient("+34 600-000-001")).toBe("34600000001");
  });
});
