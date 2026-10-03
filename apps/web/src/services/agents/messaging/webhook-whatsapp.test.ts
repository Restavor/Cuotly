import { describe, expect, it } from "vitest";

import type { AutoReplyContext, NoticeGateway } from "./gateway";
import type { WhatsAppProvider } from "./provider";
import { handleWhatsAppVerification, handleWhatsAppWebhook, parseMetaPayload, signMetaPayload, verifyMetaSignature } from "./webhook-whatsapp";

const ID = "11111111-1111-4111-8111-111111111111";
const SECRET = "app-secret-de-prueba";

function status(overrides: Record<string, unknown> = {}) {
  return { id: "wamid.ABC", status: "delivered", timestamp: "1700000000", recipient_id: "34600000001", biz_opaque_callback_data: `notice:${ID}`, ...overrides };
}

function body(value: Record<string, unknown>): string {
  return JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", ...value } }] }] });
}

function harness(context: AutoReplyContext = { allowed: true, found: true, language: "es", restaurant: { name: "Casa Pepe", phone: "+34954000000" } }, fail = false) {
  const events: Record<string, unknown>[] = [];
  const replies: { to: string; text: string }[] = [];
  const contexts: string[] = [];
  const gateway = {
    async providerEvent(input: Record<string, unknown>) {
      if (fail) throw new Error("base de datos caída");
      events.push(input);
      return { outcome: input.noticeId === "desconocido" ? "unknown" : "delivered" };
    },
    async autoreplyContext(phone: string) {
      contexts.push(phone);
      return context;
    },
  } as unknown as NoticeGateway;
  const whatsapp: WhatsAppProvider = {
    name: "meta",
    isConfigured: () => true,
    async sendTemplate() { return { ok: true, providerMessageId: "x" }; },
    async sendText(to, text) { replies.push({ to, text }); return { ok: true, providerMessageId: "wamid.R" }; },
  };
  return { gateway, whatsapp, events, replies, contexts };
}

const signed = (raw: string) => ({ rawBody: raw, signature: signMetaPayload(raw, SECRET), appSecret: SECRET });

describe("AVI-03 · la firma de Meta (`X-Hub-Signature-256`)", () => {
  it("AVI-03 · con el VECTOR PUBLICADO del esquema (HMAC-SHA256 en hexadecimal con «sha256=»), la firma cuadra", () => {
    // Del ejemplo publicado por GitHub para `X-Hub-Signature-256`, que es el mismo esquema que usa Meta.
    const secret = "It's a Secret to Everybody";
    const payload = "Hello, World!";
    const expected = "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17";
    expect(signMetaPayload(payload, secret)).toBe(expected);
    expect(verifyMetaSignature(payload, expected, secret)).toBe(true);
  });

  it("AVI-03 · una firma falsa, de otro secreto, de otro cuerpo, sin prefijo o mal formada, no vale", () => {
    const raw = "{}";
    expect(verifyMetaSignature(raw, signMetaPayload(raw, "otro-secreto"), SECRET)).toBe(false);
    expect(verifyMetaSignature("{ }", signMetaPayload(raw, SECRET), SECRET)).toBe(false);
    expect(verifyMetaSignature(raw, signMetaPayload(raw, SECRET).slice("sha256=".length), SECRET)).toBe(false);
    expect(verifyMetaSignature(raw, "sha256=abc", SECRET)).toBe(false);
    expect(verifyMetaSignature(raw, null, SECRET)).toBe(false);
    expect(verifyMetaSignature(raw, "sha1=" + "a".repeat(40), SECRET)).toBe(false);
  });
});

describe("AVI-03 · la verificación del webhook (GET con `hub.challenge`)", () => {
  const query = (params: Record<string, string>) => new URLSearchParams(params);

  it("AVI-03 · con el token correcto devuelve el reto tal cual, como texto", () => {
    expect(handleWhatsAppVerification(query({ "hub.mode": "subscribe", "hub.verify_token": "mi-token", "hub.challenge": "1158201444" }), "mi-token")).toEqual({
      status: 200,
      text: "1158201444",
    });
  });

  it("AVI-03 · con otro token, otro modo o sin reto, 403; sin token configurado, 503", () => {
    expect(handleWhatsAppVerification(query({ "hub.mode": "subscribe", "hub.verify_token": "otro", "hub.challenge": "1" }), "mi-token").status).toBe(403);
    expect(handleWhatsAppVerification(query({ "hub.mode": "unsubscribe", "hub.verify_token": "mi-token", "hub.challenge": "1" }), "mi-token").status).toBe(403);
    expect(handleWhatsAppVerification(query({ "hub.mode": "subscribe", "hub.verify_token": "mi-token" }), "mi-token").status).toBe(403);
    expect(handleWhatsAppVerification(query({}), "mi-token").status).toBe(403);
    expect(handleWhatsAppVerification(query({ "hub.mode": "subscribe", "hub.verify_token": "x", "hub.challenge": "1" }), undefined).status).toBe(503);
    expect(handleWhatsAppVerification(query({ "hub.mode": "subscribe", "hub.verify_token": "x", "hub.challenge": "1" }), "").status).toBe(503);
  });
});

describe("AVI-03 · lo que se hace con los estados de los WhatsApp", () => {
  it("AVI-03 · sin secreto del webhook, 503 y no se toca nada", async () => {
    const h = harness();
    const raw = body({ statuses: [status()] });
    const result = await handleWhatsAppWebhook({ rawBody: raw, signature: signMetaPayload(raw, SECRET), appSecret: undefined }, h);
    expect(result.status).toBe(503);
    expect(h.events).toHaveLength(0);
  });

  it("AVI-03 · una firma que no cuadra es un 400 y no se toca nada: nadie sin el secreto cambia un aviso", async () => {
    const h = harness();
    const raw = body({ statuses: [status()] });
    const result = await handleWhatsAppWebhook({ rawBody: raw, signature: signMetaPayload(raw, "otro"), appSecret: SECRET }, h);
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Firma no válida" });
    expect(h.events).toHaveLength(0);
  });

  it("AVI-03 · «entregado» y «leído» cuentan como entregado, y se busca por el dato de correlación del aviso", async () => {
    const h = harness();
    const raw = body({ statuses: [status({ status: "sent" }), status({ status: "delivered" }), status({ status: "read" })] });
    const result = await handleWhatsAppWebhook(signed(raw), h);
    expect(result.status).toBe(200);
    expect(h.events).toEqual([
      { noticeId: ID, provider: "meta", providerMessageId: "wamid.ABC", event: "delivered" },
      { noticeId: ID, provider: "meta", providerMessageId: "wamid.ABC", event: "delivered" },
    ]);
  });

  it("AVI-03 · sin dato de correlación se busca por el identificador del mensaje", async () => {
    const h = harness();
    await handleWhatsAppWebhook(signed(body({ statuses: [status({ biz_opaque_callback_data: undefined })] })), h);
    expect(h.events[0]).toEqual({ noticeId: null, provider: "meta", providerMessageId: "wamid.ABC", event: "delivered" });
    // Un dato de correlación que no es un identificador no se toma por tal.
    await handleWhatsAppWebhook(signed(body({ statuses: [status({ biz_opaque_callback_data: "notice:'; drop table" })] })), h);
    expect(h.events[1]).toMatchObject({ noticeId: null });
  });

  it("AVI-03 · un fallo «número sin WhatsApp» (131026) es «no entregable»: pasa a SMS", async () => {
    const h = harness();
    await handleWhatsAppWebhook(signed(body({ statuses: [status({ status: "failed", errors: [{ code: 131026, title: "Message undeliverable", message: "al +34600000001" }] })] })), h);
    expect(h.events[0]).toEqual({ noticeId: ID, provider: "meta", providerMessageId: "wamid.ABC", event: "undeliverable", error: "meta_131026" });
  });

  it("AVI-03 · otro fallo es «fallido» con su código (nunca su texto, que puede llevar el teléfono)", async () => {
    const h = harness();
    await handleWhatsAppWebhook(signed(body({ statuses: [status({ status: "failed", errors: [{ code: 131000, message: "algo con +34600000001" }] })] })), h);
    expect(h.events[0]).toMatchObject({ event: "failed", error: "meta_131000" });
    expect(JSON.stringify(h.events)).not.toContain("600000001");
    // Y un fallo sin código es temporal con tope (código `meta_unknown`), nunca «no entregable».
    const g = harness();
    await handleWhatsAppWebhook(signed(body({ statuses: [status({ status: "failed" })] })), g);
    expect(g.events[0]).toMatchObject({ event: "failed", error: "meta_unknown" });
  });

  it("RN-AGT-07 · «no cobrado» solo si Meta dice `billable: false`", async () => {
    const h = harness();
    await handleWhatsAppWebhook(signed(body({ statuses: [status({ status: "sent", pricing: { billable: false, pricing_model: "CBP", category: "utility" } })] })), h);
    expect(h.events.map((e) => e.event)).toEqual(["not_charged"]);
    const g = harness();
    await handleWhatsAppWebhook(signed(body({ statuses: [status({ status: "sent", pricing: { billable: true } }), status({ status: "delivered" })] })), g);
    expect(g.events.map((e) => e.event)).toEqual(["delivered"]);
  });

  it("AVI-03 · un aviso desconocido o un evento ajeno se contesta 200 (reintentarlo no lo arregla)", async () => {
    const h = harness();
    expect((await handleWhatsAppWebhook(signed(body({ metadata: {} })), h)).status).toBe(200);
    expect((await handleWhatsAppWebhook(signed("no es json"), h)).body).toMatchObject({ outcome: "unreadable" });
    expect((await handleWhatsAppWebhook(signed(JSON.stringify({ object: "page" })), h)).body).toMatchObject({ outcome: "unreadable" });
  });

  it("AVI-03 · un fallo de la base de datos es un 500: ahí sí interesa que Meta reintente", async () => {
    const h = harness(undefined, true);
    const result = await handleWhatsAppWebhook(signed(body({ statuses: [status()] })), h);
    expect(result.status).toBe(500);
    expect(result.log).toContain("base de datos caída");
    expect(JSON.stringify(result.body)).not.toContain("600000001");
  });
});

describe("decisión 162 · la respuesta automática a quien escribe al número de Restavor", () => {
  const inbound = (from: string) => body({ messages: [{ from, id: "wamid.IN", timestamp: "1700000000", type: "text", text: { body: "hola" } }], contacts: [{ wa_id: from }] });

  it("decisión 162 · responde con el texto del restaurante que le mandó el aviso, en su idioma", async () => {
    const h = harness();
    const result = await handleWhatsAppWebhook(signed(inbound("34600000001")), h);
    expect(result.body).toMatchObject({ replies: 1 });
    expect(h.contexts).toEqual(["+34600000001"]);
    expect(h.replies).toEqual([{ to: "+34600000001", text: "Este número solo envía avisos y no lee mensajes. Para cualquier cosa, llama a Casa Pepe: +34954000000." }]);
  });

  it("decisión 162 · si no se sabe de qué restaurante es, el texto genérico en los dos idiomas", async () => {
    const h = harness({ allowed: true, found: false, language: null, restaurant: null });
    await handleWhatsAppWebhook(signed(inbound("34600000001")), h);
    expect(h.replies[0]!.text).toContain("Llama directamente al restaurante.");
    expect(h.replies[0]!.text).toContain("Please call the restaurant directly.");
  });

  it("decisión 162 · una respuesta por número y hora: si la base de datos no la permite, no se responde", async () => {
    const h = harness({ allowed: false, found: false, language: null, restaurant: null });
    const result = await handleWhatsAppWebhook(signed(inbound("34600000001")), h);
    expect(result.body).toMatchObject({ replies: 0 });
    expect(h.replies).toHaveLength(0);
  });

  it("decisión 162 · un número mal formado no recibe nada, y el mismo número varias veces en un envío, una respuesta", async () => {
    const h = harness();
    await handleWhatsAppWebhook(signed(inbound("abc")), h);
    expect(h.contexts).toHaveLength(0);
    const two = body({ messages: [{ from: "34600000001", id: "a" }, { from: "34600000001", id: "b" }] });
    await handleWhatsAppWebhook(signed(two), h);
    expect(h.contexts).toEqual(["+34600000001"]);
  });
});

describe("AVI-03 · lo que se lee de un envío de Meta", () => {
  it("AVI-03 · estados y mensajes de varios cambios", () => {
    const raw = JSON.stringify({
      entry: [
        { changes: [{ value: { statuses: [status()] } }, { value: { messages: [{ from: "34600000009" }] } }] },
        { changes: [{ value: { statuses: [status({ id: "wamid.2", status: "failed", errors: [{ code: 131026 }] })] } }] },
      ],
    });
    const parsed = parseMetaPayload(raw);
    expect(parsed?.statuses.map((s) => s.event)).toEqual(["delivered", "undeliverable"]);
    expect(parsed?.inbound).toEqual(["+34600000009"]);
  });
});
