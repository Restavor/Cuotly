import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La puerta y el reparto del barrido diario del ciclo de vida (RN-RES-11): quien pase de aquí
 * ejecuta una función reservada a `service_role`. Sin secreto la ruta NO se queda abierta, y lo
 * que pide salir al momento sale.
 */
const rpcMock = vi.hoisted(() => vi.fn());
const entregarMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: rpcMock }) }));
vi.mock("@/services/agents/lifecycle-delivery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/agents/lifecycle-delivery")>()),
  deliverNoticesNow: entregarMock,
}));

import { GET, POST } from "./route";

const EST = "11111111-2222-3333-4444-555555555555";
const pedir = (metodo: "GET" | "POST", auth?: string, query = "") =>
  (metodo === "GET" ? GET : POST)(
    new Request(`http://localhost/api/agents/cron/ciclo${query}`, { method: metodo, headers: auth ? { authorization: auth } : {} }),
  );

beforeEach(() => {
  rpcMock.mockReset();
  entregarMock.mockReset();
  rpcMock.mockResolvedValue({
    data: {
      changes: [{ establishment_id: EST, from: "past_due", to: "paused" }],
      keys: [`reservations_paused:${EST}:1759000000`, "reservations_past_due:x:due:1"],
      email_now_keys: [`reservations_paused:${EST}:1759000000`],
      errors: [],
    },
    error: null,
  });
  delete process.env.CRON_SECRET;
  delete process.env.QUEUE_RUNNER_SECRET;
});
afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.QUEUE_RUNNER_SECRET;
  vi.useRealTimers();
});

describe("RN-RES-11 · la tarea diaria del ciclo de vida", () => {
  it("RN-RES-11 · sin secreto configurado no se queda abierta (503), con GET y con POST", async () => {
    for (const metodo of ["GET", "POST"] as const) expect((await pedir(metodo, "Bearer cualquiera", "?force=1")).status).toBe(503);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("RN-RES-11 · con secreto, una cabecera mala o ausente se rechaza (401) y no ejecuta nada", async () => {
    process.env.CRON_SECRET = "secreto-del-cron";
    for (const auth of [undefined, "Bearer otro", "secreto-del-cron", "Bearer secreto-del-cro"]) {
      expect((await pedir("GET", auth, "?force=1")).status, String(auth)).toBe(401);
      expect((await pedir("POST", auth, "?force=1")).status, String(auth)).toBe(401);
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("RN-RES-11 · fuera de las 08:00 de Madrid no barre (sin ?force)", async () => {
    process.env.CRON_SECRET = "secreto-del-cron";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-15T10:00:00Z"));
    const r = await pedir("GET", "Bearer secreto-del-cron");
    expect(await r.json()).toMatchObject({ ran: false });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("RN-RES-11 · a las 08:00 de Madrid barre y manda al momento los push y los dos correos importantes", async () => {
    process.env.CRON_SECRET = "secreto-del-cron";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-15T07:00:00Z"));
    const r = await pedir("GET", "Bearer secreto-del-cron");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ran: true, changes: 1, notices: 2, errors: [] });
    expect(rpcMock).toHaveBeenCalledWith("reservations_lifecycle_sweep");
    expect(entregarMock).toHaveBeenCalledWith({
      pushKeys: [`reservations_paused:${EST}:1759000000`, "reservations_past_due:x:due:1"],
      emailKeys: [`reservations_paused:${EST}:1759000000`],
      establishmentIds: [EST],
    });
  });

  it("RN-RES-11 · con ?force=1 barre a cualquier hora, con cualquiera de los dos secretos", async () => {
    process.env.QUEUE_RUNNER_SECRET = "secreto-de-la-cola";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-15T13:00:00Z"));
    expect((await pedir("POST", "Bearer secreto-de-la-cola", "?force=1")).status).toBe(200);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("RN-RES-11 · los errores de un restaurante vuelven en la respuesta, no se tragan", async () => {
    process.env.CRON_SECRET = "secreto-del-cron";
    rpcMock.mockResolvedValue({
      data: { changes: [], keys: [], email_now_keys: [], errors: [{ establishment_id: EST, error: "boom" }] },
      error: null,
    });
    const r = await pedir("GET", "Bearer secreto-del-cron", "?force=1");
    expect((await r.json()).errors).toEqual([{ establishment_id: EST, error: "boom" }]);
  });

  it("RN-RES-11 · si la base de datos falla, 500 con el motivo", async () => {
    process.env.CRON_SECRET = "secreto-del-cron";
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const r = await pedir("GET", "Bearer secreto-del-cron", "?force=1");
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "boom" });
  });
});
