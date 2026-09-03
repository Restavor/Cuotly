import { beforeEach, describe, expect, it, vi } from "vitest";

const classifyRequestMock = vi.hoisted(() => vi.fn());
vi.mock("./ai-classifier", () => ({ classifyRequest: classifyRequestMock }));

const adminRpcMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: adminRpcMock }),
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
