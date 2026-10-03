/**
 * `src/services/agents/messaging/webhook-email.ts` · lo que se hace con lo que Resend cuenta de un correo (Fase F;
 * PRD de agents §10.4: «Rebotes → incidente»).
 *
 * Resend firma sus webhooks con Svix: cabeceras `svix-id`, `svix-timestamp` y `svix-signature`
 * (`v1,<base64>`, puede haber varias separadas por espacios). Se firma `<id>.<marca>.<cuerpo en bruto>` con
 * HMAC-SHA256 y como clave los bytes del secreto (`whsec_<base64>`) ya descodificados.
 *
 * El correo se encuentra por la etiqueta `notice_id` que mandamos al enviar o, si no, por el `email_id`. Un rebote
 * permanente es «no entregable» (la base de datos deja el aviso fallido y un incidente con el correo enmascarado); los
 * rebotes temporales y las quejas no cambian el aviso (un entregado no vuelve atrás).
 */
import type { NoticeGateway, ProviderEvent } from "./gateway";
import { hmacBase64, isRecord, isUuid, safeEqual, type WebhookResponse } from "./webhook-common";

/** Cuánto puede alejarse la marca de tiempo de la firma de «ahora» (los cinco minutos de la recomendación de Svix). */
export const SVIX_TOLERANCE_SECONDS = 300;

export type SvixProblem = "missing" | "malformed" | "mismatch" | "expired";
export type SvixResult = { readonly ok: true } | { readonly ok: false; readonly reason: SvixProblem };

function svixKey(secret: string): Buffer {
  return Buffer.from(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret, "base64");
}

/** Firma un cuerpo como lo hace Svix: para los tests y para el e2e con un secreto de pruebas. */
export function signSvixPayload(id: string, timestampSeconds: number, rawBody: string, secret: string): string {
  return `v1,${hmacBase64("sha256", svixKey(secret), `${id}.${timestampSeconds}.${rawBody}`)}`;
}

export function verifySvixSignature(
  rawBody: string,
  headers: { readonly id: string | null; readonly timestamp: string | null; readonly signature: string | null },
  secret: string,
  now: Date = new Date(),
  toleranceSeconds: number = SVIX_TOLERANCE_SECONDS,
): SvixResult {
  if (!headers.id || !headers.timestamp || !headers.signature) return { ok: false, reason: "missing" };
  if (!/^\d+$/.test(headers.timestamp)) return { ok: false, reason: "malformed" };
  const expected = signSvixPayload(headers.id, Number(headers.timestamp), rawBody, secret);
  const candidates = headers.signature.split(" ").filter((s) => s.startsWith("v1,"));
  if (candidates.length === 0) return { ok: false, reason: "malformed" };
  if (!candidates.some((candidate) => safeEqual(candidate, expected))) return { ok: false, reason: "mismatch" };
  if (Math.abs(now.getTime() / 1000 - Number(headers.timestamp)) > toleranceSeconds) return { ok: false, reason: "expired" };
  return { ok: true };
}

export interface EmailWebhookRequest {
  readonly rawBody: string;
  readonly svixId: string | null;
  readonly svixTimestamp: string | null;
  readonly svixSignature: string | null;
  readonly webhookSecret: string | undefined;
  readonly now?: Date;
}

export interface ResendEvent {
  readonly noticeId: string | null;
  readonly messageId: string | null;
  readonly event: ProviderEvent;
  readonly error?: string;
}

/** Del evento de Resend, lo que cambia un aviso; `null` si no cambia nada. */
export function parseResendEvent(rawBody: string): ResendEvent | "unreadable" | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return "unreadable";
  }
  if (!isRecord(payload) || typeof payload.type !== "string" || !isRecord(payload.data)) return "unreadable";
  const data = payload.data;
  const tags = isRecord(data.tags) ? data.tags : {};
  const noticeId = isUuid(tags.notice_id) ? tags.notice_id : null;
  const messageId = typeof data.email_id === "string" && data.email_id !== "" ? data.email_id : null;
  if (noticeId === null && messageId === null) return null;
  switch (payload.type) {
    case "email.delivered":
      return { noticeId, messageId, event: "delivered" };
    case "email.bounced": {
      const type = isRecord(data.bounce) && typeof data.bounce.type === "string" ? data.bounce.type.toLowerCase() : "";
      return type === "permanent" ? { noticeId, messageId, event: "undeliverable", error: "resend_bounce" } : null;
    }
    case "email.failed":
      return { noticeId, messageId, event: "failed", error: "resend_failed" };
    default:
      return null;
  }
}

export async function handleEmailWebhook(request: EmailWebhookRequest, gateway: NoticeGateway): Promise<WebhookResponse> {
  if (!request.webhookSecret) return { status: 503, body: { error: "El webhook de correo no está configurado en este entorno" } };
  const signature = verifySvixSignature(
    request.rawBody,
    { id: request.svixId, timestamp: request.svixTimestamp, signature: request.svixSignature },
    request.webhookSecret,
    request.now,
  );
  if (!signature.ok) return { status: 400, body: { error: "Firma no válida" }, log: `firma de correo rechazada (${signature.reason})` };

  const event = parseResendEvent(request.rawBody);
  if (event === "unreadable") return { status: 200, body: { received: true, outcome: "unreadable" }, log: "evento de correo firmado pero ilegible" };
  if (event === null) return { status: 200, body: { received: true, outcome: "ignored" } };

  try {
    const result = await gateway.providerEvent({
      noticeId: event.noticeId,
      provider: "resend",
      providerMessageId: event.messageId,
      event: event.event,
      ...(event.error !== undefined ? { error: event.error } : {}),
    });
    return { status: 200, body: { received: true, outcome: result.outcome } };
  } catch (error) {
    return {
      status: 500,
      body: { error: "No se pudo apuntar el estado de un correo" },
      log: `fallo al apuntar un estado de correo: ${error instanceof Error ? error.message.slice(0, 80) : "error"}`,
    };
  }
}
