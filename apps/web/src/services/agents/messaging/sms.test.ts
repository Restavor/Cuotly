import { describe, expect, it } from "vitest";

import type { HttpFetch, HttpRequest } from "./provider";
import { createSmsProvider, isValidSenderId } from "./sms";

const ID = "11111111-1111-4111-8111-111111111111";
const SID = "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const options = { accountSid: SID, authToken: "secreto", senderId: undefined, statusCallbackBase: "https://restavor.com/api/agents/webhooks/sms" };

function transport(response: { ok: boolean; status: number; body?: unknown } | Error) {
  const calls: { url: string; init: HttpRequest }[] = [];
  const fetchImpl: HttpFetch = async (url, init) => {
    calls.push({ url, init });
    if (response instanceof Error) throw response;
    return { ok: response.ok, status: response.status, json: async () => response.body };
  };
  return { fetchImpl, calls };
}

describe("AVI-04 · SMS con una API compatible con Twilio", () => {
  it("AVI-04 · un envío con remitente «Restavor», autenticación básica y el aviso de estado con el aviso en la dirección", async () => {
    const { fetchImpl, calls } = transport({ ok: true, status: 201, body: { sid: "SM123456789012345678" } });
    const provider = createSmsProvider({ ...options, fetchImpl });
    expect(provider.isConfigured()).toBe(true);
    expect(await provider.send({ noticeId: ID, attempt: 1, to: "+34600000001", text: "Casa Pepe: reserva confirmada" })).toEqual({
      ok: true,
      providerMessageId: "SM123456789012345678",
    });
    expect(calls[0]!.url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`);
    expect(calls[0]!.init.headers.authorization).toBe(`Basic ${Buffer.from(`${SID}:secreto`).toString("base64")}`);
    expect(calls[0]!.init.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(new URLSearchParams(calls[0]!.init.body!))).toEqual({
      To: "+34600000001",
      From: "Restavor",
      Body: "Casa Pepe: reserva confirmada",
      StatusCallback: `https://restavor.com/api/agents/webhooks/sms?notice=${ID}`,
    });
  });

  it("AVI-04 · sin dirección pública no hay aviso de estado, y el remitente se puede cambiar", async () => {
    const { fetchImpl, calls } = transport({ ok: true, status: 201, body: { sid: "SM123456789012345678" } });
    await createSmsProvider({ ...options, statusCallbackBase: undefined, senderId: "CasaPepe", fetchImpl }).send({ noticeId: ID, attempt: 1, to: "+34600000001", text: "hola" });
    const form = Object.fromEntries(new URLSearchParams(calls[0]!.init.body!));
    expect(form.StatusCallback).toBeUndefined();
    expect(form.From).toBe("CasaPepe");
  });

  it("AVI-04 · el remitente alfanumérico: 1 a 11 letras y cifras, sin espacios", () => {
    expect(isValidSenderId("Restavor")).toBe(true);
    expect(isValidSenderId("Casa Pepe")).toBe(false);
    expect(isValidSenderId("DemasiadoLargoParaUnRemitente")).toBe(false);
    expect(isValidSenderId("")).toBe(false);
    expect(createSmsProvider({ ...options, senderId: "Casa Pepe" }).isConfigured()).toBe(false);
  });

  it("decisión 160 · sin credenciales, de configuración y SIN llamar a nadie", async () => {
    for (const bad of [
      { accountSid: undefined, authToken: "x" },
      { accountSid: SID, authToken: undefined },
      { accountSid: "corto", authToken: "x" },
    ]) {
      const { fetchImpl, calls } = transport({ ok: true, status: 201, body: {} });
      const provider = createSmsProvider({ ...options, ...bad, fetchImpl });
      expect(provider.isConfigured()).toBe(false);
      expect(await provider.send({ noticeId: ID, attempt: 1, to: "+34600000001", text: "hola" })).toEqual({ ok: false, kind: "config", code: "sms_not_configured" });
      expect(await provider.fetchPrice("SM123456789012345678")).toBe("error");
      expect(calls).toHaveLength(0);
    }
  });

  it("decisión 155 · el error del proveedor se clasifica por su código y se guarda sin su texto", async () => {
    for (const [code, kind] of [
      [30006, "undeliverable"],
      [21211, "permanent"],
      [20003, "config"],
      [20429, "temporary"],
      [99999, "temporary"],
    ] as const) {
      const { fetchImpl } = transport({ ok: false, status: 400, body: { code, message: "The 'To' number +34600000001 is not valid", status: 400 } });
      const result = await createSmsProvider({ ...options, fetchImpl }).send({ noticeId: ID, attempt: 1, to: "+34600000001", text: "hola" });
      expect(result).toEqual({ ok: false, kind, code: `sms_${code}` });
      expect(JSON.stringify(result)).not.toContain("600000001");
    }
  });

  it("AVI-06 · el precio real se pregunta al mensaje: sale en positivo y con su moneda", async () => {
    const { fetchImpl, calls } = transport({ ok: true, status: 200, body: { sid: "SM123456789012345678", price: "-0.07500", price_unit: "USD", status: "delivered" } });
    const provider = createSmsProvider({ ...options, fetchImpl });
    expect(await provider.fetchPrice("SM123456789012345678")).toEqual({ amount: 0.075, currency: "USD" });
    expect(calls[0]!.url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages/SM123456789012345678.json`);
    expect(calls[0]!.init.method).toBe("GET");
  });

  it("AVI-06 · mientras el proveedor no sabe el precio devuelve null (se vuelve a preguntar); un error, «error»", async () => {
    expect(await createSmsProvider({ ...options, fetchImpl: transport({ ok: true, status: 200, body: { sid: "SM123456789012345678", price: null } }).fetchImpl }).fetchPrice("SM123456789012345678")).toBeNull();
    expect(await createSmsProvider({ ...options, fetchImpl: transport({ ok: false, status: 500, body: null }).fetchImpl }).fetchPrice("SM123456789012345678")).toBe("error");
    expect(await createSmsProvider({ ...options, fetchImpl: transport({ ok: true, status: 200, body: { price: "abc" } }).fetchImpl }).fetchPrice("SM123456789012345678")).toBe("error");
    expect(await createSmsProvider({ ...options, fetchImpl: transport(new TypeError("fetch failed")).fetchImpl }).fetchPrice("SM123456789012345678")).toBe("error");
  });

  it("AVI-06 · un identificador que no parece uno del proveedor no se consulta (no se arma una dirección con lo que llegue)", async () => {
    const { fetchImpl, calls } = transport({ ok: true, status: 200, body: {} });
    expect(await createSmsProvider({ ...options, fetchImpl }).fetchPrice("../Accounts/otro")).toBe("error");
    expect(calls).toHaveLength(0);
  });
});
