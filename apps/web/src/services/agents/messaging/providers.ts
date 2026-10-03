/**
 * `src/services/agents/messaging/providers.ts` · qué proveedores se usan y con qué límites (Fase F; decisiones 159,
 * 160 y 165). Se decide de un solo sitio y con una función pura, para poder probarlo:
 *
 *   · El proveedor FALSO solo existe con `ENABLE_FAKE_MESSAGING=true` **y** fuera de producción
 *     (`VERCEL_ENV` distinto de `production`). En producción la variable se ignora: no hay forma de que un aviso a un
 *     comensal de verdad se quede en una pantalla de pruebas.
 *   · Con proveedores REALES fuera de producción solo se envía a la lista `MESSAGING_RECIPIENT_ALLOWLIST`
 *     (vacía = a nadie), y siempre se rechazan los correos a dominios reservados (`.test`, `.example`…): el sembrado
 *     tiene móviles con forma real y correos que rebotan.
 */
import { createResendEmailProvider } from "./email";
import { createFakeProviders } from "./fake";
import { createMetaWhatsAppProvider } from "./whatsapp";
import { createSmsProvider } from "./sms";
import type { HttpFetch, MessagingProviders } from "./provider";

export interface MessagingEnv {
  readonly ENABLE_FAKE_MESSAGING?: string | undefined;
  readonly VERCEL_ENV?: string | undefined;
  readonly NEXT_PUBLIC_SITE_URL?: string | undefined;
  readonly RESEND_API_KEY?: string | undefined;
  readonly RESERVATIONS_EMAIL_ADDRESS?: string | undefined;
  readonly WHATSAPP_ACCESS_TOKEN?: string | undefined;
  readonly WHATSAPP_PHONE_NUMBER_ID?: string | undefined;
  readonly WHATSAPP_GRAPH_VERSION?: string | undefined;
  readonly SMS_ACCOUNT_SID?: string | undefined;
  readonly SMS_AUTH_TOKEN?: string | undefined;
  readonly SMS_SENDER_ID?: string | undefined;
  readonly LEGAL_PRIVACY_URL?: string | undefined;
  readonly MESSAGING_RECIPIENT_ALLOWLIST?: string | undefined;
}

/** ¿Estamos en producción? `VERCEL_ENV` solo vale `production` en el despliegue de producción de Vercel. */
export function isProduction(env: MessagingEnv): boolean {
  return env.VERCEL_ENV?.trim().toLowerCase() === "production";
}

/** El proveedor falso se puede usar: la variable está a `true` y NO es producción. */
export function fakeMessagingAllowed(env: MessagingEnv = process.env as MessagingEnv): boolean {
  return env.ENABLE_FAKE_MESSAGING?.trim().toLowerCase() === "true" && !isProduction(env);
}

/** Alguien puso `ENABLE_FAKE_MESSAGING=true` en producción: se ignora, y quien llama puede dejar constancia. */
export function fakeMessagingBlocked(env: MessagingEnv): boolean {
  return env.ENABLE_FAKE_MESSAGING?.trim().toLowerCase() === "true" && isProduction(env);
}

export function selectProviders(env: MessagingEnv = process.env as MessagingEnv, fetchImpl?: HttpFetch): MessagingProviders {
  if (fakeMessagingAllowed(env)) return createFakeProviders();
  const siteUrl = env.NEXT_PUBLIC_SITE_URL?.trim() ?? "";
  return {
    mode: "real",
    email: createResendEmailProvider({ apiKey: env.RESEND_API_KEY, fromAddress: env.RESERVATIONS_EMAIL_ADDRESS, fetchImpl }),
    whatsapp: createMetaWhatsAppProvider({
      accessToken: env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
      graphVersion: env.WHATSAPP_GRAPH_VERSION,
      fetchImpl,
    }),
    sms: createSmsProvider({
      accountSid: env.SMS_ACCOUNT_SID,
      authToken: env.SMS_AUTH_TOKEN,
      senderId: env.SMS_SENDER_ID,
      statusCallbackBase: siteUrl === "" ? undefined : `${siteUrl.replace(/\/+$/, "")}/api/agents/webhooks/sms`,
      fetchImpl,
    }),
  };
}

export interface DispatchPolicy {
  /** Solo se envía a quien esté en `allowlist` (decisión 165). */
  readonly enforceAllowlist: boolean;
  readonly allowlist: readonly string[];
  /** Los correos a dominios reservados (`.test`, `.example`, `.invalid`, `.localhost`, `example.com`…) no salen. */
  readonly blockReservedDomains: boolean;
}

/** Los destinatarios de la lista permitida: separados por comas, punto y coma, espacios o saltos de línea. */
export function parseAllowlist(value: string | undefined): readonly string[] {
  return (value ?? "")
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/** Los límites de envío de un entorno (decisión 165). El falso no los necesita: no sale nada de verdad. */
export function dispatchPolicy(env: MessagingEnv, mode: MessagingProviders["mode"]): DispatchPolicy {
  if (mode === "fake") return { enforceAllowlist: false, allowlist: [], blockReservedDomains: false };
  return { enforceAllowlist: !isProduction(env), allowlist: parseAllowlist(env.MESSAGING_RECIPIENT_ALLOWLIST), blockReservedDomains: true };
}
