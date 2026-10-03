import { describe, expect, it } from "vitest";

import type { NoticeGateway } from "./gateway";
import { handleSmsWebhook, signSmsRequest, smsEventOf, verifySmsSignature } from "./webhook-sms";

const ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "token-de-prueba";
const URL_PUBLICA = `https://restavor.com/api/agents/webhooks/sms?notice=${ID}`;

function form(overrides: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({ MessageSid: "SM123456789012345678", MessageStatus: "delivered", To: "+34600000001", From: "Restavor", ...overrides });
}

function harness(fail = false) {
  const events: Record<string, unknown>[] = [];
  const gateway = {
    async providerEvent(input: Record<string, unknown>) {
      if (fail) throw new Error("base de datos caída");
      events.push(input);
      return { outcome: "delivered" };
    },
  } as unknown as NoticeGateway;
  return { gateway, events };
}

const request = (params: URLSearchParams, overrides: Partial<Parameters<typeof handleSmsWebhook>[0]> = {}) => ({
  rawBody: params.toString(),
  signature: signSmsRequest(URL_PUBLICA, params, TOKEN),
  authToken: TOKEN,
  publicUrl: URL_PUBLICA,
  noticeId: ID,
  ...overrides,
});

describe("AVI-04 · la firma del proveedor de SMS (`X-Twilio-Signature`)", () => {
  it("AVI-04 · con el VECTOR PUBLICADO por Twilio (token 12345, su URL y sus parámetros) la firma cuadra", () => {
    const params = new URLSearchParams({ CallSid: "CA1234567890ABCDE", Caller: "+14158675309", Digits: "1234", From: "+14158675309", To: "+18005551212" });
    const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
    expect(signSmsRequest(url, params, "12345")).toBe("RSOYDt4T1cUTdK1PDd93/VVr8B8=");
    expect(verifySmsSignature(url, params, "RSOYDt4T1cUTdK1PDd93/VVr8B8=", "12345")).toBe(true);
  });

  it("AVI-04 · los parámetros se ordenan por nombre, así que el orden en que lleguen no importa", () => {
    const a = new URLSearchParams([["b", "2"], ["a", "1"]]);
    const b = new URLSearchParams([["a", "1"], ["b", "2"]]);
    expect(signSmsRequest(URL_PUBLICA, a, TOKEN)).toBe(signSmsRequest(URL_PUBLICA, b, TOKEN));
  });

  it("AVI-04 · una firma falsa, de otra URL, de otro parámetro o ausente no vale", () => {
    const params = form();
    const good = signSmsRequest(URL_PUBLICA, params, TOKEN);
    expect(verifySmsSignature(URL_PUBLICA, params, good, TOKEN)).toBe(true);
    expect(verifySmsSignature("https://otro.example/api/agents/webhooks/sms", params, good, TOKEN)).toBe(false);
    expect(verifySmsSignature(URL_PUBLICA, form({ MessageStatus: "failed" }), good, TOKEN)).toBe(false);
    expect(verifySmsSignature(URL_PUBLICA, params, good, "otro-token")).toBe(false);
    expect(verifySmsSignature(URL_PUBLICA, params, null, TOKEN)).toBe(false);
    expect(verifySmsSignature(URL_PUBLICA, params, "", TOKEN)).toBe(false);
  });
});

describe("AVI-04 · del estado del proveedor al suceso", () => {
  it("AVI-04 · entregado, y fallos con su código (un móvil que no existe es «no entregable»)", () => {
    expect(smsEventOf(form())).toEqual({ event: "delivered" });
    expect(smsEventOf(form({ MessageStatus: "undelivered", ErrorCode: "30006" }))).toEqual({ event: "undeliverable", error: "sms_30006" });
    expect(smsEventOf(form({ MessageStatus: "failed", ErrorCode: "30007" }))).toEqual({ event: "failed", error: "sms_30007" });
    expect(smsEventOf(form({ MessageStatus: "failed" }))).toEqual({ event: "failed", error: "sms_unknown" });
  });

  it("AVI-04 · en cola, enviado… no cambian nada", () => {
    for (const status of ["queued", "accepted", "sending", "sent", "receiving", "received", ""]) {
      expect(smsEventOf(form({ MessageStatus: status })), status).toBeNull();
    }
  });
});

describe("AVI-04 · lo que se hace con el aviso de estado de un SMS", () => {
  it("AVI-04 · sin token o sin dirección pública configurada, 503 y no se toca nada", async () => {
    const h = harness();
    expect((await handleSmsWebhook(request(form(), { authToken: undefined }), h.gateway)).status).toBe(503);
    expect((await handleSmsWebhook(request(form(), { publicUrl: undefined }), h.gateway)).status).toBe(503);
    expect(h.events).toHaveLength(0);
  });

  it("AVI-04 · una firma que no cuadra es un 400 y no se toca nada", async () => {
    const h = harness();
    const result = await handleSmsWebhook(request(form(), { signature: "falsa" }), h.gateway);
    expect(result.status).toBe(400);
    expect(h.events).toHaveLength(0);
  });

  it("AVI-04 · la firma se comprueba contra la URL PÚBLICA configurada, no contra la que ve el servidor", async () => {
    const h = harness();
    const params = form();
    const result = await handleSmsWebhook(
      { rawBody: params.toString(), signature: signSmsRequest("http://localhost:3000/api/agents/webhooks/sms?notice=" + ID, params, TOKEN), authToken: TOKEN, publicUrl: URL_PUBLICA, noticeId: ID },
      h.gateway,
    );
    expect(result.status).toBe(400);
  });

  it("AVI-04 · un entregado se apunta con el aviso de la dirección y el identificador del mensaje", async () => {
    const h = harness();
    const result = await handleSmsWebhook(request(form()), h.gateway);
    expect(result.status).toBe(200);
    expect(h.events).toEqual([{ noticeId: ID, provider: "sms", providerMessageId: "SM123456789012345678", event: "delivered" }]);
  });

  it("AVI-04 · sin aviso en la dirección se busca por el identificador del mensaje; un aviso que no es un identificador no se toma por tal", async () => {
    const h = harness();
    await handleSmsWebhook(request(form(), { noticeId: null }), h.gateway);
    await handleSmsWebhook(request(form(), { noticeId: "'; drop table" }), h.gateway);
    expect(h.events.map((e) => e.noticeId)).toEqual([null, null]);
  });

  it("AVI-04 · un estado intermedio se contesta 200 sin tocar nada", async () => {
    const h = harness();
    const result = await handleSmsWebhook(request(form({ MessageStatus: "sent" })), h.gateway);
    expect(result).toMatchObject({ status: 200, body: { outcome: "ignored" } });
    expect(h.events).toHaveLength(0);
  });

  it("AVI-04 · un fallo de la base de datos es un 500 (el proveedor reintenta) y no cuenta datos del comensal", async () => {
    const h = harness(true);
    const result = await handleSmsWebhook(request(form()), h.gateway);
    expect(result.status).toBe(500);
    expect(JSON.stringify(result)).not.toContain("600000001");
  });
});
