import { beforeEach, describe, expect, it, vi } from "vitest";

const classifyRequestMock = vi.hoisted(() => vi.fn());
vi.mock("./ai-classifier", () => ({ classifyRequest: classifyRequestMock }));

const valuateRequestMock = vi.hoisted(() => vi.fn());
vi.mock("./ai-credit-valuator", () => ({ valuateRequest: valuateRequestMock }));

const adminRpcMock = vi.hoisted(() => vi.fn());
/**
 * Lo que el cliente administrativo lee para decidir el camino (PRD §41):
 * la solicitud, su suscripción y el plan. Por omisión, un plan por
 * categorías, que es el camino de siempre.
 */
const filas = vi.hoisted(() => ({
  requests: { kind: "change", establishment_id: "33333333-3333-3333-3333-333333333333" } as Record<string, unknown> | null,
  subscriptions: { plan_id: "44444444-4444-4444-4444-444444444444" } as Record<string, unknown> | null,
  plans: {
    included_credits_half: 0,
    included_small: 6,
    included_photo: 6,
    included_medium: 1,
    included_large: 0,
  } as Record<string, unknown> | null,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: adminRpcMock,
    from: (tabla: keyof typeof filas) => {
      const consulta = {
        select: () => consulta,
        eq: () => consulta,
        maybeSingle: async () => ({ data: filas[tabla], error: null }),
      };
      return consulta;
    },
  }),
}));

import { clasificarSolicitud } from "./request-classification";

/**
 * `clasificarSolicitud()` es el único sitio donde se clasifica: lo llaman
 * el envío del restaurante (automático, RN-CLS-01) y el botón de reintento
 * del equipo. Lo que se prueba aquí es lo que hace distinto a esta rutina
 * de una llamada suelta: **nunca lanza**, siempre devuelve un resultado con
 * su motivo, y el actor que se le pasa es el que se graba.
 */

type ClienteFalso = { rpc: ReturnType<typeof vi.fn> };

function cliente(respuestaRpc: { error: { message: string } | null } = { error: null }) {
  return { rpc: vi.fn().mockResolvedValue(respuestaRpc) } as ClienteFalso;
}

const ENTRADA = {
  requestId: "11111111-1111-1111-1111-111111111111",
  actorId: "22222222-2222-2222-2222-222222222222",
  description: "Cambiar el teléfono del pie",
  context: null,
};

// El cliente real de Supabase tiene un tipo generado enorme y aquí solo se
// usa `rpc`. Se pasa por `unknown` en vez de por `any` (CLAUDE.md: sin
// `any` salvo justificación) — el doble no finge ser el tipo entero, solo
// se declara compatible en el punto de llamada.
type ClienteSupabase = Parameters<typeof clasificarSolicitud>[0];
const comoSupabase = (falso: ClienteFalso) => falso as unknown as ClienteSupabase;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-prueba";
  classifyRequestMock.mockResolvedValue({
    source: "rules",
    category: "small",
    summary: "Un cambio pequeño.",
    matchedKeywords: ["telefono"],
    fallbackReason: "sin clave",
  });
  adminRpcMock.mockResolvedValue({ error: null });
  filas.requests = { kind: "change", establishment_id: "33333333-3333-3333-3333-333333333333" };
  filas.subscriptions = { plan_id: "44444444-4444-4444-4444-444444444444" };
  filas.plans = { included_credits_half: 0, included_small: 6, included_photo: 6, included_medium: 1, included_large: 0 };
});

describe("clasificarSolicitud", () => {
  it("RN-CLS-01: graba la propuesta con el actor que se le indica", async () => {
    const supabase = cliente();

    const resultado = await clasificarSolicitud(comoSupabase(supabase), ENTRADA);

    expect(resultado).toEqual({ ok: true });
    expect(supabase.rpc).toHaveBeenCalledWith("begin_request_analysis", {
      p_request_id: ENTRADA.requestId,
    });
    expect(adminRpcMock).toHaveBeenCalledWith(
      "record_classification",
      expect.objectContaining({
        p_request_id: ENTRADA.requestId,
        p_actor_id: ENTRADA.actorId,
        p_source: "rules",
        p_category: "small",
      }),
    );
  });

  it("RN-CLS-02: si el clasificador revienta, devuelve el motivo y NO lanza", async () => {
    classifyRequestMock.mockRejectedValue(new Error("Anthropic no contesta"));

    const resultado = await clasificarSolicitud(comoSupabase(cliente()), ENTRADA);

    expect(resultado).toEqual({ ok: false, motivo: "Anthropic no contesta" });
  });

  it("RN-CLS-02: si el servidor rechaza el paso a análisis, lo dice y no graba nada", async () => {
    const supabase = cliente({ error: { message: "No tienes permiso para analizar esta solicitud" } });

    const resultado = await clasificarSolicitud(comoSupabase(supabase), ENTRADA);

    expect(resultado).toEqual({
      ok: false,
      motivo: "No tienes permiso para analizar esta solicitud",
    });
    expect(adminRpcMock).not.toHaveBeenCalled();
  });

  it("RN-CLS-01: sin la clave de service_role no intenta nada, y explica por qué", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = cliente();

    const resultado = await clasificarSolicitud(comoSupabase(supabase), ENTRADA);

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.motivo).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe("clasificarSolicitud · PRD §41, en créditos", () => {
  beforeEach(() => {
    filas.plans = { included_credits_half: 40, included_small: 0, included_photo: 0, included_medium: 0, included_large: 0 };
  });

  it("RN-CRE-09: con un plan de créditos, la IA valora y se graba la valoración", async () => {
    valuateRequestMock.mockResolvedValue({
      ok: true,
      creditsHalf: 5,
      items: [
        { description: "Cambiar teléfono", creditsHalf: 1 },
        { description: "Sustituir una foto", creditsHalf: 3 },
      ],
      summary: "Teléfono y foto",
      model: "claude-opus-5",
      usage: { inputTokens: 2000, outputTokens: 300 },
      costMillicents: 1750,
      promptVersion: "creditos-v1",
    });

    const resultado = await clasificarSolicitud(comoSupabase(cliente()), ENTRADA);

    expect(resultado).toEqual({ ok: true });
    expect(classifyRequestMock).not.toHaveBeenCalled();
    expect(adminRpcMock).toHaveBeenCalledWith(
      "record_credit_valuation",
      expect.objectContaining({
        p_request_id: ENTRADA.requestId,
        p_actor_id: ENTRADA.actorId,
        p_credits_half: 5,
        p_breakdown: {
          items: [
            { description: "Cambiar teléfono", credits_half: 1 },
            { description: "Sustituir una foto", credits_half: 3 },
          ],
        },
        p_prompt_version: "creditos-v1",
      }),
    );
  });

  it("RN-CRE-10: si la IA no valora, va al equipo con el motivo y no lanza", async () => {
    valuateRequestMock.mockResolvedValue({ ok: false, reason: "out_of_scope", note: "Es un rediseño" });

    const resultado = await clasificarSolicitud(comoSupabase(cliente()), ENTRADA);

    expect(resultado).toEqual({ ok: true });
    expect(adminRpcMock).toHaveBeenCalledWith(
      "record_classification",
      expect.objectContaining({
        p_source: "rules",
        p_fallback_reason: "credits:out_of_scope: Es un rediseño",
      }),
    );
    expect(adminRpcMock).not.toHaveBeenCalledWith("record_credit_valuation", expect.anything());
  });

  it("RN-REQ-11: una incidencia no se valora en créditos", async () => {
    filas.requests = { kind: "incident", establishment_id: "33333333-3333-3333-3333-333333333333" };

    await clasificarSolicitud(comoSupabase(cliente()), ENTRADA);

    expect(valuateRequestMock).not.toHaveBeenCalled();
    expect(classifyRequestMock).toHaveBeenCalled();
  });

  it("RN-CRE-07: sin plan, también en créditos", async () => {
    filas.subscriptions = null;
    valuateRequestMock.mockResolvedValue({ ok: false, reason: "no_api_key" });

    await clasificarSolicitud(comoSupabase(cliente()), ENTRADA);

    expect(valuateRequestMock).toHaveBeenCalled();
  });
});
