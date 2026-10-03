import { describe, expect, it } from "vitest";

import type { NoticeGateway } from "./gateway";
import { handleEmailWebhook, parseResendEvent, signSvixPayload, verifySvixSignature } from "./webhook-email";

const ID = "11111111-1111-4111-8111-111111111111";
const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const NOW = new Date("2026-10-03T12:00:00Z");
const T = String(Math.floor(NOW.getTime() / 1000));

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

function event(type: string, data: Record<string, unknown> = {}) {
  return JSON.stringify({ type, created_at: "2026-10-03T12:00:00Z", data: { email_id: "re_abc", to: ["nuria@example.org"], tags: { notice_id: ID }, ...data } });
}

const request = (raw: string, overrides: Partial<Parameters<typeof handleEmailWebhook>[0]> = {}) => ({
  rawBody: raw,
  svixId: "msg_1",
  svixTimestamp: T,
  svixSignature: signSvixPayload("msg_1", Number(T), raw, SECRET),
  webhookSecret: SECRET,
  now: NOW,
  ...overrides,
});

describe("AVI-02 · la firma de Resend (Svix)", () => {
  it("AVI-02 · con el VECTOR PUBLICADO por Svix (su secreto, id, marca y cuerpo de ejemplo) la firma cuadra", () => {
    const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
    const payload = '{"test": 2432232314}';
    const expected = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=";
    expect(signSvixPayload("msg_p5jXN8AQM9LWM0D4loKWxJek", 1614265330, payload, secret)).toBe(expected);
    expect(
      verifySvixSignature(payload, { id: "msg_p5jXN8AQM9LWM0D4loKWxJek", timestamp: "1614265330", signature: expected }, secret, new Date(1614265330 * 1000 + 60_000)),
    ).toEqual({ ok: true });
  });

  it("AVI-02 · varias firmas en la cabecera: vale con que una cuadre", () => {
    const raw = "{}";
    const good = signSvixPayload("msg_1", Number(T), raw, SECRET);
    expect(verifySvixSignature(raw, { id: "msg_1", timestamp: T, signature: `v1,AAAA ${good} v2,BBBB` }, SECRET, NOW)).toEqual({ ok: true });
  });

  it("AVI-02 · una firma falsa, caducada, mal formada o ausente no vale, y dice por qué", () => {
    const raw = "{}";
    const good = signSvixPayload("msg_1", Number(T), raw, SECRET);
    expect(verifySvixSignature(raw, { id: null, timestamp: T, signature: good }, SECRET, NOW)).toEqual({ ok: false, reason: "missing" });
    expect(verifySvixSignature(raw, { id: "msg_1", timestamp: "ayer", signature: good }, SECRET, NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(verifySvixSignature(raw, { id: "msg_1", timestamp: T, signature: "nada" }, SECRET, NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(verifySvixSignature(raw, { id: "msg_1", timestamp: T, signature: "v1,AAAA" }, SECRET, NOW)).toEqual({ ok: false, reason: "mismatch" });
    expect(verifySvixSignature("{ }", { id: "msg_1", timestamp: T, signature: good }, SECRET, NOW)).toEqual({ ok: false, reason: "mismatch" });
    expect(verifySvixSignature(raw, { id: "msg_1", timestamp: T, signature: good }, SECRET, new Date(NOW.getTime() + 6 * 60_000))).toEqual({ ok: false, reason: "expired" });
  });
});

describe("AVI-02 · del evento de Resend a lo que cambia un aviso", () => {
  it("AVI-02 · entregado; rebote permanente = no entregable; fallo = fallido", () => {
    expect(parseResendEvent(event("email.delivered"))).toEqual({ noticeId: ID, messageId: "re_abc", event: "delivered" });
    expect(parseResendEvent(event("email.bounced", { bounce: { type: "Permanent", subType: "General" } }))).toEqual({
      noticeId: ID,
      messageId: "re_abc",
      event: "undeliverable",
      error: "resend_bounce",
    });
    expect(parseResendEvent(event("email.failed"))).toEqual({ noticeId: ID, messageId: "re_abc", event: "failed", error: "resend_failed" });
  });

  it("AVI-02 · el rebote temporal, la queja, abrir y pinchar no cambian el aviso (un entregado no vuelve atrás)", () => {
    expect(parseResendEvent(event("email.bounced", { bounce: { type: "Transient" } }))).toBeNull();
    expect(parseResendEvent(event("email.bounced"))).toBeNull();
    for (const type of ["email.complained", "email.opened", "email.clicked", "email.sent", "email.delivery_delayed", "domain.updated"]) {
      expect(parseResendEvent(event(type)), type).toBeNull();
    }
  });

  it("AVI-02 · sin la etiqueta se busca por el identificador del correo; sin ninguna de las dos, nada", () => {
    expect(parseResendEvent(event("email.delivered", { tags: {} }))).toEqual({ noticeId: null, messageId: "re_abc", event: "delivered" });
    expect(parseResendEvent(event("email.delivered", { tags: { notice_id: "no-es-un-uuid" } }))).toEqual({ noticeId: null, messageId: "re_abc", event: "delivered" });
    expect(parseResendEvent(event("email.delivered", { tags: {}, email_id: undefined }))).toBeNull();
  });

  it("AVI-02 · lo que no es un evento legible", () => {
    expect(parseResendEvent("no es json")).toBe("unreadable");
    expect(parseResendEvent("[]")).toBe("unreadable");
    expect(parseResendEvent(JSON.stringify({ type: 1 }))).toBe("unreadable");
  });
});

describe("AVI-02 · lo que se hace con los avisos de Resend", () => {
  it("AVI-02 · sin secreto del webhook, 503 y no se toca nada", async () => {
    const h = harness();
    expect((await handleEmailWebhook(request(event("email.delivered"), { webhookSecret: undefined }), h.gateway)).status).toBe(503);
    expect(h.events).toHaveLength(0);
  });

  it("AVI-02 · una firma que no cuadra es un 400 y no se toca nada", async () => {
    const h = harness();
    const result = await handleEmailWebhook(request(event("email.delivered"), { svixSignature: "v1,falsa" }), h.gateway);
    expect(result.status).toBe(400);
    expect(h.events).toHaveLength(0);
  });

  it("AVI-02 · un entregado se apunta; un rebote permanente se apunta como no entregable (el incidente lo deja la base de datos)", async () => {
    const h = harness();
    expect((await handleEmailWebhook(request(event("email.delivered")), h.gateway)).status).toBe(200);
    expect((await handleEmailWebhook(request(event("email.bounced", { bounce: { type: "Permanent" } })), h.gateway)).status).toBe(200);
    expect(h.events).toEqual([
      { noticeId: ID, provider: "resend", providerMessageId: "re_abc", event: "delivered" },
      { noticeId: ID, provider: "resend", providerMessageId: "re_abc", event: "undeliverable", error: "resend_bounce" },
    ]);
  });

  it("AVI-02 · un evento ajeno o ilegible se contesta 200", async () => {
    const h = harness();
    expect(await handleEmailWebhook(request(event("email.opened")), h.gateway)).toMatchObject({ status: 200, body: { outcome: "ignored" } });
    expect(await handleEmailWebhook(request("no es json"), h.gateway)).toMatchObject({ status: 200, body: { outcome: "unreadable" } });
    expect(h.events).toHaveLength(0);
  });

  it("AVI-02 · un fallo de la base de datos es un 500 (Resend reintenta) y no cuenta datos del comensal", async () => {
    const h = harness(true);
    const result = await handleEmailWebhook(request(event("email.delivered")), h.gateway);
    expect(result.status).toBe(500);
    expect(JSON.stringify(result)).not.toContain("nuria");
  });
});
