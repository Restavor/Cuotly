/**
 * `src/services/agents/pin.ts` · el PIN y el token del dispositivo, del lado del servidor
 * (RN-APP-06 y RN-APP-08; PRD de agents §3.3).
 *
 * - **El PIN nunca viaja a la base de datos en claro**: es un HMAC-SHA256 con `AGENTS_PIN_SECRET`,
 *   que es lo que permite comprobar que no se repite dentro del restaurante sin guardarlo. Es el mismo
 *   cálculo que usa el sembrado (`hmac(pin, secreto, 'sha256')`).
 * - **El token del dispositivo** es aleatorio, largo, vive en una cookie `httpOnly` y en la base solo
 *   queda su hash SHA-256.
 * - **La cookie de «Ajustes abiertos»** (dos minutos sin tocar) se firma con la misma clave, con otro
 *   prefijo, para que una firma de un tipo no valga como la del otro.
 *
 * Sin `AGENTS_PIN_SECRET` no hay PIN: se dice, no se inventa una clave.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { ElevationPayload } from "@/core/reservations/device";

export class PinSecretMissingError extends Error {
  constructor() {
    super("AGENTS_PIN_SECRET no está configurado");
    this.name = "PinSecretMissingError";
  }
}

function secretOf(secret: string | undefined): string {
  const value = secret ?? process.env.AGENTS_PIN_SECRET;
  if (!value) throw new PinSecretMissingError();
  return value;
}

/** ¿Hay clave del servidor para los PIN? Las pantallas dicen «sin configurar» en vez de fallar. */
export function pinSecretConfigured(secret: string | undefined = process.env.AGENTS_PIN_SECRET): boolean {
  return Boolean(secret);
}

/** El HMAC de un PIN, en hexadecimal (64 caracteres), tal como lo guarda `reservation_staff.pin_hmac`. */
export function pinHmac(pin: string, secret?: string): string {
  return createHmac("sha256", secretOf(secret)).update(pin).digest("hex");
}

/** Un token nuevo para una cookie de dispositivo: 32 bytes aleatorios, 64 caracteres hexadecimales. */
export function newDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

/** Lo único del token que llega a la base de datos. */
export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Un token tiene la forma de los que se generan aquí; cualquier otra cosa ni se consulta. */
export function isDeviceToken(value: string | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(`ajustes-abiertos:${body}`).digest("hex");
}

/** El valor de la cookie de «Ajustes abiertos»: el contenido y su firma. */
export function signElevation(payload: ElevationPayload, secret?: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, secretOf(secret))}`;
}

/** Lo que firmó `signElevation`, o `null` si está manipulado, roto o no hay clave. */
export function readElevation(value: string | undefined, secret?: string): ElevationPayload | null {
  if (!value) return null;
  const key = secret ?? process.env.AGENTS_PIN_SECRET;
  if (!key) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1), "utf8");
  const expected = Buffer.from(sign(body, key), "utf8");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { staffId, establishmentId, expiresAt } = parsed as Record<string, unknown>;
    if (typeof staffId !== "string" || typeof establishmentId !== "string" || typeof expiresAt !== "number") return null;
    return { staffId, establishmentId, expiresAt };
  } catch {
    return null;
  }
}
