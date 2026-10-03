import { describe, expect, it, vi } from "vitest";

import { signWebhookPayload } from "./stripe";
import { handleStripeWebhook, type TopupGateway, type TopupOutcome } from "./stripe-webhook";

const SECRET = "whsec_prueba";
const NOW = new Date("2026-10-03T12:00:00Z");
const NOW_S = Math.floor(NOW.getTime() / 1000);

function gateway(outcome: TopupOutcome = { outcome: "credited", entry_id: "e1", topup_id: "t1" }) {
  return {
    completeTopup: vi.fn(async () => outcome),
    expireTopup: vi.fn(async () => true),
  } satisfies TopupGateway;
}

const completed = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_1", amount_total: 2420, currency: "eur", payment_status: "paid", ...extra } },
  });

const signed = (body: string, secret = SECRET, at = NOW_S) => ({
  rawBody: body,
  signature: signWebhookPayload(body, secret, at),
  webhookSecret: SECRET,
  now: NOW,
});

describe("RN-AGT-04 · el webhook de Stripe", () => {
  it("sin secreto configurado, 503: no se acepta nada que no se pueda comprobar", async () => {
    const g = gateway();
    const r = await handleStripeWebhook({ rawBody: completed(), signature: "t=1,v1=00", webhookSecret: undefined }, g);
    expect(r.status).toBe(503);
    expect(g.completeTopup).not.toHaveBeenCalled();
  });

  it("firma falsa, 400 y no se apunta nada", async () => {
    const g = gateway();
    const body = completed();
    const r = await handleStripeWebhook(signed(body, "whsec_de_otro"), g);
    expect(r.status).toBe(400);
    expect(g.completeTopup).not.toHaveBeenCalled();
    expect(r.log).toContain("mismatch");
  });

  it("firma caducada, 400", async () => {
    const g = gateway();
    const body = completed();
    const r = await handleStripeWebhook(signed(body, SECRET, NOW_S - 3600), g);
    expect(r.status).toBe(400);
    expect(g.completeTopup).not.toHaveBeenCalled();
  });

  it("sin cabecera de firma, 400", async () => {
    const g = gateway();
    const r = await handleStripeWebhook({ rawBody: completed(), signature: null, webhookSecret: SECRET, now: NOW }, g);
    expect(r.status).toBe(400);
  });

  it("un pago que cuadra se apunta con la sesión, el total y la moneda, y pide el push del recibo", async () => {
    const g = gateway();
    const r = await handleStripeWebhook(signed(completed()), g);
    expect(r.status).toBe(200);
    expect(r.body.outcome).toBe("credited");
    expect(g.completeTopup).toHaveBeenCalledWith("cs_test_1", 2420, "eur");
    expect(r.receiptKey).toBe("agent_topup_receipt:t1");
  });

  it("el mismo webhook otra vez (ya apuntado): 200, y no vuelve a pedir el push", async () => {
    const g = gateway({ outcome: "already", entry_id: "e1", topup_id: "t1" });
    const r = await handleStripeWebhook(signed(completed()), g);
    expect(r.status).toBe(200);
    expect(r.body.outcome).toBe("already");
    expect(r.receiptKey).toBeUndefined();
  });

  it("una sesión que no es nuestra: 200 (reintentar no la hace nuestra) y queda dicho en el registro", async () => {
    const r = await handleStripeWebhook(signed(completed()), gateway({ outcome: "unknown" }));
    expect(r.status).toBe(200);
    expect(r.body.outcome).toBe("unknown");
    expect(r.log).toMatch(/ninguna recarga apuntada/);
    expect(r.receiptKey).toBeUndefined();
  });

  it("un pago que no cuadra: 200 y queda dicho en el registro; la base ya dejó el incidente", async () => {
    const r = await handleStripeWebhook(signed(completed()), gateway({ outcome: "mismatch", topup_id: "t1" }));
    expect(r.status).toBe(200);
    expect(r.body.outcome).toBe("mismatch");
    expect(r.log).toContain("incidente");
    expect(r.receiptKey).toBeUndefined();
  });

  it("un pago todavía sin cobrar (método asíncrono) no sube el saldo", async () => {
    const g = gateway();
    const r = await handleStripeWebhook(signed(completed({ payment_status: "unpaid" })), g);
    expect(r.status).toBe(200);
    expect(r.body.outcome).toBe("not_paid_yet");
    expect(g.completeTopup).not.toHaveBeenCalled();
  });

  it("checkout.session.expired caduca la recarga", async () => {
    const g = gateway();
    const body = JSON.stringify({ type: "checkout.session.expired", data: { object: { id: "cs_test_1" } } });
    const r = await handleStripeWebhook(signed(body), g);
    expect(r.status).toBe(200);
    expect(r.body.outcome).toBe("expired");
    expect(g.expireTopup).toHaveBeenCalledWith("cs_test_1");
  });

  it("cualquier otro evento firmado se ignora con 200", async () => {
    const g = gateway();
    const body = JSON.stringify({ type: "charge.refunded", data: { object: { id: "ch_1" } } });
    const r = await handleStripeWebhook(signed(body), g);
    expect(r.status).toBe(200);
    expect(r.body.outcome).toBe("ignored");
    expect(g.completeTopup).not.toHaveBeenCalled();
    expect(g.expireTopup).not.toHaveBeenCalled();
  });

  it("un cuerpo firmado pero ilegible: 200 (no se puede arreglar reintentando)", async () => {
    const r = await handleStripeWebhook(signed("{no es json"), gateway());
    expect(r.status).toBe(200);
    expect(r.body.outcome).toBe("unreadable");
  });

  it("si la base de datos falla: 500, para que Stripe reintente (la función es idempotente)", async () => {
    const g: TopupGateway = {
      completeTopup: async () => {
        throw new Error("conexión perdida");
      },
      expireTopup: async () => true,
    };
    const r = await handleStripeWebhook(signed(completed()), g);
    expect(r.status).toBe(500);
    expect(r.log).toContain("conexión perdida");
  });
});
