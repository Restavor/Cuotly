/**
 * `src/services/ai-credit-valuator.ts` — la IA que valora en créditos una
 * solicitud de cambio en la web (PRD §41, RN-CRE-05, RN-CRE-06 y
 * RN-CRE-09; decisión 85).
 *
 * Es el adaptador externo: llama a la API de Anthropic desde el servidor
 * (la clave nunca llega al navegador, RN-CLS-01) y devuelve partidas en
 * medios créditos. **Nunca lanza**: si no hay clave, si la IA falla, tarda,
 * se niega o contesta algo que no cuadra, devuelve un resultado `ok: false`
 * con el motivo, y la solicitud va al equipo, que fija los créditos a mano
 * (RN-CRE-10). El motor de palabras clave ya no sirve aquí: no sabe valorar.
 *
 * Lo que decide el dinero —si cabe, cuánto se gasta— no se decide aquí:
 * lo decide `accept_request()` en la base con lo que se guarde.
 */
import Anthropic from "@anthropic-ai/sdk";

import { breakdownTotal, type CreditItem } from "@/core/credits";

/**
 * La versión del prompt se guarda con cada valoración
 * (`classifications.prompt_version`, RN-CLS-04): cambiar la tabla o las
 * instrucciones es cambiar este número, para poder comparar después qué
 * valoraba cada versión.
 */
export const CREDIT_PROMPT_VERSION = "creditos-v1";

const MODEL = "claude-opus-5";
const MAX_TOKENS = 8000;
const DEFAULT_TIMEOUT_MS = 45_000;

/**
 * Precio por token en MILICÉNTIMOS de dólar (1 céntimo = 1000), la unidad
 * de `ai_usage` desde el 12/09/2026. Va por el modelo que contestó de
 * verdad (`response.model`): con los modelos de reserva activados puede no
 * ser el pedido. Un modelo que no esté aquí se apunta al precio del más
 * caro de la lista, para no apuntar de menos en un libro inmutable.
 */
const PRICE_MILLICENTS_PER_TOKEN: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 0.5, output: 2.5 },
  "claude-opus-4-8": { input: 0.5, output: 2.5 },
  "claude-sonnet-5": { input: 0.2, output: 1.0 },
  "claude-haiku-4-5": { input: 0.1, output: 0.5 },
};
const FALLBACK_PRICE = { input: 0.5, output: 2.5 };

export function estimateCostMillicents(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_MILLICENTS_PER_TOKEN[model] ?? FALLBACK_PRICE;
  return Math.round(inputTokens * price.input + outputTokens * price.output);
}

/** RN-CRE-06 · la tabla de referencia y las reglas del documento de Restavor. */
const SYSTEM_PROMPT = `Valoras en créditos las solicitudes de cambio que los restaurantes piden sobre su web ya existente, para Cuotly, la plataforma de mantenimiento web de Restavor.

Un crédito mide el trabajo real que exige una modificación: tiempo, complejidad, alcance y trabajo adicional (preparar imágenes, redactar, reorganizar). No es una hora ni una unidad por cambio. La unidad mínima es 0,5 créditos y toda cifra es múltiplo de 0,5.

Tabla de referencia:
- Cambiar un elemento existente simple (un precio, una palabra, un teléfono, un horario concreto, un enlace, el texto de un botón, una frase corta, una dirección, un dato concreto): 0,5
- Sustituir una fotografía ya preparada: 0,5
- Sustituir y recortar o adaptar una fotografía: 1
- Optimizar tamaño o formato de una imagen y colocarla: 1
- Pequeño retoque fotográfico: 1 a 1,5
- Sustituir un párrafo corto que da el cliente: 0,5 a 1
- Reorganizar o adaptar un texto: 1
- Redactar un texto corto: 1 a 1,5
- Redactar una sección completa: 2 a 4
- Modificar parte del contenido de una sección existente: 2
- Reestructurar una sección existente: 5
- Crear un bloque nuevo usando una estructura que ya existe en la web: 6
- Crear una sección nueva sencilla: 7 si tiene pocos elementos, composición básica y aprovecha estilos existentes; 8 si tiene más contenido, imágenes o botones, o exige más adaptación visual o de móvil
- Modificación estructural importante de una página: 14 si es localizada, 15 si afecta a varias partes relacionadas, 16 si obliga a reajustar muchos elementos y revisar la página entera
- Crear una sección nueva con diseño personalizado: 20

Cómo valorar:
- Descompón la solicitud en partidas de trabajo y valora cada una con la tabla. Si una partida cae en un rango, elige el valor exacto según el trabajo que de verdad pide.
- Agrupa lo repetitivo: muchos cambios iguales en la misma sección (por ejemplo, veinte precios de la misma carta) son una sola tarea agrupada, valorada por el trabajo real, no el número de elementos por 0,5.
- Distingue el contenido que entrega el cliente del que hay que crear: copiar un texto dado no cuesta lo mismo que redactarlo; sustituir una foto preparada no cuesta lo mismo que prepararla.
- No añadas la gestión de la solicitud: se suma aparte, siempre 0,5, una sola vez.
- Si la solicitud pide algo que no es mantenimiento de la web existente (rediseñar o rehacer la web o una página entera, una web nueva, una tienda online, funcionalidades complejas, automatizaciones, integraciones complejas, migraciones, edición fotográfica avanzada), marca out_of_scope a true, explica en out_of_scope_reason por qué y no pongas partidas: eso se presupuesta aparte.
- Las descripciones de las partidas y el resumen, en español, breves y comprensibles para el dueño de un restaurante, sin jerga técnica.`;

/** La forma de la respuesta, validada por la API (salida estructurada). */
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "Una o dos frases con el alcance de la solicitud.",
    },
    items: {
      type: "array",
      description: "Las partidas de trabajo. Vacío si out_of_scope es true.",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          credits: { type: "number", description: "Múltiplo de 0,5." },
        },
        required: ["description", "credits"],
        additionalProperties: false,
      },
    },
    out_of_scope: { type: "boolean" },
    out_of_scope_reason: { type: "string" },
  },
  required: ["summary", "items", "out_of_scope", "out_of_scope_reason"],
  additionalProperties: false,
} as const;

export type ModelReply = {
  readonly text: string;
  readonly model: string;
  readonly stopReason: string | null;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
};

/**
 * La llamada real, aislada para que los tests inyecten otra
 * (`opts.callModel`): una que falla, que tarda, que se niega o que
 * devuelve algo que no cuadra.
 *
 * - `output_config.format`: la API garantiza que el texto es JSON con esa
 *   forma. Lo que no garantiza (múltiplos de 0,5, cifras positivas) se
 *   comprueba después.
 * - `fallbacks: "default"`: si el modelo se niega, la API reintenta en la
 *   misma llamada con otro modelo; el que contestó viene en
 *   `response.model` y es el que se cobra.
 * - `effort: "medium"`: valorar es un juicio, pero corto; el esfuerzo alto
 *   alargaría la espera del restaurante al enviar sin ganar mucho.
 */
async function callAnthropic(apiKey: string, requestText: string, timeoutMs: number): Promise<ModelReply> {
  const client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 0 });

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    messages: [{ role: "user", content: requestText }],
  });

  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");

  return {
    text,
    model: response.model,
    stopReason: response.stop_reason,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}

export type CallModel = typeof callAnthropic;

export type ValuationFailureReason =
  | "no_api_key"
  | "timeout"
  | "rate_limited"
  | "invalid_api_key"
  | "anthropic_unavailable"
  | "network_error"
  | "refusal"
  | "truncated"
  | "invalid_response"
  | "out_of_scope"
  | `api_error_${string}`;

export type CreditValuation =
  | {
      readonly ok: true;
      readonly creditsHalf: number;
      readonly items: readonly CreditItem[];
      readonly summary: string;
      readonly model: string;
      readonly usage: ModelReply["usage"];
      readonly costMillicents: number;
      readonly promptVersion: string;
    }
  | {
      readonly ok: false;
      readonly reason: ValuationFailureReason;
      /** Para el equipo: por qué no hay valoración (fuera de alcance, etc.). */
      readonly note?: string;
    };

type ParsedReply =
  | { readonly kind: "valued"; readonly items: CreditItem[]; readonly summary: string }
  | { readonly kind: "out_of_scope"; readonly reason: string; readonly summary: string };

/**
 * Comprueba lo que la salida estructurada no garantiza: partidas con texto,
 * cifras positivas y múltiplos de 0,5. Devuelve `null` si algo no cuadra.
 */
export function parseValuationReply(text: string): ParsedReply | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const reply = parsed as Record<string, unknown>;
  const summary = typeof reply.summary === "string" ? reply.summary.trim() : "";
  if (summary === "") return null;

  if (reply.out_of_scope === true) {
    const reason = typeof reply.out_of_scope_reason === "string" ? reply.out_of_scope_reason.trim() : "";
    return { kind: "out_of_scope", reason, summary };
  }

  if (!Array.isArray(reply.items) || reply.items.length === 0) return null;
  const items: CreditItem[] = [];
  for (const raw of reply.items) {
    if (typeof raw !== "object" || raw === null) return null;
    const { description, credits } = raw as Record<string, unknown>;
    if (typeof description !== "string" || description.trim() === "") return null;
    if (typeof credits !== "number" || !Number.isFinite(credits) || credits <= 0) return null;
    const half = credits * 2;
    if (!Number.isInteger(half)) return null;
    items.push({ description: description.trim(), creditsHalf: half });
  }
  return { kind: "valued", items, summary };
}

function describeError(error: unknown): ValuationFailureReason {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return "invalid_api_key";
  }
  if (error instanceof Anthropic.RateLimitError) return "rate_limited";
  if (error instanceof Anthropic.InternalServerError) return "anthropic_unavailable";
  if (error instanceof Anthropic.APIError && typeof error.status === "number") {
    return error.status >= 500 ? "anthropic_unavailable" : `api_error_${error.status}`;
  }
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  return "network_error";
}

export type ValuateRequestOptions = {
  readonly apiKey?: string;
  readonly timeoutMs?: number;
  readonly callModel?: CallModel;
};

/** RN-CRE-09 · valora una solicitud en créditos. Nunca lanza. */
export async function valuateRequest(
  requestText: string,
  opts: ValuateRequestOptions = {},
): Promise<CreditValuation> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, reason: "no_api_key" };

  let reply: ModelReply;
  try {
    reply = await (opts.callModel ?? callAnthropic)(apiKey, requestText, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  } catch (error) {
    return { ok: false, reason: describeError(error) };
  }

  if (reply.stopReason === "refusal") return { ok: false, reason: "refusal" };
  if (reply.stopReason === "max_tokens") return { ok: false, reason: "truncated" };

  const parsed = parseValuationReply(reply.text);
  if (parsed === null) return { ok: false, reason: "invalid_response" };
  if (parsed.kind === "out_of_scope") {
    return { ok: false, reason: "out_of_scope", note: parsed.reason || parsed.summary };
  }

  return {
    ok: true,
    creditsHalf: breakdownTotal(parsed.items),
    items: parsed.items,
    summary: parsed.summary,
    model: reply.model,
    usage: reply.usage,
    costMillicents: estimateCostMillicents(reply.model, reply.usage.inputTokens, reply.usage.outputTokens),
    promptVersion: CREDIT_PROMPT_VERSION,
  };
}
