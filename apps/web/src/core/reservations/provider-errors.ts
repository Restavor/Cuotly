/**
 * `src/core/reservations/provider-errors.ts` · qué hacer con el error de cada proveedor de avisos (Fase F;
 * decisión 155).
 *
 * Cuatro clases, y de ellas depende todo lo demás:
 *
 *   · `temporary`     se reintenta (1, 5 y 15 minutos) y, agotados los intentos, el aviso falla.
 *   · `permanent`     no se reintenta: el aviso falla.
 *   · `undeliverable` ese número o esa dirección no puede recibirlo. En WhatsApp, el aviso sale por SMS.
 *   · `config`        falta una clave, está caducada o el proveedor no está listo: no se reintenta, falla, y deja
 *                     un incidente para Restavor.
 *
 * Lo que NO se sabe es temporal con tope, nunca «no entregable»: «no entregable» paga un SMS de respaldo. Y el
 * error se guarda siempre como CÓDIGO (`meta_131026`), jamás el texto del proveedor, que puede llevar el teléfono
 * o el correo del comensal (RN-RES-12).
 *
 * Los códigos son los de la documentación de cada proveedor tal como se conocen hoy; **hay que confirmarlos al
 * activar cada proveedor** (`docs/agents/guia-proveedores-de-avisos.md`). Un código que no esté aquí cae en
 * «temporal», que es la opción segura.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */

export type ProviderErrorKind = "temporary" | "permanent" | "undeliverable" | "config";

export interface ClassifiedError {
  readonly kind: ProviderErrorKind;
  /** `^[a-z0-9_.:-]{1,60}$`: apto para guardarse en `reservation_notifications.error`. */
  readonly code: string;
}

const META_UNDELIVERABLE = new Set([131026, 131049]);
const META_CONFIG = new Set([0, 10, 190, 131005, 131031, 131037, 131042, 131045, 132001, 132015, 132016, 133004, 133005, 133006, 133008, 133009, 133010, 368]);
const META_TEMPORARY = new Set([1, 2, 4, 17, 32, 130429, 131000, 131016, 131048, 131056, 613, 80007]);
const META_PERMANENT = new Set([100, 131008, 131009, 131021, 131030, 131051, 131052, 131053, 132000, 132005, 132007, 132012]);

/**
 * Error de la API de WhatsApp (Cloud API de Meta): el `error.code` del cuerpo, o solo el estado HTTP si no hubo
 * cuerpo legible. También sirve para el `errors[0].code` de un estado `failed` del webhook.
 */
export function classifyMetaError(code: number | undefined, httpStatus: number | undefined): ClassifiedError {
  if (code !== undefined && Number.isInteger(code)) {
    const text = `meta_${code}`;
    if (META_UNDELIVERABLE.has(code)) return { kind: "undeliverable", code: text };
    if (META_CONFIG.has(code) || (code >= 200 && code <= 299)) return { kind: "config", code: text };
    if (META_TEMPORARY.has(code)) return { kind: "temporary", code: text };
    if (META_PERMANENT.has(code)) return { kind: "permanent", code: text };
    // Una plantilla mal rellenada o rechazada (132xxx) es un fallo nuestro: no se arregla reintentando.
    if (code >= 132000 && code <= 132999) return { kind: "permanent", code: text };
    return { kind: "temporary", code: text };
  }
  return classifyHttpOnly("meta", httpStatus);
}

const SMS_UNDELIVERABLE = new Set([30003, 30005, 30006, 21614]);
const SMS_CONFIG = new Set([30002, 20003, 21408, 21606, 21608, 21612]);
const SMS_PERMANENT = new Set([30004, 30007, 21211, 21610, 21617, 20404]);
const SMS_TEMPORARY = new Set([30001, 30008, 20429, 20500]);

/** Error del proveedor de SMS (compatible con Twilio): el `code` de la API o el `ErrorCode` del estado. */
export function classifySmsError(code: number | undefined, httpStatus: number | undefined): ClassifiedError {
  if (code !== undefined && Number.isInteger(code)) {
    const text = `sms_${code}`;
    if (SMS_UNDELIVERABLE.has(code)) return { kind: "undeliverable", code: text };
    if (SMS_CONFIG.has(code)) return { kind: "config", code: text };
    if (SMS_PERMANENT.has(code)) return { kind: "permanent", code: text };
    if (SMS_TEMPORARY.has(code)) return { kind: "temporary", code: text };
    return { kind: "temporary", code: text };
  }
  return classifyHttpOnly("sms", httpStatus);
}

/**
 * Error de Resend (correo). 401 y 403 son la clave o el dominio; 429 y 5xx, reintentar; el resto de 4xx, una
 * petición que no se arregla repitiéndola. Que una dirección no exista lo cuenta el webhook de rebote, no la API.
 */
export function classifyResendError(httpStatus: number | undefined): ClassifiedError {
  return classifyHttpOnly("resend", httpStatus);
}

function classifyHttpOnly(provider: "meta" | "sms" | "resend", httpStatus: number | undefined): ClassifiedError {
  if (httpStatus === undefined) return { kind: "temporary", code: `${provider}_unknown` };
  const code = `${provider}_http_${httpStatus}`;
  if (httpStatus === 401 || httpStatus === 403) return { kind: "config", code };
  if (httpStatus === 408 || httpStatus === 409 || httpStatus === 425 || httpStatus === 429 || httpStatus >= 500) return { kind: "temporary", code };
  if (httpStatus >= 400) return { kind: "permanent", code };
  return { kind: "temporary", code };
}

/** Sin respuesta: la red se cayó o el proveedor tardó demasiado. Siempre temporal. */
export function classifyTransportError(reason: "timeout" | "network"): ClassifiedError {
  return { kind: "temporary", code: reason === "timeout" ? "timeout" : "network_error" };
}
