/**
 * `src/services/agents/messaging/webhook-whatsapp.ts` · lo que se hace con lo que Meta cuenta de los WhatsApp (Fase F;
 * PRD de agents §10.3, AVI-03).
 *
 * Dos rutas en una: (1) la **verificación** (GET con `hub.challenge`, una sola vez al configurar el webhook en Meta) y
 * (2) los **avisos** (POST firmado con `X-Hub-Signature-256` = HMAC-SHA256 del cuerpo con el secreto de la app).
 * Un POST trae estados de los mensajes que enviamos —entregado, fallido, y si se cobra o no (`pricing.billable`)— y
 * mensajes que los comensales escriben al número de Restavor, a los que se responde con el texto automático
 * (decisión 162: este número solo envía avisos y no lee mensajes).
 *
 * La firma es del texto EXACTO que llegó: el cuerpo se lee en bruto y no se vuelve a serializar. Los códigos de error
 * de Meta se guardan como código (`meta_131026`), nunca su texto.
 */
import { classifyMetaError } from "@/core/reservations/provider-errors";
import { whatsAppAutoReply } from "@/core/reservations/notice-texts";

import type { NoticeGateway, ProviderEvent } from "./gateway";
import type { WhatsAppProvider } from "./provider";
import { hmacHex, isRecord, isUuid, safeEqual, type WebhookResponse } from "./webhook-common";
import { CALLBACK_PREFIX } from "./whatsapp";

/** La firma de Meta: `sha256=<hex>` con el HMAC-SHA256 del cuerpo en bruto. */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const received = header.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  return safeEqual(received.toLowerCase(), hmacHex("sha256", appSecret, rawBody));
}

/** Firma un cuerpo como lo hace Meta: para los tests y para el e2e con un secreto de pruebas. */
export function signMetaPayload(rawBody: string, appSecret: string): string {
  return `sha256=${hmacHex("sha256", appSecret, rawBody)}`;
}

/**
 * La verificación del webhook: Meta llama con `hub.mode=subscribe`, `hub.verify_token` y `hub.challenge` y espera el
 * reto de vuelta como texto plano si el token es el nuestro.
 */
export function handleWhatsAppVerification(
  query: URLSearchParams,
  verifyToken: string | undefined,
): { readonly status: 200 | 403 | 503; readonly text: string } {
  if (!verifyToken) return { status: 503, text: "El webhook de WhatsApp no está configurado en este entorno" };
  const challenge = query.get("hub.challenge");
  const given = query.get("hub.verify_token");
  if (query.get("hub.mode") !== "subscribe" || given === null || challenge === null || !safeEqual(given, verifyToken)) {
    return { status: 403, text: "Token no válido" };
  }
  return { status: 200, text: challenge };
}

export interface MetaStatusEvent {
  readonly noticeId: string | null;
  readonly messageId: string | null;
  readonly event: ProviderEvent;
  readonly error?: string;
}

export interface MetaPayload {
  readonly statuses: readonly MetaStatusEvent[];
  /** Los teléfonos (E.164) que han escrito al número de Restavor. */
  readonly inbound: readonly string[];
}

function noticeIdOf(callbackData: unknown): string | null {
  if (typeof callbackData !== "string" || !callbackData.startsWith(CALLBACK_PREFIX)) return null;
  const id = callbackData.slice(CALLBACK_PREFIX.length);
  return isUuid(id) ? id : null;
}

/** De lo que manda Meta, solo lo que usamos. Lo que no cuadra se ignora. */
export function parseMetaPayload(rawBody: string): MetaPayload | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!isRecord(payload) || !Array.isArray(payload.entry)) return null;
  const statuses: MetaStatusEvent[] = [];
  const inbound: string[] = [];
  for (const entry of payload.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value)) continue;
      const value = change.value;
      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        if (!isRecord(status)) continue;
        const noticeId = noticeIdOf(status.biz_opaque_callback_data);
        const messageId = typeof status.id === "string" && status.id !== "" ? status.id : null;
        if (noticeId === null && messageId === null) continue;
        // «No cobrado» solo si Meta lo dice: `pricing.billable === false`.
        if (isRecord(status.pricing) && status.pricing.billable === false) statuses.push({ noticeId, messageId, event: "not_charged" });
        if (status.status === "delivered" || status.status === "read") {
          statuses.push({ noticeId, messageId, event: "delivered" });
        } else if (status.status === "failed") {
          const first = Array.isArray(status.errors) ? status.errors.find(isRecord) : undefined;
          const classified = classifyMetaError(typeof first?.code === "number" ? first.code : undefined, undefined);
          statuses.push({ noticeId, messageId, event: classified.kind === "undeliverable" ? "undeliverable" : "failed", error: classified.code });
        }
      }
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        if (isRecord(message) && typeof message.from === "string" && /^[1-9]\d{6,14}$/.test(message.from)) inbound.push(`+${message.from}`);
      }
    }
  }
  return { statuses, inbound };
}

export interface WhatsAppWebhookRequest {
  readonly rawBody: string;
  readonly signature: string | null;
  readonly appSecret: string | undefined;
}

export interface WhatsAppWebhookDeps {
  readonly gateway: NoticeGateway;
  readonly whatsapp: WhatsAppProvider;
}

export async function handleWhatsAppWebhook(request: WhatsAppWebhookRequest, deps: WhatsAppWebhookDeps): Promise<WebhookResponse> {
  if (!request.appSecret) return { status: 503, body: { error: "El webhook de WhatsApp no está configurado en este entorno" } };
  if (!verifyMetaSignature(request.rawBody, request.signature, request.appSecret)) {
    return { status: 400, body: { error: "Firma no válida" }, log: "firma de WhatsApp rechazada" };
  }
  const payload = parseMetaPayload(request.rawBody);
  if (payload === null) return { status: 200, body: { received: true, outcome: "unreadable" }, log: "evento de WhatsApp firmado pero ilegible" };

  try {
    let processed = 0;
    for (const status of payload.statuses) {
      const result = await deps.gateway.providerEvent({
        noticeId: status.noticeId,
        provider: "meta",
        providerMessageId: status.messageId,
        event: status.event,
        ...(status.error !== undefined ? { error: status.error } : {}),
      });
      if (result.outcome !== "unknown") processed += 1;
    }
    let replies = 0;
    for (const phone of new Set(payload.inbound)) {
      const context = await deps.gateway.autoreplyContext(phone);
      if (!context.allowed) continue;
      const text = whatsAppAutoReply(context.found ? context.language : null, context.found ? context.restaurant : null);
      const sent = await deps.whatsapp.sendText(phone, text);
      if (sent.ok) replies += 1;
    }
    return { status: 200, body: { received: true, processed, replies } };
  } catch (error) {
    return {
      status: 500,
      body: { error: "No se pudo apuntar el estado de un aviso" },
      log: `fallo al apuntar un estado de WhatsApp: ${error instanceof Error ? error.message.slice(0, 80) : "error"}`,
    };
  }
}
