import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: rpcMock }) }));
vi.mock("@/services/vies", () => ({ checkVies: vi.fn(async () => ({ kind: "unavailable" })) }));

import { POST } from "./route";

function peticion(cuerpo: unknown) {
  return new Request("http://localhost/api/movil/solicitud-acceso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
  });
}

const completo = {
  contact_name: "Ana García",
  business_name: "Restaurante Oliva",
  phone: "600000000",
  email: "ana@example.com",
  tax_id: "12345678Z",
  tax_country: "ES",
};

beforeEach(() => vi.clearAllMocks());

describe("Decisión 68 · RN-ACC-02 · la solicitud desde el teléfono pasa por el servidor", () => {
  it("RN-ACC-02 · con un DNI bueno, entra por el mismo camino que la web", async () => {
    rpcMock.mockResolvedValue({ error: null });
    const respuesta = await POST(peticion(completo));
    expect(await respuesta.json()).toEqual({ ok: true, done: true });
    expect(rpcMock).toHaveBeenCalledWith(
      "submit_access_request",
      expect.objectContaining({ p_tax_id: "12345678Z", p_tax_id_verification: "checksum" }),
    );
  });

  it("RN-ACC-02 · con un DNI inventado, no llega a la base y dice qué campo", async () => {
    const respuesta = await POST(peticion({ ...completo, tax_id: "12345678A" }));
    const cuerpo = await respuesta.json();
    expect(cuerpo.ok).toBe(false);
    expect(cuerpo.problems).toEqual({ tax_id: "invalid" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("un cuerpo que no es JSON es un 400", async () => {
    const respuesta = await POST(peticion("no es json"));
    expect(respuesta.status).toBe(400);
  });
});
