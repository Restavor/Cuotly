import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La puerta de la tarea de grupos pendientes (RN-RES-05): quien pase de aquí ejecuta una
 * función reservada a `service_role`. Sin secreto configurado la ruta NO se queda abierta
 * (CLAUDE.md, «toda operación se valida en el servidor»), con GET (el cron) y con POST (a mano).
 */
const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: rpcMock }) }));

import { GET, POST } from "./route";

const pedir = (metodo: "GET" | "POST", auth?: string) =>
  (metodo === "GET" ? GET : POST)(new Request("http://localhost/api/agents/cron/pendientes", { method: metodo, headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: 3, error: null });
  delete process.env.CRON_SECRET;
  delete process.env.QUEUE_RUNNER_SECRET;
});
afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.QUEUE_RUNNER_SECRET;
});

describe("RN-RES-05 · la tarea de los grupos pendientes", () => {
  it("RN-RES-05 · sin secreto configurado no se queda abierta (503), con GET y con POST", async () => {
    for (const metodo of ["GET", "POST"] as const) {
      const r = await pedir(metodo, "Bearer cualquiera");
      expect(r.status).toBe(503);
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("RN-RES-05 · con secreto, una cabecera mala o ausente se rechaza (401) y no ejecuta nada", async () => {
    process.env.CRON_SECRET = "secreto-del-cron";
    for (const auth of [undefined, "Bearer otro", "secreto-del-cron", "Bearer secreto-del-cro"]) {
      expect((await pedir("GET", auth)).status, String(auth)).toBe(401);
      expect((await pedir("POST", auth)).status, String(auth)).toBe(401);
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("RN-RES-05 · con el secreto correcto (cualquiera de los dos nombres) lanza el recordatorio y dice cuántos", async () => {
    process.env.CRON_SECRET = "secreto-del-cron";
    const r = await pedir("GET", "Bearer secreto-del-cron");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ reminded: 3 });
    expect(rpcMock).toHaveBeenCalledWith("reservations_remind_pending");

    delete process.env.CRON_SECRET;
    process.env.QUEUE_RUNNER_SECRET = "secreto-de-la-cola";
    expect((await pedir("POST", "Bearer secreto-de-la-cola")).status).toBe(200);
  });

  it("RN-RES-05 · si la base de datos falla, 500 con el motivo", async () => {
    process.env.CRON_SECRET = "secreto-del-cron";
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const r = await pedir("GET", "Bearer secreto-del-cron");
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "boom" });
  });
});
