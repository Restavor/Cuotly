/**
 * `src/services/agents/messaging/webhook-common.ts` · lo que comparten los webhooks de los tres proveedores (Fase F).
 *
 * Todos siguen el patrón del webhook de Stripe: sin secreto configurado, 503 (no se acepta nada que no se pueda
 * comprobar); firma que no cuadra, 400; evento que no es nuestro, 200 (reintentarlo no lo arreglaría); fallo de la
 * base de datos, 500 (ahí sí interesa que el proveedor reintente, y las funciones son idempotentes).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebhookResponse {
  readonly status: 200 | 400 | 403 | 500 | 503;
  readonly body: Readonly<Record<string, unknown>>;
  /** Una nota para el registro del servidor: nunca datos de un comensal ni la firma. */
  readonly log?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Comparación en tiempo constante de dos textos (sin dar pistas por el tiempo). */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

export function hmacHex(algorithm: "sha256" | "sha1", key: string | Buffer, data: string): string {
  return createHmac(algorithm, key).update(data).digest("hex");
}

export function hmacBase64(algorithm: "sha256" | "sha1", key: string | Buffer, data: string): string {
  return createHmac(algorithm, key).update(data).digest("base64");
}
