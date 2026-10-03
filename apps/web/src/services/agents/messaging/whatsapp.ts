/**
 * `src/services/agents/messaging/whatsapp.ts` · WhatsApp con la Cloud API de Meta (Fase F; PRD de agents §10.3, AVI-03).
 *
 * Sin dependencia: `POST https://graph.facebook.com/<versión>/<id del número>/messages`. Un único número de WhatsApp
 * de Restavor para todos los restaurantes; el nombre del restaurante va en el texto. Cada aviso es una plantilla de
 * utilidad (una por aviso e idioma, `core/reservations/notice-texts.ts`) con el botón «Cancelar mi reserva» de URL
 * dinámica salvo en «rechazada» y «cancelada».
 *
 * **Correlación:** cada envío lleva `biz_opaque_callback_data = notice:<id>`, que Meta devuelve en los estados del
 * webhook: así un estado se asocia al aviso aunque llegue antes de que se anote el identificador del mensaje.
 *
 * La versión de la API de Graph está en `WHATSAPP_GRAPH_VERSION` (Meta retira versiones; cambiarla no exige código).
 */
import { classifyMetaError } from "@/core/reservations/provider-errors";

import { callProvider, readJson } from "./http";
import type { HttpFetch, SendResult, WhatsAppProvider, WhatsAppTemplateMessage } from "./provider";

/** La versión de Graph que se usa si no se configura otra. */
export const DEFAULT_GRAPH_VERSION = "v23.0";

export interface MetaWhatsAppOptions {
  readonly accessToken: string | undefined;
  readonly phoneNumberId: string | undefined;
  readonly graphVersion: string | undefined;
  readonly fetchImpl?: HttpFetch | undefined;
  readonly timeoutMs?: number;
}

/** E.164 con «+» → solo dígitos, como lo pide Meta en `to`. */
export function metaRecipient(e164: string): string {
  return e164.replace(/\D/g, "");
}

export const CALLBACK_PREFIX = "notice:";

/** El cuerpo de una plantilla: variables del cuerpo en orden y, si lleva botón, el final de su URL. */
export function templatePayload(message: WhatsAppTemplateMessage): Record<string, unknown> {
  const components: Record<string, unknown>[] = [];
  if (message.variables.length > 0) {
    components.push({ type: "body", parameters: message.variables.map((text) => ({ type: "text", text })) });
  }
  if (message.buttonSuffix !== null) {
    components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: message.buttonSuffix }] });
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: metaRecipient(message.to),
    type: "template",
    template: { name: message.templateName, language: { code: message.language }, components },
    biz_opaque_callback_data: `${CALLBACK_PREFIX}${message.noticeId}`,
  };
}

export function createMetaWhatsAppProvider(options: MetaWhatsAppOptions): WhatsAppProvider {
  const accessToken = options.accessToken?.trim() ?? "";
  const phoneNumberId = options.phoneNumberId?.trim() ?? "";
  const version = options.graphVersion?.trim() || DEFAULT_GRAPH_VERSION;
  const fetchImpl: HttpFetch = options.fetchImpl ?? (fetch as unknown as HttpFetch);
  const configured = accessToken !== "" && /^\d+$/.test(phoneNumberId) && /^v\d+\.\d+$/.test(version);

  async function post(payload: Record<string, unknown>): Promise<SendResult> {
    if (!configured) return { ok: false, kind: "config", code: "meta_not_configured" };
    const called = await callProvider(
      fetchImpl,
      `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
      { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify(payload) },
      options.timeoutMs,
    );
    if (!called.ok) return { ok: false, kind: called.kind, code: called.code };
    const body = await readJson(called.response);
    const messages = Array.isArray(body?.messages) ? (body.messages as unknown[]) : [];
    const first = messages[0];
    const id = typeof first === "object" && first !== null ? (first as { id?: unknown }).id : undefined;
    if (called.response.ok && typeof id === "string" && id !== "") return { ok: true, providerMessageId: id };
    const error = typeof body?.error === "object" && body.error !== null ? (body.error as { code?: unknown }) : null;
    const classified = classifyMetaError(typeof error?.code === "number" ? error.code : undefined, called.response.status);
    return { ok: false, kind: classified.kind, code: classified.code };
  }

  return {
    name: "meta",
    isConfigured: () => configured,
    sendTemplate: (message) => post(templatePayload(message)),
    sendText: (to, body) =>
      post({ messaging_product: "whatsapp", recipient_type: "individual", to: metaRecipient(to), type: "text", text: { preview_url: false, body } }),
  };
}
