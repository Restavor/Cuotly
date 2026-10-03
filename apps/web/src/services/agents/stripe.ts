/**
 * `src/services/agents/stripe.ts` · Stripe, solo para recargar el saldo de Restavor agents (Fase E2;
 * PRD de agents §10.5, decisión D-C y decisión 138 de `docs/DECISIONES.md`).
 *
 * **Sin dependencia**: la superficie es una llamada (crear una Checkout Session) y comprobar la firma de un
 * webhook, que se hace con `node:crypto`. El transporte es `fetch`, **inyectable**, para que los tests no
 * toquen la red. Lo demás de Restavor sigue sin Stripe (los pagos se registran a mano).
 *
 * Qué hay configurado se decide aquí y de un solo sitio: sin `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` las
 * recargas con tarjeta están «Próximamente» (decisión 144): hace falta la clave para cobrar y el secreto del
 * webhook para saber que se cobró, y una sin la otra dejaría dinero cobrado sin apuntar.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_API = "https://api.stripe.com/v1";

/** Cuánto puede alejarse la marca de tiempo de la firma de «ahora» (la recomendación de Stripe: 5 minutos). */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export interface StripeEnv {
  readonly STRIPE_SECRET_KEY?: string | undefined;
  readonly STRIPE_WEBHOOK_SECRET?: string | undefined;
}

export type StripeMode = "test" | "live";

export interface StripeStatus {
  /** Las recargas con tarjeta se pueden ofrecer: hay clave y hay secreto de webhook. */
  readonly ready: boolean;
  readonly hasSecretKey: boolean;
  readonly hasWebhookSecret: boolean;
  /** Por el prefijo de la clave (`sk_test_` o `sk_live_`); nunca se enseña la clave. */
  readonly mode: StripeMode | null;
}

export function stripeStatus(env: StripeEnv = process.env as StripeEnv): StripeStatus {
  const key = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  const mode: StripeMode | null = key.startsWith("sk_test_") || key.startsWith("rk_test_")
    ? "test"
    : key.startsWith("sk_live_") || key.startsWith("rk_live_")
      ? "live"
      : null;
  return { ready: key !== "" && secret !== "" && mode !== null, hasSecretKey: key !== "", hasWebhookSecret: secret !== "", mode };
}

// ---------------------------------------------------------------------------
// La Checkout Session
// ---------------------------------------------------------------------------
export interface CheckoutInput {
  readonly topupId: string;
  readonly establishmentId: string;
  readonly netCents: number;
  readonly vatCents: number;
  readonly vatRatePercent: number;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly customerEmail?: string | null;
  /** Los textos que ve el restaurante en la página de pago de Stripe (en español, por i18n en quien llama). */
  readonly labels: { readonly product: string; readonly vat: string };
}

export interface CheckoutSession {
  readonly id: string;
  readonly url: string;
}

export type StripeFetch = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "StripeError";
  }
}

/** El cuerpo de la petición (formulario, como pide Stripe): neto e IVA en dos líneas, el total es su suma. */
export function checkoutBody(input: CheckoutInput): URLSearchParams {
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("payment_method_types[0]", "card");
  body.set("locale", "es");
  body.set("client_reference_id", input.topupId);
  body.set("success_url", input.successUrl);
  body.set("cancel_url", input.cancelUrl);
  body.set("metadata[topup_id]", input.topupId);
  body.set("metadata[establishment_id]", input.establishmentId);
  if (input.customerEmail) body.set("customer_email", input.customerEmail);

  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "eur");
  body.set("line_items[0][price_data][unit_amount]", String(input.netCents));
  body.set("line_items[0][price_data][product_data][name]", input.labels.product);
  if (input.vatCents > 0) {
    body.set("line_items[1][quantity]", "1");
    body.set("line_items[1][price_data][currency]", "eur");
    body.set("line_items[1][price_data][unit_amount]", String(input.vatCents));
    body.set(
      "line_items[1][price_data][product_data][name]",
      `${input.labels.vat} (${String(Number(input.vatRatePercent)).replace(".", ",")} %)`,
    );
  }
  return body;
}

/**
 * Crea la Checkout Session de una recarga. La clave de idempotencia es la propia recarga: pulsar «Pagar» dos
 * veces pide la misma sesión, no dos.
 */
export async function createCheckoutSession(
  secretKey: string,
  input: CheckoutInput,
  fetchImpl: StripeFetch = fetch as unknown as StripeFetch,
): Promise<CheckoutSession> {
  let response;
  try {
    response = await fetchImpl(`${STRIPE_API}/checkout/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": `topup-${input.topupId}`,
      },
      body: checkoutBody(input).toString(),
    });
  } catch {
    throw new StripeError("No se pudo hablar con Stripe", null);
  }
  const payload = (await response.json().catch(() => null)) as { id?: unknown; url?: unknown; error?: { message?: unknown } } | null;
  if (!response.ok) {
    const message = typeof payload?.error?.message === "string" ? payload.error.message : "Stripe rechazó la petición";
    throw new StripeError(message, response.status);
  }
  if (typeof payload?.id !== "string" || typeof payload.url !== "string") {
    throw new StripeError("Stripe no devolvió la página de pago", response.status);
  }
  return { id: payload.id, url: payload.url };
}

// ---------------------------------------------------------------------------
// El webhook
// ---------------------------------------------------------------------------
export type SignatureProblem = "missing" | "malformed" | "mismatch" | "expired";

export type SignatureResult = { readonly ok: true } | { readonly ok: false; readonly reason: SignatureProblem };

/**
 * Comprueba la cabecera `Stripe-Signature` (`t=<marca>,v1=<firma>[,v1=<firma>]`): HMAC-SHA256 de
 * `<marca>.<cuerpo en bruto>` con el secreto del webhook, comparado sin dar pistas por el tiempo, y con la
 * marca dentro de la tolerancia. El cuerpo tiene que ser el texto exacto que llegó, sin volver a serializar.
 */
export function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  now: Date = new Date(),
  toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS,
): SignatureResult {
  if (!header) return { ok: false, reason: "missing" };
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2).map((p) => p.trim());
    if (key === "t" && value) timestamp = value;
    else if (key === "v1" && value) signatures.push(value);
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return { ok: false, reason: "malformed" };

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  const matches = signatures.some((signature) => {
    if (!/^[0-9a-f]+$/i.test(signature) || signature.length !== expected.length * 2) return false;
    return timingSafeEqual(Buffer.from(signature, "hex"), expected);
  });
  if (!matches) return { ok: false, reason: "mismatch" };

  const ageSeconds = Math.abs(now.getTime() / 1000 - Number(timestamp));
  if (ageSeconds > toleranceSeconds) return { ok: false, reason: "expired" };
  return { ok: true };
}

/** Firma un cuerpo como lo hace Stripe: para los tests y para el e2e con el secreto de pruebas. */
export function signWebhookPayload(rawBody: string, secret: string, timestampSeconds: number): string {
  const signature = createHmac("sha256", secret).update(`${timestampSeconds}.${rawBody}`).digest("hex");
  return `t=${timestampSeconds},v1=${signature}`;
}

export type StripeWebhookEvent =
  | { readonly kind: "completed"; readonly sessionId: string; readonly amountTotal: number; readonly currency: string; readonly paid: boolean }
  | { readonly kind: "expired"; readonly sessionId: string }
  | { readonly kind: "ignored"; readonly type: string };

/** De lo que manda Stripe, solo lo que usamos; el resto se ignora (y se contesta 200 para que no reintente). */
export function parseWebhookEvent(rawBody: string): StripeWebhookEvent | null {
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (typeof event !== "object" || event === null) return null;
  const { type, data } = event as { type?: unknown; data?: { object?: Record<string, unknown> } };
  if (typeof type !== "string") return null;
  const object = data?.object;

  if (type === "checkout.session.completed" || type === "checkout.session.expired") {
    if (!object || typeof object.id !== "string") return null;
    if (type === "checkout.session.expired") return { kind: "expired", sessionId: object.id };
    const amount = object.amount_total;
    const currency = object.currency;
    if (typeof amount !== "number" || !Number.isInteger(amount) || typeof currency !== "string") return null;
    return { kind: "completed", sessionId: object.id, amountTotal: amount, currency, paid: object.payment_status === "paid" };
  }
  return { kind: "ignored", type };
}
