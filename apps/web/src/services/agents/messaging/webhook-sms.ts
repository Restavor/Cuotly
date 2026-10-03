/**
 * `src/services/agents/messaging/webhook-sms.ts` · lo que se hace con el estado de un SMS (Fase F; AVI-04 y AVI-06).
 *
 * El proveedor (compatible con Twilio) avisa con un POST de formulario cuando un SMS se entrega o falla. Va firmado:
 * `X-Twilio-Signature` = base64(HMAC-SHA1 del token de autenticación sobre la URL **pública** más los parámetros
 * ordenados por nombre y pegados como `nombre` + `valor`). La URL que se firma es la que Restavor configuró (la
 * dirección pública del sitio), **no** la que ve el servidor detrás de su proxy: se pasa de fuera.
 *
 * El aviso se encuentra por `?notice=<id>` (que mandamos al enviar) o, si no, por el `MessageSid`. El precio real no
 * viene aquí: se pregunta aparte (`checkSmsPrices`).
 */
import { classifySmsError } from "@/core/reservations/provider-errors";

import type { NoticeGateway, ProviderEvent } from "./gateway";
import { hmacBase64, isUuid, safeEqual, type WebhookResponse } from "./webhook-common";

/** La firma de un envío del proveedor: base64(HMAC-SHA1(token, url + parámetros ordenados)). */
export function signSmsRequest(url: string, params: URLSearchParams, authToken: string): string {
  const sorted = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return hmacBase64("sha1", authToken, url + sorted.map(([key, value]) => key + value).join(""));
}

export function verifySmsSignature(url: string, params: URLSearchParams, header: string | null, authToken: string): boolean {
  if (!header) return false;
  return safeEqual(header, signSmsRequest(url, params, authToken));
}

export interface SmsWebhookRequest {
  readonly rawBody: string;
  readonly signature: string | null;
  readonly authToken: string | undefined;
  /** La URL pública completa de esta ruta, con su `?notice=…`: la que se firmó. */
  readonly publicUrl: string | undefined;
  readonly noticeId: string | null;
}

/** Del estado del proveedor al suceso de la base de datos; `null` si no hay nada que apuntar (en cola, enviado…). */
export function smsEventOf(params: URLSearchParams): { readonly event: ProviderEvent; readonly error?: string } | null {
  const status = (params.get("MessageStatus") ?? params.get("SmsStatus") ?? "").toLowerCase();
  if (status === "delivered") return { event: "delivered" };
  if (status === "undelivered" || status === "failed") {
    const raw = params.get("ErrorCode");
    const classified = classifySmsError(raw !== null && /^\d+$/.test(raw) ? Number(raw) : undefined, undefined);
    return { event: classified.kind === "undeliverable" ? "undeliverable" : "failed", error: classified.code };
  }
  return null;
}

export async function handleSmsWebhook(request: SmsWebhookRequest, gateway: NoticeGateway): Promise<WebhookResponse> {
  if (!request.authToken || !request.publicUrl) {
    return { status: 503, body: { error: "El webhook de SMS no está configurado en este entorno" } };
  }
  const params = new URLSearchParams(request.rawBody);
  if (!verifySmsSignature(request.publicUrl, params, request.signature, request.authToken)) {
    return { status: 400, body: { error: "Firma no válida" }, log: "firma de SMS rechazada" };
  }
  const event = smsEventOf(params);
  if (event === null) return { status: 200, body: { received: true, outcome: "ignored" } };
  const messageId = params.get("MessageSid");
  const noticeId = isUuid(request.noticeId) ? request.noticeId : null;
  if (noticeId === null && !messageId) return { status: 200, body: { received: true, outcome: "unknown" } };

  try {
    const result = await gateway.providerEvent({
      noticeId,
      provider: "sms",
      providerMessageId: messageId,
      event: event.event,
      ...(event.error !== undefined ? { error: event.error } : {}),
    });
    return { status: 200, body: { received: true, outcome: result.outcome } };
  } catch (error) {
    return {
      status: 500,
      body: { error: "No se pudo apuntar el estado de un SMS" },
      log: `fallo al apuntar un estado de SMS: ${error instanceof Error ? error.message.slice(0, 80) : "error"}`,
    };
  }
}
