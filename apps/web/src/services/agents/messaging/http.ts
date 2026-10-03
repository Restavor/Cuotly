/**
 * `src/services/agents/messaging/http.ts` · una llamada a un proveedor con tiempo máximo y errores de transporte
 * convertidos en resultado (Fase F). Nunca lanza.
 */
import { classifyTransportError } from "@/core/reservations/provider-errors";

import { PROVIDER_TIMEOUT_MS, type HttpFetch, type HttpRequest, type HttpResponse } from "./provider";

export type HttpOutcome =
  | { readonly ok: true; readonly response: HttpResponse }
  | { readonly ok: false; readonly kind: "temporary"; readonly code: "timeout" | "network_error" };

/** La clase de fallo de una llamada que no llegó a tener respuesta. */
export async function callProvider(fetchImpl: HttpFetch, url: string, init: HttpRequest, timeoutMs: number = PROVIDER_TIMEOUT_MS): Promise<HttpOutcome> {
  try {
    const response = await fetchImpl(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
    return { ok: true, response };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    const classified = classifyTransportError(timedOut ? "timeout" : "network");
    return { ok: false, kind: "temporary", code: classified.code === "timeout" ? "timeout" : "network_error" };
  }
}

/** El cuerpo JSON de una respuesta, o `null` si no había o no se pudo leer. */
export async function readJson(response: HttpResponse): Promise<Record<string, unknown> | null> {
  try {
    const payload = await response.json();
    return typeof payload === "object" && payload !== null && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
