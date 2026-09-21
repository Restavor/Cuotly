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
const drainPlatformEmailQueueMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/queue-runner", () => ({
  runScheduledJobs: runScheduledJobsMock,
  runSlaSweep: runSlaSweepMock,
  // Migración 94 (RN-MOV-04): correo y push salen de la misma cola por
  // `drainDeliveryQueue`; el nombre del doble se conserva.
  drainDeliveryQueue: drainEmailQueueMock,
  // Migración 97 (RN-ACC-04): la cola de correo hacia direcciones sin
  // cuenta, que la tanda vacía después de la de avisos.
  drainPlatformEmailQueue: drainPlatformEmailQueueMock,
}));

vi.mock("@/services/queue-gateway", () => ({
  createSupabaseQueueGateway: vi.fn(),
  createResendTransport: vi.fn(),
  createMailComposer: vi.fn(),
  createExpoPushTransport: vi.fn(),
  createPushComposer: vi.fn(),
  createPlatformEmailGateway: vi.fn(),
  createPlatformEmailComposer: vi.fn(),
}));

const fromMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: fromMock }),
}));

// Fase 3 · las integraciones entran en la misma tanda. Aquí solo se
// vigila que se llamen (y que no, cuando la puerta está cerrada); el
// proceso se prueba entero en `integration-sync.test.ts`.
const runIntegrationSyncsMock = vi.hoisted(() => vi.fn());
const runPendingRevocationsMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/integration-sync", () => ({
  runIntegrationSyncs: runIntegrationSyncsMock,
  runPendingRevocations: runPendingRevocationsMock,
}));
vi.mock("@/services/integration-gateway", () => ({
  createSupabaseIntegrationGateway: vi.fn(),
}));

// Hito 15 · el barrido de oportunidades va en la misma tanda, detrás de
// las sincronizaciones. Aquí solo se vigila que se llame; las nueve
// reglas se prueban en `opportunities.test.ts` y el barrido entero en
// `opportunity-detection.test.ts`.
const runOpportunityDetectionMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/opportunity-detection", () => ({
  runOpportunityDetection: runOpportunityDetectionMock,
}));
vi.mock("@/services/opportunity-gateway", () => ({
  createSupabaseOpportunityGateway: vi.fn(),
}));

// Hito 16 · los informes programados van en la misma tanda, detrás de las
// oportunidades (§95 no deja salir un informe con oportunidades
// pendientes). El envío y el aviso se prueban enteros en
// `report-generation.test.ts`; aquí solo se vigila que se llamen.
const runReportQueueMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/report-generation", () => ({
  runReportQueue: runReportQueueMock,
}));
vi.mock("@/services/report-gateway", () => ({
  createSupabaseReportGateway: vi.fn(),
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
  // La forma completa que devuelven las dos colas. `blockedBy` no es
  // opcional: un mock que lo omita miente sobre el contrato y esconde
  // justo lo que este campo existe para enseñar.
  drainEmailQueueMock.mockResolvedValue({ sent: 0, retried: 0, dead: 0, blockedBy: null });
  drainPlatformEmailQueueMock.mockResolvedValue({ sent: 0, retried: 0, dead: 0, blockedBy: null });
  runIntegrationSyncsMock.mockResolvedValue({ claimed: 0, skipped: "vault_not_configured" });
  runPendingRevocationsMock.mockResolvedValue({ attempted: 0, skipped: "vault_not_configured" });
  runOpportunityDetectionMock.mockResolvedValue({ scanned: 0, detections: 0, failed: 0 });
  runReportQueueMock.mockResolvedValue({ reminded: 0, sent: 0, blocked: 0, failed: 0 });
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

  it("RN-INT-09 · la tanda ejecuta también las integraciones y la revocación pendiente, y dice si se saltaron", async () => {
    process.env.QUEUE_RUNNER_SECRET = SECRETO;

    const respuesta = await POST(peticion(`Bearer ${SECRETO}`));
    const cuerpo = (await respuesta.json()) as { integrations: { sync: { skipped: string }; revocations: unknown } };

    expect(runIntegrationSyncsMock).toHaveBeenCalledOnce();
    expect(runPendingRevocationsMock).toHaveBeenCalledOnce();
    // Sin bóveda en el entorno de prueba, el proceso lo dice en vez de reclamar.
    expect(runIntegrationSyncsMock.mock.calls[0][0]).toMatchObject({ vault: null, oauth: null });
    expect(cuerpo.integrations.sync.skipped).toBe("vault_not_configured");
  });

  it("sin secreto, las integraciones tampoco se tocan", async () => {
    await POST(peticion(`Bearer ${SECRETO}`));
    expect(runIntegrationSyncsMock).not.toHaveBeenCalled();
  });

  it("RN-OPP-02 · la tanda pasa las reglas de oportunidad DESPUÉS de sincronizar", async () => {
    process.env.QUEUE_RUNNER_SECRET = SECRETO;
    const orden: string[] = [];
    runIntegrationSyncsMock.mockImplementation(async () => {
      orden.push("sincronizar");
      return { claimed: 0, skipped: "vault_not_configured" };
    });
    runOpportunityDetectionMock.mockImplementation(async () => {
      orden.push("detectar");
      return { scanned: 2, detections: 3, failed: 0 };
    });

    // Hito 16 · y los informes van detrás de las dos: §95 no deja salir un
    // informe con oportunidades pendientes, y las que esta misma tanda
    // acaba de detectar cuentan. Si el orden se invirtiera, un informe
    // podría salir el día en que la regla iba a saltar.
    runReportQueueMock.mockImplementation(async () => {
      orden.push("informes");
      return { reminded: 0, sent: 1, blocked: 0, failed: 0 };
    });

    const respuesta = await POST(peticion(`Bearer ${SECRETO}`));
    const cuerpo = (await respuesta.json()) as {
      opportunities: { detections: number };
      reports: { sent: number };
    };

    expect(orden).toEqual(["sincronizar", "detectar", "informes"]);
    expect(cuerpo.opportunities.detections).toBe(3);
    expect(cuerpo.reports.sent).toBe(1);
  });

  it("sin secreto, las oportunidades tampoco se detectan", async () => {
    await POST(peticion(`Bearer ${SECRETO}`));
    expect(runOpportunityDetectionMock).not.toHaveBeenCalled();
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

describe("Una tanda bloqueada se ve sin abrir el código", () => {
  /**
   * Del 10 al 21/09/2026 la cola contestaba 200 con `sent: 0` mientras 211
   * avisos se morían por un remitente mal escrito. Un cero porque no había
   * nada que mandar y un cero porque está todo roto se veían igual.
   *
   * Ahora el motivo sale arriba del cuerpo y en el registro del servidor,
   * que es donde mira quien va a averiguar por qué no llegan los correos.
   */
  it("el motivo sale en `blocked`, arriba de la respuesta", async () => {
    process.env.QUEUE_RUNNER_SECRET = SECRETO;
    drainEmailQueueMock.mockResolvedValue({
      sent: 0,
      retried: 0,
      dead: 0,
      blockedBy: "RESEND_FROM no es una dirección válida",
    });

    const cuerpo = (await (await POST(peticion(`Bearer ${SECRETO}`))).json()) as {
      blocked: string[];
    };

    expect(cuerpo.blocked).toEqual(["RESEND_FROM no es una dirección válida"]);
  });

  it("y también al registro del servidor, que es lo que se ve en Vercel", async () => {
    process.env.QUEUE_RUNNER_SECRET = SECRETO;
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    drainPlatformEmailQueueMock.mockResolvedValue({
      sent: 0,
      retried: 0,
      dead: 0,
      blockedBy: "RESEND_API_KEY no está configurada",
    });

    await POST(peticion(`Bearer ${SECRETO}`));

    expect(registro).toHaveBeenCalledWith(
      expect.stringContaining("RESEND_API_KEY"),
    );
    registro.mockRestore();
  });

  it("cuando no hay nada bloqueado, `blocked` viene vacío y no se ensucia el registro", async () => {
    process.env.QUEUE_RUNNER_SECRET = SECRETO;
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});

    const cuerpo = (await (await POST(peticion(`Bearer ${SECRETO}`))).json()) as {
      blocked: string[];
    };

    expect(cuerpo.blocked).toEqual([]);
    expect(registro).not.toHaveBeenCalled();
    registro.mockRestore();
  });
});
