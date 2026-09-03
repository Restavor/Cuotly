import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { classifyRequest, type CallModel } from "./ai-classifier";

const REQUEST_TEXT = "Necesitamos una carta completa nueva, con menú especial de Navidad.";

describe("ai-classifier — RN-CLS-01/02, «la IA caída no bloquea el flujo» (ROADMAP, Hito 4)", () => {
  it("sin ANTHROPIC_API_KEY, cae a reglas sin intentar llamar a la red", async () => {
    let called = false;
    const callModel: CallModel = async () => {
      called = true;
      throw new Error("no debería llamarse sin clave configurada");
    };

    const proposal = await classifyRequest(REQUEST_TEXT, { apiKey: undefined, callModel });

    expect(called).toBe(false);
    expect(proposal.source).toBe("rules");
    expect(proposal.fallbackReason).toBe("no_api_key");
    expect(proposal.category).toBe("large");
  });

  it("si la llamada a Anthropic lanza (red caída), cae a reglas y devuelve una propuesta usable", async () => {
    const callModel: CallModel = async () => {
      throw new Error("fetch failed");
    };

    const proposal = await classifyRequest(REQUEST_TEXT, { apiKey: "sk-test", callModel });

    expect(proposal.source).toBe("rules");
    expect(proposal.fallbackReason).toBe("network_error");
    expect(proposal.category).toBe("large");
    expect(proposal.summary.length).toBeGreaterThan(0);
  });

  it("si la llamada tarda demasiado (timeout), cae a reglas en vez de colgar el flujo", async () => {
    const callModel: CallModel = async () => {
      const error = new Error("timed out");
      error.name = "APIConnectionTimeoutError";
      throw error;
    };

    const proposal = await classifyRequest(REQUEST_TEXT, { apiKey: "sk-test", timeoutMs: 10, callModel });

    expect(proposal.source).toBe("rules");
    expect(proposal.fallbackReason).toBe("timeout");
  });

  it("si Anthropic responde con un JSON que no es el esperado, cae a reglas en vez de propagar el dato inválido", async () => {
    const callModel: CallModel = async () => ({
      text: "esto no es JSON en absoluto",
      model: "claude-opus-5",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const proposal = await classifyRequest(REQUEST_TEXT, { apiKey: "sk-test", callModel });

    expect(proposal.source).toBe("rules");
    expect(proposal.fallbackReason).toBe("invalid_response");
  });

  it("si Anthropic responde con una categoría que no existe, cae a reglas en vez de aceptarla a ciegas", async () => {
    const callModel: CallModel = async () => ({
      text: JSON.stringify({ category: "gigantesco", summary: "no es una categoría válida" }),
      model: "claude-opus-5",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const proposal = await classifyRequest(REQUEST_TEXT, { apiKey: "sk-test", callModel });

    expect(proposal.source).toBe("rules");
    expect(proposal.fallbackReason).toBe("invalid_response");
  });

  it("un error 401 de Anthropic se identifica como clave inválida, no como error genérico", async () => {
    const callModel: CallModel = async () => {
      // Instancia real de Anthropic.APIError (no un objeto simulado con
      // .status pegado a mano): describeError() comprueba `instanceof
      // Anthropic.APIError`, así que el test debe ejercitar exactamente
      // esa rama, no la genérica de "network_error".
      throw new Anthropic.APIError(401, { message: "invalid x-api-key" }, "invalid x-api-key", new Headers());
    };

    const proposal = await classifyRequest(REQUEST_TEXT, { apiKey: "sk-bad", callModel });

    expect(proposal.source).toBe("rules");
    expect(proposal.fallbackReason).toBe("invalid_api_key");
  });

  it("un error 403 de Anthropic también se identifica como clave inválida", async () => {
    const callModel: CallModel = async () => {
      throw new Anthropic.APIError(403, { message: "forbidden" }, "forbidden", new Headers());
    };

    const proposal = await classifyRequest(REQUEST_TEXT, { apiKey: "sk-bad", callModel });

    expect(proposal.fallbackReason).toBe("invalid_api_key");
  });

  it("un error 429 de Anthropic se identifica como límite de tasa", async () => {
    const callModel: CallModel = async () => {
      throw new Anthropic.APIError(429, { message: "rate limited" }, "rate limited", new Headers());
    };

    const proposal = await classifyRequest(REQUEST_TEXT, { apiKey: "sk-test", callModel });

    expect(proposal.fallbackReason).toBe("rate_limited");
  });

  it("un error 5xx de Anthropic se identifica como IA no disponible", async () => {
    const callModel: CallModel = async () => {
      throw new Anthropic.APIError(503, { message: "overloaded" }, "overloaded", new Headers());
    };

    const proposal = await classifyRequest(REQUEST_TEXT, { apiKey: "sk-test", callModel });

    expect(proposal.fallbackReason).toBe("anthropic_unavailable");
  });

  it("camino feliz: con la IA disponible, devuelve la propuesta de la IA con su consumo para ai_usage (RN-CLS-05)", async () => {
    const callModel: CallModel = async (apiKey, requestText, timeoutMs) => {
      expect(apiKey).toBe("sk-test");
      expect(requestText).toBe(REQUEST_TEXT);
      expect(timeoutMs).toBeGreaterThan(0);
      return {
        text: JSON.stringify({ category: "large", summary: "Carta completa nueva con menú especial de Navidad." }),
        model: "claude-opus-5",
        usage: { inputTokens: 120, outputTokens: 40 },
      };
    };

    const proposal = await classifyRequest(REQUEST_TEXT, { apiKey: "sk-test", callModel });

    expect(proposal.source).toBe("ai");
    expect(proposal.category).toBe("large");
    expect(proposal.summary).toBe("Carta completa nueva con menú especial de Navidad.");
    expect(proposal.model).toBe("claude-opus-5");
    expect(proposal.usage).toEqual({ inputTokens: 120, outputTokens: 40 });
    // 120 * 100/1e6 + 40 * 500/1e6 = 0,012 + 0,02 = 0,032 céntimos -> redondeado a 0.
    expect(proposal.estimatedCostCents).toBe(0);
  });

  it("camino feliz: acepta el JSON envuelto en un bloque de código, tal y como a veces responde el modelo", async () => {
    const callModel: CallModel = async () => ({
      text: '```json\n{"category": "small", "summary": "Cambio de precio de un plato."}\n```',
      model: "claude-opus-5",
      usage: { inputTokens: 50, outputTokens: 300 },
    });

    const proposal = await classifyRequest(REQUEST_TEXT, { apiKey: "sk-test", callModel });

    expect(proposal.source).toBe("ai");
    expect(proposal.category).toBe("small");
    // 50 * 100/1e6 + 300 * 500/1e6 = 0,005 + 0,15 = 0,155 -> redondea a 0.
    //
    // Con los precios de Haiku 4.5 y `max_tokens` en 512, UNA clasificación
    // suelta no llega nunca a un céntimo: harían falta ~2.000 tokens de
    // salida. O sea que `ai_usage.estimated_cost_cents` valdrá 0 en todas
    // las llamadas normales. No se maquilla con números imposibles para que
    // el test enseñe otra cosa: es lo que va a pasar de verdad, y está
    // dicho en el ROADMAP para que se decida si el céntimo es la unidad
    // correcta.
    expect(proposal.estimatedCostCents).toBe(0);
  });
});
