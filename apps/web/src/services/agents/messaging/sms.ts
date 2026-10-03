/**
 * `src/services/agents/messaging/sms.ts` · SMS con una API compatible con Twilio (Fase F; PRD de agents §10.3, AVI-04
 * y AVI-06).
 *
 * Sin dependencia: `POST /2010-04-01/Accounts/<sid>/Messages.json` con autenticación básica. Los nombres
 * `SMS_ACCOUNT_SID` y `SMS_AUTH_TOKEN` son los de Twilio, y cualquier proveedor con la misma forma (o un adaptador
 * que la imite) sirve: el resto del sistema solo ve `SmsProvider`. Remitente alfanumérico «Restavor»
 * (`SMS_SENDER_ID`), que Restavor registra donde toque (CNMC en España).
 *
 * **Correlación y precio:** cada envío manda `StatusCallback` con `?notice=<id>` para asociar el estado al aviso. El
 * precio real no viene en el estado: se pregunta al recurso del mensaje (`fetchPrice`), cada pocos minutos hasta que
 * lo tiene (`reservation_notices_price_pending`, AVI-06). El precio viene en negativo y en la moneda del proveedor
 * (normalmente dólares): se devuelve en positivo con su moneda y la conversión a euros la hace la base de datos.
 */
import { classifySmsError } from "@/core/reservations/provider-errors";

import { callProvider, readJson } from "./http";
import type { HttpFetch, SendResult, SmsMessage, SmsPrice, SmsProvider } from "./provider";

const TWILIO_API = "https://api.twilio.com/2010-04-01/Accounts";

export interface SmsOptions {
  readonly accountSid: string | undefined;
  readonly authToken: string | undefined;
  readonly senderId: string | undefined;
  /** La dirección pública de `/api/agents/webhooks/sms`, para el aviso de estado. Sin ella no hay seguimiento. */
  readonly statusCallbackBase: string | undefined;
  readonly fetchImpl?: HttpFetch | undefined;
  readonly timeoutMs?: number;
}

/** El remitente alfanumérico válido: 1 a 11 caracteres, solo letras y cifras (sin espacios). */
export const DEFAULT_SENDER_ID = "Restavor";

export function isValidSenderId(value: string): boolean {
  return /^[A-Za-z0-9]{1,11}$/.test(value);
}

export function createSmsProvider(options: SmsOptions): SmsProvider {
  const sid = options.accountSid?.trim() ?? "";
  const token = options.authToken?.trim() ?? "";
  const sender = options.senderId?.trim() || DEFAULT_SENDER_ID;
  const fetchImpl: HttpFetch = options.fetchImpl ?? (fetch as unknown as HttpFetch);
  const configured = /^[A-Za-z0-9]{10,64}$/.test(sid) && token !== "" && isValidSenderId(sender);
  const authorization = `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;

  return {
    name: "sms",
    isConfigured: () => configured,
    async send(message: SmsMessage): Promise<SendResult> {
      if (!configured) return { ok: false, kind: "config", code: "sms_not_configured" };
      const form = new URLSearchParams({ To: message.to, From: sender, Body: message.text });
      if (options.statusCallbackBase) form.set("StatusCallback", `${options.statusCallbackBase}?notice=${message.noticeId}`);
      const called = await callProvider(
        fetchImpl,
        `${TWILIO_API}/${sid}/Messages.json`,
        { method: "POST", headers: { authorization, "content-type": "application/x-www-form-urlencoded" }, body: form.toString() },
        options.timeoutMs,
      );
      if (!called.ok) return { ok: false, kind: called.kind, code: called.code };
      const body = await readJson(called.response);
      if (called.response.ok && typeof body?.sid === "string" && body.sid !== "") return { ok: true, providerMessageId: body.sid };
      const classified = classifySmsError(typeof body?.code === "number" ? body.code : undefined, called.response.status);
      return { ok: false, kind: classified.kind, code: classified.code };
    },
    async fetchPrice(providerMessageId: string): Promise<SmsPrice | null | "error"> {
      if (!configured || !/^[A-Za-z0-9]{10,64}$/.test(providerMessageId)) return "error";
      const called = await callProvider(
        fetchImpl,
        `${TWILIO_API}/${sid}/Messages/${providerMessageId}.json`,
        { method: "GET", headers: { authorization } },
        options.timeoutMs,
      );
      if (!called.ok || !called.response.ok) return "error";
      const body = await readJson(called.response);
      if (body === null) return "error";
      const price = body.price;
      if (price === null || price === undefined || price === "") return null;
      const amount = Math.abs(Number(price));
      if (!Number.isFinite(amount)) return "error";
      return { amount, currency: typeof body.price_unit === "string" && body.price_unit !== "" ? body.price_unit.toUpperCase() : "USD" };
    },
  };
}
