/**
 * `src/services/agents/messaging/provider.ts` · las interfaces de los proveedores de avisos (Fase F; PRD de agents
 * §10.3 y §10.4, decisión 160).
 *
 * Tres canales —correo (Resend), WhatsApp (Cloud API de Meta) y SMS (compatible con Twilio)— detrás de la misma
 * forma, con una versión falsa para probar sin cuentas (decisión 159). Ningún adaptador usa una dependencia: se
 * habla con cada API por `fetch` y las firmas de los webhooks se comprueban con `node:crypto`. El transporte
 * (`HttpFetch`) es **inyectable** para que los tests no toquen la red, y cada llamada lleva un tiempo máximo.
 *
 * Un proveedor nunca lanza por un fallo de red o una respuesta mala: devuelve un `SendResult` con la clase del error
 * (`temporary`, `permanent`, `undeliverable`, `config`) y un CÓDIGO. El texto de un error del proveedor no se guarda
 * ni se registra: puede llevar el contacto del comensal (RN-RES-12).
 */
import type { NoticeLanguage } from "@/core/reservations/notices";
import type { ProviderErrorKind } from "@/core/reservations/provider-errors";

export type ProviderName = "fake" | "resend" | "meta" | "sms";

export type SendResult =
  | { readonly ok: true; readonly providerMessageId: string }
  | { readonly ok: false; readonly kind: ProviderErrorKind; readonly code: string };

/** Lo mínimo que se pide a `fetch`, para poder inyectar un transporte falso. */
export interface HttpRequest {
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type HttpFetch = (url: string, init: HttpRequest) => Promise<HttpResponse>;

/** Cuánto se espera a un proveedor antes de dar el envío por fallido (y reintentarlo). */
export const PROVIDER_TIMEOUT_MS = 10_000;

export interface EmailMessage {
  readonly noticeId: string;
  readonly attempt: number;
  readonly to: string;
  /** El nombre del remitente, ya saneado (`emailSenderName`). La dirección es fija y la pone el adaptador. */
  readonly senderName: string;
  readonly replyTo: string | null;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export interface WhatsAppTemplateMessage {
  readonly noticeId: string;
  readonly attempt: number;
  /** E.164 con «+». */
  readonly to: string;
  readonly templateName: string;
  readonly language: NoticeLanguage;
  readonly variables: readonly string[];
  /** Lo que va al final de la URL del botón (el token), o `null` si la plantilla no lleva botón. */
  readonly buttonSuffix: string | null;
}

export interface SmsMessage {
  readonly noticeId: string;
  readonly attempt: number;
  readonly to: string;
  readonly text: string;
}

/** El precio real de un SMS, cuando el proveedor ya lo sabe. */
export interface SmsPrice {
  readonly amount: number;
  readonly currency: string;
}

export interface EmailProvider {
  readonly name: ProviderName;
  isConfigured(): boolean;
  send(message: EmailMessage): Promise<SendResult>;
}

export interface WhatsAppProvider {
  readonly name: ProviderName;
  isConfigured(): boolean;
  sendTemplate(message: WhatsAppTemplateMessage): Promise<SendResult>;
  /** Texto libre: solo vale dentro de las 24 horas de que el comensal escribió (la respuesta automática). */
  sendText(to: string, body: string): Promise<SendResult>;
}

export interface SmsProvider {
  readonly name: ProviderName;
  isConfigured(): boolean;
  send(message: SmsMessage): Promise<SendResult>;
  /** `null` si aún no hay precio; `"error"` si no se pudo preguntar (se vuelve a intentar más tarde). */
  fetchPrice(providerMessageId: string): Promise<SmsPrice | null | "error">;
}

export interface MessagingProviders {
  /** `fake` solo con `ENABLE_FAKE_MESSAGING=true` y fuera de producción (decisión 159). */
  readonly mode: "fake" | "real";
  readonly email: EmailProvider;
  readonly whatsapp: WhatsAppProvider;
  readonly sms: SmsProvider;
}
