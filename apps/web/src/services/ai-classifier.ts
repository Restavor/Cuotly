/**
 * `src/services/ai-classifier.ts` — el único adaptador externo del Hito 4
 * (CLAUDE.md: "adaptadores externos viven en `src/services/`"). Llama a
 * la API de Anthropic desde el servidor para proponer categoría y resumen
 * de una solicitud (RN-CLS-01), y cae automáticamente al motor de reglas
 * de `src/core/classification-rules.ts` si la IA falla, tarda demasiado o
 * no hay clave configurada (RN-CLS-02) — la razón de ser de este archivo
 * es que `classifyRequest()` **nunca lanza y nunca se cuelga**: siempre
 * resuelve con una propuesta usable, para que el flujo de solicitudes no
 * dependa de que Anthropic esté disponible (ROADMAP, Hito 4: "Test de que
 * la IA caída no bloquea el flujo").
 *
 * La clave (`ANTHROPIC_API_KEY`) se lee de una variable de entorno del
 * servidor y no se expone nunca al cliente (RN-CLS-01) — este módulo solo
 * se importa desde código de servidor (server actions, route handlers).
 */
import Anthropic from "@anthropic-ai/sdk";
import { classifyByRules, isChangeCategory, type ChangeCategory } from "@/core/classification-rules";

/** claude-opus-5, el modelo por defecto para tareas nuevas de la plataforma. */
const MODEL = "claude-opus-5";
const MAX_TOKENS = 512;
const DEFAULT_TIMEOUT_MS = 8000;

// Precio de claude-opus-5: 5,00 $ / 1M tokens de entrada, 25,00 $ / 1M de
// salida. En céntimos de dólar por token, para que ai_usage.estimated_cost_cents
// (RN-CLS-05) sea un entero sin arrastrar redondeos de coma flotante en
// cada llamada.
const INPUT_CENTS_PER_TOKEN = 500 / 1_000_000;
const OUTPUT_CENTS_PER_TOKEN = 2500 / 1_000_000;

const SYSTEM_PROMPT = `Eres el clasificador de solicitudes de Cuotly, una plataforma de mantenimiento web para restaurantes.
Dada la descripción de una solicitud de cambio en la web de un restaurante, debes proponer:
- "category": una de "small", "photo", "medium", "large", según esta definición exacta:
  - small: nombre, frase, precio, título, contacto, enlace, un día de horario, media o número de reseñas, logo ya entregado, texto ya redactado por el cliente.
  - photo: subir o sustituir una fotografía entregada por el cliente y su retoque básico para que quede bien colocada. No incluye producción fotográfica, retoque avanzado, reconstrucciones ni compra de derechos.
  - medium: modificar una sección de la carta, añadir unos cinco platos, texto largo de Historia o Inicio, horario completo, reseña destacada, botón de delivery correctamente integrado.
  - large: carta completa, contenido amplio de una sección, menú especial con diseño, modificación amplia de reseñas, sección nueva importante como Eventos.
- "summary": un resumen breve (una o dos frases, en español) del alcance del cambio.

Responde EXCLUSIVAMENTE con un objeto JSON de la forma {"category": "...", "summary": "..."}, sin texto antes ni después, sin bloque de código.
Esta es siempre una propuesta: una persona del equipo de mantenimiento la valida o corrige antes de que el cliente la vea, así que ante la duda elige la categoría que mejor describa el alcance dominante del texto.`;

export type ClassificationSource = "ai" | "rules";

export type ClassificationProposal = {
  readonly category: ChangeCategory;
  readonly summary: string;
  readonly matchedKeywords?: readonly string[];
  readonly source: ClassificationSource;
  /** Solo cuando `source === "ai"`: modelo y consumo, para `ai_usage` (RN-CLS-05). */
  readonly model?: string;
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number };
  readonly estimatedCostCents?: number;
  /** Solo cuando `source === "rules"`: por qué se cayó a reglas (RN-CLS-02). */
  readonly fallbackReason?: string;
};

type ModelReply = {
  readonly text: string;
  readonly model: string;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
};

/**
 * La llamada real a Anthropic, aislada en su propia función para que
 * `classifyRequest()` pueda recibir una implementación distinta en los
 * tests (`opts.callModel`) sin necesidad de simular el SDK entero: los
 * tests inyectan una función que falla, tarda o devuelve un JSON
 * inválido, y comprueban que siempre hay una propuesta de reglas al
 * final — eso es literalmente "la IA caída no bloquea el flujo".
 */
async function callAnthropic(apiKey: string, requestText: string, timeoutMs: number): Promise<ModelReply> {
  const client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 0 });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: requestText }],
  });

  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");

  return {
    text: textBlock?.text ?? "",
    model: response.model,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}

export type CallModel = typeof callAnthropic;

/** Extrae `{category, summary}` de la respuesta de texto de la IA, o `null` si no es válida. */
function parseModelReply(text: string): { category: ChangeCategory; summary: string } | null {
  try {
    // La IA puede envolver el JSON en un bloque de código pese a la
    // instrucción del prompt — se acepta también esa forma, sin
    // exigirlo, en vez de tratarlo como una respuesta inválida.
    const jsonText = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    const parsed: unknown = JSON.parse(jsonText);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "category" in parsed &&
      "summary" in parsed &&
      typeof (parsed as { category: unknown }).category === "string" &&
      typeof (parsed as { summary: unknown }).summary === "string" &&
      isChangeCategory((parsed as { category: string }).category)
    ) {
      return { category: (parsed as { category: ChangeCategory }).category, summary: (parsed as { summary: string }).summary };
    }
    return null;
  } catch {
    return null;
  }
}

/** Describe el fallo de forma legible para `ai_usage`/`classifications.fallback_reason`, sin filtrar detalles internos. */
function describeError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    if (error.status === 401 || error.status === 403) return "invalid_api_key";
    if (error.status === 429) return "rate_limited";
    if (typeof error.status === "number" && error.status >= 500) return "anthropic_unavailable";
    return `api_error_${error.status ?? "unknown"}`;
  }
  if (error instanceof Error && (error.name === "APIConnectionTimeoutError" || error.name === "AbortError")) {
    return "timeout";
  }
  return "network_error";
}

function toRuleProposal(text: string, fallbackReason: string): ClassificationProposal {
  const rules = classifyByRules(text);
  return {
    category: rules.category,
    summary: `Propuesta automática por reglas (categoría "${rules.category}"), pendiente de validación.`,
    matchedKeywords: rules.matchedKeywords,
    source: "rules",
    fallbackReason,
  };
}

export type ClassifyRequestOptions = {
  readonly apiKey?: string;
  readonly timeoutMs?: number;
  readonly callModel?: CallModel;
};

/**
 * RN-CLS-01/02: propone una categoría y un resumen para el texto de una
 * solicitud. Nunca lanza — cualquier fallo (sin clave, red caída,
 * timeout, respuesta inválida) resuelve con la propuesta del motor de
 * reglas en su lugar, con `fallbackReason` explicando por qué.
 */
export async function classifyRequest(
  requestText: string,
  opts: ClassifyRequestOptions = {},
): Promise<ClassificationProposal> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return toRuleProposal(requestText, "no_api_key");
  }

  const callModel = opts.callModel ?? callAnthropic;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let reply: ModelReply;
  try {
    reply = await callModel(apiKey, requestText, timeoutMs);
  } catch (error) {
    return toRuleProposal(requestText, describeError(error));
  }

  const parsed = parseModelReply(reply.text);
  if (!parsed) {
    return toRuleProposal(requestText, "invalid_response");
  }

  const estimatedCostCents = Math.round(
    reply.usage.inputTokens * INPUT_CENTS_PER_TOKEN + reply.usage.outputTokens * OUTPUT_CENTS_PER_TOKEN,
  );

  return {
    category: parsed.category,
    summary: parsed.summary,
    source: "ai",
    model: reply.model,
    usage: reply.usage,
    estimatedCostCents,
  };
}
