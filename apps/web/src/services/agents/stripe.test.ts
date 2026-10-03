import { describe, expect, it, vi } from "vitest";

import {
  checkoutBody,
  createCheckoutSession,
  parseWebhookEvent,
  signWebhookPayload,
  SIGNATURE_TOLERANCE_SECONDS,
  StripeError,
  stripeStatus,
  verifyWebhookSignature,
  type CheckoutInput,
  type StripeFetch,
} from "./stripe";

const SECRET = "whsec_prueba_123";
const NOW = new Date("2026-10-03T12:00:00Z");
const NOW_S = Math.floor(NOW.getTime() / 1000);

const INPUT: CheckoutInput = {
  topupId: "11111111-2222-3333-4444-555555555555",
  establishmentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  netCents: 2000,
  vatCents: 420,
  vatRatePercent: 21,
  successUrl: "https://x.test/agents/e1/saldo?recarga=ok",
  cancelUrl: "https://x.test/agents/e1/saldo?recarga=cancelada",
  customerEmail: "info@casapepe.test",
  labels: { product: "Recarga de saldo de Restavor agents", vat: "IVA" },
};

describe("RN-AGT-04 · qué hay configurado de Stripe (decisión 144: sin ello, «Próximamente»)", () => {
  it("sin clave ni secreto, las recargas con tarjeta no están listas", () => {
    expect(stripeStatus({})).toEqual({ ready: false, hasSecretKey: false, hasWebhookSecret: false, mode: null });
  });

  it("con la clave pero sin el secreto del webhook tampoco: se cobraría sin saber que se cobró", () => {
    const s = stripeStatus({ STRIPE_SECRET_KEY: "sk_test_abc" });
    expect(s.ready).toBe(false);
    expect(s.hasSecretKey).toBe(true);
    expect(s.hasWebhookSecret).toBe(false);
  });

  it("con las dos, listas; el modo sale del prefijo y la clave nunca sale", () => {
    expect(stripeStatus({ STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_x" })).toEqual({
      ready: true,
      hasSecretKey: true,
      hasWebhookSecret: true,
      mode: "test",
    });
    expect(stripeStatus({ STRIPE_SECRET_KEY: "sk_live_abc", STRIPE_WEBHOOK_SECRET: "whsec_x" }).mode).toBe("live");
  });

  it("una clave que no parece de Stripe no vale", () => {
    expect(stripeStatus({ STRIPE_SECRET_KEY: "cualquier-cosa", STRIPE_WEBHOOK_SECRET: "whsec_x" }).ready).toBe(false);
  });

  it("los espacios en blanco de pegar la variable no cuentan", () => {
    expect(stripeStatus({ STRIPE_SECRET_KEY: "  ", STRIPE_WEBHOOK_SECRET: "  " }).hasSecretKey).toBe(false);
  });
});

describe("RN-AGT-04 · la firma del webhook", () => {
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

  it("una firma válida pasa", () => {
    const header = signWebhookPayload(body, SECRET, NOW_S);
    expect(verifyWebhookSignature(body, header, SECRET, NOW)).toEqual({ ok: true });
  });

  it("una firma falsa (otro secreto) no pasa", () => {
    const header = signWebhookPayload(body, "whsec_otro", NOW_S);
    expect(verifyWebhookSignature(body, header, SECRET, NOW)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("un cuerpo cambiado no pasa: la firma es del texto exacto", () => {
    const header = signWebhookPayload(body, SECRET, NOW_S);
    expect(verifyWebhookSignature(body.replace("evt_1", "evt_2"), header, SECRET, NOW)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("una firma caducada (fuera de los 5 minutos) no pasa, aunque sea auténtica", () => {
    const header = signWebhookPayload(body, SECRET, NOW_S - SIGNATURE_TOLERANCE_SECONDS - 1);
    expect(verifyWebhookSignature(body, header, SECRET, NOW)).toEqual({ ok: false, reason: "expired" });
  });

  it("justo en el límite todavía pasa, y una marca del futuro lejano tampoco", () => {
    expect(verifyWebhookSignature(body, signWebhookPayload(body, SECRET, NOW_S - SIGNATURE_TOLERANCE_SECONDS), SECRET, NOW)).toEqual({ ok: true });
    expect(verifyWebhookSignature(body, signWebhookPayload(body, SECRET, NOW_S + 3600), SECRET, NOW)).toEqual({ ok: false, reason: "expired" });
  });

  it("sin cabecera, o con una cabecera que no se entiende, no pasa", () => {
    expect(verifyWebhookSignature(body, null, SECRET, NOW)).toEqual({ ok: false, reason: "missing" });
    expect(verifyWebhookSignature(body, "", SECRET, NOW)).toEqual({ ok: false, reason: "missing" });
    expect(verifyWebhookSignature(body, "basura", SECRET, NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyWebhookSignature(body, `t=${NOW_S}`, SECRET, NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyWebhookSignature(body, `t=abc,v1=${"0".repeat(64)}`, SECRET, NOW)).toEqual({ ok: false, reason: "malformed" });
  });

  it("una firma que no es hexadecimal o tiene otra longitud no rompe: no pasa", () => {
    expect(verifyWebhookSignature(body, `t=${NOW_S},v1=zzzz`, SECRET, NOW)).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyWebhookSignature(body, `t=${NOW_S},v1=abcd`, SECRET, NOW)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("con varias firmas v1 (rotación de secretos), basta una buena", () => {
    const good = signWebhookPayload(body, SECRET, NOW_S).split("v1=")[1];
    const header = `t=${NOW_S},v1=${"0".repeat(64)},v1=${good}`;
    expect(verifyWebhookSignature(body, header, SECRET, NOW)).toEqual({ ok: true });
  });
});

describe("RN-AGT-04 · lo que llega en el webhook", () => {
  const completed = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_1", amount_total: 2420, currency: "eur", payment_status: "paid", ...extra } },
    });

  it("checkout.session.completed → la sesión, el importe cobrado y si está pagada", () => {
    expect(parseWebhookEvent(completed())).toEqual({ kind: "completed", sessionId: "cs_test_1", amountTotal: 2420, currency: "eur", paid: true });
  });

  it("sin pagar todavía (un método asíncrono) se lee, pero no está pagada", () => {
    expect(parseWebhookEvent(completed({ payment_status: "unpaid" }))).toMatchObject({ kind: "completed", paid: false });
  });

  it("checkout.session.expired → caduca esa sesión", () => {
    const body = JSON.stringify({ type: "checkout.session.expired", data: { object: { id: "cs_test_9" } } });
    expect(parseWebhookEvent(body)).toEqual({ kind: "expired", sessionId: "cs_test_9" });
  });

  it("cualquier otro evento se ignora (y se contesta 200 para que Stripe no reintente)", () => {
    expect(parseWebhookEvent(JSON.stringify({ type: "charge.refunded", data: { object: { id: "ch_1" } } }))).toEqual({
      kind: "ignored",
      type: "charge.refunded",
    });
  });

  it("lo que no es JSON, o no trae lo necesario, no se entiende", () => {
    expect(parseWebhookEvent("no es json")).toBeNull();
    expect(parseWebhookEvent("[]")).toBeNull();
    expect(parseWebhookEvent(JSON.stringify({ data: {} }))).toBeNull();
    expect(parseWebhookEvent(JSON.stringify({ type: "checkout.session.completed", data: { object: { amount_total: 1 } } }))).toBeNull();
    expect(parseWebhookEvent(completed({ amount_total: "2420" }))).toBeNull();
    expect(parseWebhookEvent(completed({ amount_total: 24.2 }))).toBeNull();
  });
});

describe("RN-AGT-04 · la Checkout Session", () => {
  it("el cuerpo lleva neto e IVA en dos líneas (la suma es lo que se paga) y la recarga como referencia", () => {
    const body = checkoutBody(INPUT);
    expect(body.get("mode")).toBe("payment");
    expect(body.get("payment_method_types[0]")).toBe("card");
    expect(body.get("line_items[0][price_data][unit_amount]")).toBe("2000");
    expect(body.get("line_items[0][price_data][product_data][name]")).toBe("Recarga de saldo de Restavor agents");
    expect(body.get("line_items[1][price_data][unit_amount]")).toBe("420");
    expect(body.get("line_items[1][price_data][product_data][name]")).toBe("IVA (21 %)");
    expect(body.get("line_items[0][price_data][currency]")).toBe("eur");
    expect(body.get("client_reference_id")).toBe(INPUT.topupId);
    expect(body.get("metadata[topup_id]")).toBe(INPUT.topupId);
    expect(body.get("metadata[establishment_id]")).toBe(INPUT.establishmentId);
    expect(body.get("customer_email")).toBe("info@casapepe.test");
  });

  it("sin IVA no hay segunda línea; sin correo, no se manda", () => {
    const body = checkoutBody({ ...INPUT, vatCents: 0, customerEmail: null });
    expect(body.get("line_items[1][price_data][unit_amount]")).toBeNull();
    expect(body.get("customer_email")).toBeNull();
  });

  it("la petición va con la clave, como formulario y con la recarga de clave de idempotencia", async () => {
    const fetchImpl = vi.fn<StripeFetch>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "cs_test_nueva", url: "https://checkout.stripe.com/c/pay/cs_test_nueva" }),
    }));
    const session = await createCheckoutSession("sk_test_abc", INPUT, fetchImpl);
    expect(session).toEqual({ id: "cs_test_nueva", url: "https://checkout.stripe.com/c/pay/cs_test_nueva" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer sk_test_abc");
    expect(init.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(init.headers["idempotency-key"]).toBe(`topup-${INPUT.topupId}`);
    expect(init.body).toContain("mode=payment");
  });

  it("si Stripe rechaza la petición se dice con su motivo", async () => {
    const fetchImpl: StripeFetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "Invalid API Key" } }) });
    await expect(createCheckoutSession("sk_test_mala", INPUT, fetchImpl)).rejects.toMatchObject({
      name: "StripeError",
      message: "Invalid API Key",
      status: 400,
    });
  });

  it("si no hay red, se dice y no se inventa una sesión", async () => {
    const fetchImpl: StripeFetch = async () => {
      throw new Error("ECONNRESET");
    };
    await expect(createCheckoutSession("sk_test_abc", INPUT, fetchImpl)).rejects.toBeInstanceOf(StripeError);
  });

  it("si Stripe contesta bien pero sin página de pago, tampoco se inventa", async () => {
    const fetchImpl: StripeFetch = async () => ({ ok: true, status: 200, json: async () => ({ id: "cs_test_x" }) });
    await expect(createCheckoutSession("sk_test_abc", INPUT, fetchImpl)).rejects.toMatchObject({ message: "Stripe no devolvió la página de pago" });
  });
});
