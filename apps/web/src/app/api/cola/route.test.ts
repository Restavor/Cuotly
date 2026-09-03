import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La puerta de la cola, que es lo único de esta ruta que hay que
 * defender: quien pase de aquí ejecuta el runner con la `service_role`.
 *
 * Los tres casos que importan, y el tercero es el que se suele olvidar:
 * sin secreto configurado la ruta NO se queda abierta (CLAUDE.md, "toda
 * operación se valida en el servidor"). Se prueban con GET y con POST
 * porque el cron de Vercel usa GET y a mano se usa POST — y una puerta que
 * solo cierra por un lado no cierra.
 */

const runScheduledJobsMock = vi.hoisted(() => vi.fn());
const runSlaSweepMock = vi.hoisted(() => vi.fn());
const drainEmailQueueMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/queue-runner", () => ({
  runScheduledJobs: runScheduledJobsMock,
  runSlaSweep: runSlaSweepMock,
  drainEmailQueue: drainEmailQueueMock,
}));

vi.mock("@/services/queue-gateway", () => ({
  createSupabaseQueueGateway: vi.fn(),
  createResendTransport: vi.fn(),
  createMailComposer: vi.fn(),
}));

const fromMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: fromMock }),
}));

import { GET, POST } from "./route";

const SECRETO = "un-secreto-largo-de-verdad";

function peticion(cabecera?: string) {
  return new Request("http://localhost:3000/api/cola", {
    headers: cabecera ? { authorization: cabecera } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.QUEUE_RUNNER_SECRET;
  delete process.env.CRON_SECRET;

  runScheduledJobsMock.mockResolvedValue({ ran: 0 });
  drainEmailQueueMock.mockResolvedValue({ sent: 0 });
  fromMock.mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });
});

afterEach(() => {
  delete process.env.QUEUE_RUNNER_SECRET;
  delete process.env.CRON_SECRET;
});

describe("POST /api/cola", () => {
  it("sin ningún secreto configurado responde 503 y no ejecuta nada", async () => {
    const respuesta = await POST(peticion(`Bearer ${SECRETO}`));

    expect(respuesta.status).toBe(503);
    expect(runScheduledJobsMock).not.toHaveBeenCalled();
  });

  it("con la cabecera equivocada responde 401 y no ejecuta nada", async () => {
    process.env.QUEUE_RUNNER_SECRET = SECRETO;

    expect((await POST(peticion("Bearer otra-cosa"))).status).toBe(401);
    expect((await POST(peticion())).status).toBe(401);
    expect(runScheduledJobsMock).not.toHaveBeenCalled();
  });

  it("con QUEUE_RUNNER_SECRET ejecuta la tanda", async () => {
    process.env.QUEUE_RUNNER_SECRET = SECRETO;

    const respuesta = await POST(peticion(`Bearer ${SECRETO}`));

    expect(respuesta.status).toBe(200);
    expect(runScheduledJobsMock).toHaveBeenCalledOnce();
  });

  it("con CRON_SECRET también, que es la variable que usa el cron de Vercel", async () => {
    process.env.CRON_SECRET = SECRETO;

    const respuesta = await POST(peticion(`Bearer ${SECRETO}`));

    expect(respuesta.status).toBe(200);
    expect(runScheduledJobsMock).toHaveBeenCalledOnce();
  });
});

describe("GET /api/cola", () => {
  it("hace lo mismo que POST: es como invoca el cron de Vercel", async () => {
    process.env.CRON_SECRET = SECRETO;

    const respuesta = await GET(peticion(`Bearer ${SECRETO}`));

    expect(respuesta.status).toBe(200);
    expect(runScheduledJobsMock).toHaveBeenCalledOnce();
  });

  it("y cierra igual que POST: sin cabecera, 401", async () => {
    process.env.CRON_SECRET = SECRETO;

    expect((await GET(peticion())).status).toBe(401);
    expect(runScheduledJobsMock).not.toHaveBeenCalled();
  });
});
