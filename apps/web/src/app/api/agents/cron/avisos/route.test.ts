import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La puerta de la tarea de avisos (AVI-01): quien pase de aquí envía mensajes a comensales y mueve dinero del saldo.
 * Sin secreto configurado la ruta NO se queda abierta, con GET (el cron) y con POST (a mano).
 */
const dispatchMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/agents/messaging/dispatch", () => ({ dispatchEveryDue: dispatchMock }));

import { GET, POST } from "./route";

const SUMMARY = { claimed: 2, sent: 1, retried: 1, failed: 0, fallbacks: 0, establishments: 1, prices: { checked: 0, priced: 0 } };

const pedir = (metodo: "GET" | "POST", auth?: string) =>
  (metodo === "GET" ? GET : POST)(new Request("http://localhost/api/agents/cron/avisos", { method: metodo, headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  dispatchMock.mockReset();
  dispatchMock.mockResolvedValue(SUMMARY);
  delete process.env.CRON_SECRET;
  delete process.env.QUEUE_RUNNER_SECRET;
});
afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.QUEUE_RUNNER_SECRET;
});

describe("AVI-01 · la tarea de cada minuto de los avisos", () => {
  it("AVI-01 · sin secreto configurado no se queda abierta (503), con GET y con POST", async () => {
    for (const metodo of ["GET", "POST"] as const) {
      expect((await pedir(metodo, "Bearer cualquiera")).status).toBe(503);
    }
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("AVI-01 · con secreto, una cabecera mala o ausente se rechaza (401) y no envía nada", async () => {
    process.env.CRON_SECRET = "secreto-del-cron";
    for (const auth of [undefined, "Bearer otro", "secreto-del-cron", "Bearer secreto-del-cro"]) {
      expect((await pedir("GET", auth)).status, String(auth)).toBe(401);
      expect((await pedir("POST", auth)).status, String(auth)).toBe(401);
    }
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("AVI-01 · con el secreto correcto (cualquiera de los dos nombres) procesa los avisos y dice solo cuántos", async () => {
    process.env.CRON_SECRET = "secreto-del-cron";
    const r = await pedir("GET", "Bearer secreto-del-cron");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(SUMMARY);
    expect(dispatchMock).toHaveBeenCalledTimes(1);

    delete process.env.CRON_SECRET;
    process.env.QUEUE_RUNNER_SECRET = "secreto-de-la-cola";
    expect((await pedir("POST", "Bearer secreto-de-la-cola")).status).toBe(200);
  });

  it("AVI-01 · si la base de datos falla, 500 con un mensaje que no cuenta nada de nadie", async () => {
    process.env.CRON_SECRET = "secreto-del-cron";
    dispatchMock.mockRejectedValue(new Error("reservation_notice_due_establishments: connection refused"));
    const r = await pedir("GET", "Bearer secreto-del-cron");
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "No se pudieron procesar los avisos" });
  });
});
