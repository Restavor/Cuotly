import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import {
  CREDIT_PROMPT_VERSION,
  estimateCostMillicents,
  parseValuationReply,
  valuateRequest,
  type CallModel,
  type ModelReply,
} from "./ai-credit-valuator";

function reply(body: unknown, over: Partial<ModelReply> = {}): CallModel {
  return async () => ({
    text: typeof body === "string" ? body : JSON.stringify(body),
    model: "claude-opus-5",
    stopReason: "end_turn",
    usage: { inputTokens: 2000, outputTokens: 400 },
    ...over,
  });
}

const EJEMPLO_DOCUMENTO = {
  summary: "Cambiar teléfono y horario, sustituir una foto preparada y parte de una sección.",
  items: [
    { description: "Cambiar teléfono", credits: 0.5 },
    { description: "Cambiar horario", credits: 0.5 },
    { description: "Sustituir una foto ya preparada", credits: 0.5 },
    { description: "Modificar parte del contenido de una sección", credits: 2 },
  ],
  out_of_scope: false,
  out_of_scope_reason: "",
};

describe("RN-CRE-09 · la IA valora en créditos", () => {
  it("RN-CRE-05 · el ejemplo del documento: 3,5 de partidas y 0,5 de procesamiento son 4 créditos", async () => {
    const r = await valuateRequest("texto", { apiKey: "k", callModel: reply(EJEMPLO_DOCUMENTO) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.creditsHalf).toBe(8);
    expect(r.items).toHaveLength(4);
    expect(r.items[3]).toEqual({ description: "Modificar parte del contenido de una sección", creditsHalf: 4 });
    expect(r.promptVersion).toBe(CREDIT_PROMPT_VERSION);
    expect(r.model).toBe("claude-opus-5");
  });

  it("RN-CLS-05 · apunta el coste del modelo que contestó de verdad", async () => {
    const r = await valuateRequest("texto", {
      apiKey: "k",
      callModel: reply(EJEMPLO_DOCUMENTO, { model: "claude-sonnet-5" }),
    });
    expect(r.ok && r.costMillicents).toBe(estimateCostMillicents("claude-sonnet-5", 2000, 400));
    expect(estimateCostMillicents("claude-opus-5", 2000, 400)).toBe(2000);
    // Un modelo desconocido se apunta al precio más caro, no a cero.
    expect(estimateCostMillicents("modelo-nuevo", 2000, 400)).toBe(2000);
  });
});

describe("RN-CRE-10 · si algo falla, va al equipo (nunca lanza)", () => {
  it("sin clave", async () => {
    expect(await valuateRequest("texto", { apiKey: "" })).toEqual({ ok: false, reason: "no_api_key" });
  });

  it("si la IA se niega", async () => {
    const r = await valuateRequest("texto", { apiKey: "k", callModel: reply(EJEMPLO_DOCUMENTO, { stopReason: "refusal" }) });
    expect(r).toEqual({ ok: false, reason: "refusal" });
  });

  it("si la respuesta se corta", async () => {
    const r = await valuateRequest("texto", { apiKey: "k", callModel: reply("{", { stopReason: "max_tokens" }) });
    expect(r).toEqual({ ok: false, reason: "truncated" });
  });

  it("si tarda demasiado o no hay red", async () => {
    const timeout: CallModel = async () => {
      throw new Anthropic.APIConnectionTimeoutError();
    };
    expect(await valuateRequest("texto", { apiKey: "k", callModel: timeout })).toEqual({ ok: false, reason: "timeout" });
    const red: CallModel = async () => {
      throw new Error("boom");
    };
    expect(await valuateRequest("texto", { apiKey: "k", callModel: red })).toEqual({ ok: false, reason: "network_error" });
  });

  it("RN-CRE-04 · una cifra que no es múltiplo de 0,5 no vale", async () => {
    const r = await valuateRequest("texto", {
      apiKey: "k",
      callModel: reply({ ...EJEMPLO_DOCUMENTO, items: [{ description: "Algo", credits: 0.3 }] }),
    });
    expect(r).toEqual({ ok: false, reason: "invalid_response" });
  });

  it("sin partidas o con partidas vacías no vale", async () => {
    expect(parseValuationReply(JSON.stringify({ ...EJEMPLO_DOCUMENTO, items: [] }))).toBeNull();
    expect(
      parseValuationReply(JSON.stringify({ ...EJEMPLO_DOCUMENTO, items: [{ description: " ", credits: 1 }] })),
    ).toBeNull();
    expect(
      parseValuationReply(JSON.stringify({ ...EJEMPLO_DOCUMENTO, items: [{ description: "x", credits: 0 }] })),
    ).toBeNull();
    expect(parseValuationReply("no es json")).toBeNull();
  });

  it("RN-CRE-06 · lo que no es mantenimiento no se valora: va al equipo con el motivo", async () => {
    const r = await valuateRequest("Rehaced toda la web", {
      apiKey: "k",
      callModel: reply({
        summary: "Rediseño completo",
        items: [],
        out_of_scope: true,
        out_of_scope_reason: "Un rediseño completo se presupuesta aparte.",
      }),
    });
    expect(r).toEqual({ ok: false, reason: "out_of_scope", note: "Un rediseño completo se presupuesta aparte." });
  });
});
