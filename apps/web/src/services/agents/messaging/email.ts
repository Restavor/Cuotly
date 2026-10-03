/**
 * `src/services/agents/messaging/email.ts` · el correo de los avisos, con Resend (Fase F; PRD de agents §10.4, AVI-02).
 *
 * Sin dependencia: una llamada `POST https://api.resend.com/emails` por `fetch`. Remitente
 * «<Restaurante> <reservas@restavor.com>» (la dirección es fija, `RESERVATIONS_EMAIL_ADDRESS`, en un dominio
 * verificado en Resend; el nombre es el del restaurante, saneado), `Reply-To` el correo del restaurante, HTML y texto
 * plano. **Envío directo** (no la cola de dos veces al día).
 *
 * `Idempotency-Key`: el aviso y un resumen del contenido. Reintentar el MISMO aviso con el mismo contenido no manda un
 * segundo correo aunque el primero se enviara y la respuesta se perdiera; si el contenido cambia entre intentos
 * (la reserva se modificó), es otro envío. Resend la guarda 24 horas.
 */
import { createHash } from "node:crypto";

import { classifyResendError } from "@/core/reservations/provider-errors";

import { callProvider, readJson } from "./http";
import type { EmailMessage, EmailProvider, HttpFetch, SendResult } from "./provider";

const RESEND_API = "https://api.resend.com/emails";

const ADDRESS = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

export interface ResendOptions {
  readonly apiKey: string | undefined;
  readonly fromAddress: string | undefined;
  readonly fetchImpl?: HttpFetch | undefined;
  readonly timeoutMs?: number;
}

/** La clave de idempotencia de un envío: el aviso y un resumen del asunto y el texto. */
export function emailIdempotencyKey(noticeId: string, subject: string, text: string): string {
  const digest = createHash("sha256").update(`${subject}\n${text}`).digest("hex").slice(0, 16);
  return `notice-${noticeId}-${digest}`;
}

export function createResendEmailProvider(options: ResendOptions): EmailProvider {
  const apiKey = options.apiKey?.trim() ?? "";
  const fromAddress = options.fromAddress?.trim() ?? "";
  const fetchImpl: HttpFetch = options.fetchImpl ?? (fetch as unknown as HttpFetch);
  return {
    name: "resend",
    isConfigured: () => apiKey !== "" && ADDRESS.test(fromAddress),
    async send(message: EmailMessage): Promise<SendResult> {
      if (apiKey === "" || !ADDRESS.test(fromAddress)) return { ok: false, kind: "config", code: "resend_not_configured" };
      const payload = {
        from: `${message.senderName} <${fromAddress}>`,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo !== null ? { reply_to: message.replyTo } : {}),
        tags: [{ name: "notice_id", value: message.noticeId }],
      };
      const called = await callProvider(
        fetchImpl,
        RESEND_API,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            "idempotency-key": emailIdempotencyKey(message.noticeId, message.subject, message.text),
          },
          body: JSON.stringify(payload),
        },
        options.timeoutMs,
      );
      if (!called.ok) return { ok: false, kind: called.kind, code: called.code };
      const body = await readJson(called.response);
      if (called.response.ok && typeof body?.id === "string" && body.id !== "") return { ok: true, providerMessageId: body.id };
      const classified = classifyResendError(called.response.status);
      return { ok: false, kind: classified.kind, code: classified.code };
    },
  };
}
