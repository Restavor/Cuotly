/**
 * `src/services/agents/stripe-webhook.ts` · qué se hace con lo que Stripe cuenta de una recarga (Fase E2;
 * PRD de agents §5.2 RN-AGT-04 y §10.5).
 *
 * La ruta (`/api/agents/webhooks/stripe`) solo pasa el cuerpo en bruto y la cabecera; aquí se decide el
 * código de respuesta y qué función de la base de datos se llama. Con la base detrás de una interfaz, los
 * tests no necesitan ni red ni base. Reglas:
 *
 *   · Sin secreto del webhook configurado, 503: no se acepta nada que no se pueda comprobar.
 *   · Firma que no cuadra o caducada, 400: nadie sin el secreto puede subir un saldo.
 *   · Un evento que no entendemos o que no es nuestro, 200 (Stripe reintenta hasta tres días lo que no
 *     contesta 2xx, y reintentarlo no lo arreglaría).
 *   · Un fallo de la base de datos, 500: ahí sí interesa que Stripe lo reintente, y la función es
 *     idempotente por sesión (el mismo webhook dos veces es un solo apunte).
 *   · Un pago que no cuadra con lo pedido se apunta como incidente y se contesta 200: reintentar no lo
 *     arregla y hay una persona que tiene que mirarlo (la función lo deja anotado).
 */
import { parseWebhookEvent, verifyWebhookSignature, type StripeWebhookEvent } from "./stripe";

export interface TopupOutcome {
  readonly outcome: "credited" | "already" | "unknown" | "mismatch";
  readonly entry_id?: string;
  readonly topup_id?: string;
}

export interface TopupGateway {
  completeTopup(sessionId: string, amountTotalCents: number, currency: string): Promise<TopupOutcome>;
  expireTopup(sessionId: string): Promise<boolean>;
}

export interface WebhookRequest {
  readonly rawBody: string;
  readonly signature: string | null;
  readonly webhookSecret: string | undefined;
  readonly now?: Date;
}

export interface WebhookResponse {
  readonly status: 200 | 400 | 500 | 503;
  readonly body: { readonly received?: boolean; readonly outcome?: string; readonly error?: string };
  /** Lo que hay que mandar al momento al restaurante: la clave del recibo de una recarga recién apuntada. */
  readonly receiptKey?: string;
  /** Una nota para el registro del servidor (nunca datos de pago ni la firma). */
  readonly log?: string;
}

export async function handleStripeWebhook(request: WebhookRequest, gateway: TopupGateway): Promise<WebhookResponse> {
  if (!request.webhookSecret) {
    return { status: 503, body: { error: "Las recargas con tarjeta no están configuradas en este entorno" } };
  }
  const signature = verifyWebhookSignature(request.rawBody, request.signature, request.webhookSecret, request.now);
  if (!signature.ok) {
    return { status: 400, body: { error: "Firma no válida" }, log: `firma rechazada (${signature.reason})` };
  }

  const event: StripeWebhookEvent | null = parseWebhookEvent(request.rawBody);
  if (event === null) {
    return { status: 200, body: { received: true, outcome: "unreadable" }, log: "evento firmado pero ilegible" };
  }
  if (event.kind === "ignored") {
    return { status: 200, body: { received: true, outcome: "ignored" } };
  }

  try {
    if (event.kind === "expired") {
      const expired = await gateway.expireTopup(event.sessionId);
      return { status: 200, body: { received: true, outcome: expired ? "expired" : "nothing_to_expire" } };
    }

    // Un pago asíncrono todavía sin cobrar no sube el saldo: llegará su propio aviso.
    if (!event.paid) {
      return { status: 200, body: { received: true, outcome: "not_paid_yet" } };
    }

    const result = await gateway.completeTopup(event.sessionId, event.amountTotal, event.currency);
    if (result.outcome === "credited" && result.topup_id) {
      return {
        status: 200,
        body: { received: true, outcome: "credited" },
        receiptKey: `agent_topup_receipt:${result.topup_id}`,
      };
    }
    if (result.outcome === "mismatch") {
      return {
        status: 200,
        body: { received: true, outcome: "mismatch" },
        log: "una recarga pagada no coincide con la pedida: queda un incidente para Restavor",
      };
    }
    if (result.outcome === "unknown") {
      // Un pago de una sesión que ninguna recarga nuestra tiene apuntada: puede ser de otra cosa de la misma cuenta de Stripe
      // o una recarga cuya sesión no llegó a apuntarse. Se contesta 200 (no hay nada que reintentar) y se deja rastro.
      return {
        status: 200,
        body: { received: true, outcome: "unknown" },
        log: "un pago de Stripe no corresponde a ninguna recarga apuntada: si es una recarga, hay que mirarla a mano",
      };
    }
    return { status: 200, body: { received: true, outcome: result.outcome } };
  } catch (error) {
    return {
      status: 500,
      body: { error: "No se pudo apuntar la recarga" },
      log: `fallo al apuntar la recarga: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
