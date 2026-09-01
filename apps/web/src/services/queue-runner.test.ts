import { describe, expect, it, vi } from "vitest";

import {
  drainEmailQueue,
  runScheduledJobs,
  runSlaSweep,
  type DeliveryRow,
  type MailComposer,
  type MailTransport,
  type QueueGateway,
  type ScheduledJobRow,
  type SlaCounterRow,
} from "./queue-runner";

function gateway(overrides: Partial<QueueGateway> = {}): QueueGateway {
  return {
    claimScheduledJobs: async () => [],
    runScheduledJob: async () => 0,
    finishScheduledJob: async () => {},
    slaCounters: async () => [],
    emitSlaNotification: async () => 1,
    holidays: async () => [],
    claimDeliveries: async () => [],
    markDeliverySent: async () => {},
    markDeliveryFailed: async () => {},
    ...overrides,
  };
}

// Lunes 09:00 en Madrid: el reloj contractual arranca ahí (RN-CLK-01).
const LUNES_9 = new Date("2026-09-07T07:00:00Z");

function contador(over: Partial<SlaCounterRow> = {}): SlaCounterRow {
  return {
    entity_type: "job",
    entity_id: "job-1",
    job_id: "job-1",
    counter_kind: "t2",
    category: "small",
    start_sla_hours: 24,
    timezone: "Europe/Madrid",
    events: [{ event_type: "started", occurred_at: LUNES_9.toISOString() }],
    ...over,
  };
}

describe("RN-SLA-10 y RN-SLA-15 · el barrido de plazos emite los avisos", () => {
  it("RN-SLA-10: un contador recién arrancado no emite nada", async () => {
    const emit = vi.fn<QueueGateway["emitSlaNotification"]>(async () => 1);
    const result = await runSlaSweep(
      gateway({ slaCounters: async () => [contador()], emitSlaNotification: emit }),
      "espacio",
      new Date(LUNES_9.getTime() + 60_000),
    );
    expect(emit).not.toHaveBeenCalled();
    expect(result.emitted).toBe(0);
  });

  it("RN-SLA-10: pasado el 50 % del plazo de inicio, emite su aviso", async () => {
    const emit = vi.fn<QueueGateway["emitSlaNotification"]>(async () => 1);
    // 24 h laborables desde el lunes 09:00, medido a media semana.
    await runSlaSweep(
      gateway({ slaCounters: async () => [contador()], emitSlaNotification: emit }),
      "espacio",
      new Date("2026-09-08T12:00:00Z"),
    );
    const eventos = emit.mock.calls.map((c) => c[1]);
    expect(eventos).toContain("t2_threshold_50");
  });

  it("RN-SLA-15: un contador T3 usa sus propios umbrales", async () => {
    const emit = vi.fn<QueueGateway["emitSlaNotification"]>(async () => 1);
    await runSlaSweep(
      gateway({
        slaCounters: async () => [contador({ counter_kind: "t3", category: "small" })],
        emitSlaNotification: emit,
      }),
      "espacio",
      new Date("2026-09-18T12:00:00Z"),
    );
    const eventos = emit.mock.calls.map((c) => c[1]);
    expect(eventos.some((e) => String(e).startsWith("t3_threshold_"))).toBe(true);
    expect(eventos.some((e) => String(e).startsWith("t2_"))).toBe(false);
  });

  it("RN-NOT-01: un contador sin trabajo asociado no emite nada", async () => {
    const emit = vi.fn<QueueGateway["emitSlaNotification"]>(async () => 1);
    const result = await runSlaSweep(
      gateway({ slaCounters: async () => [contador({ job_id: null })], emitSlaNotification: emit }),
      "espacio",
      new Date("2026-09-30T12:00:00Z"),
    );
    expect(emit).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it("RN-SLA-11: un T3 sin categoría no se inventa el plazo, se salta", async () => {
    const emit = vi.fn<QueueGateway["emitSlaNotification"]>(async () => 1);
    const result = await runSlaSweep(
      gateway({
        slaCounters: async () => [contador({ counter_kind: "t3", category: null })],
        emitSlaNotification: emit,
      }),
      "espacio",
      new Date("2026-09-30T12:00:00Z"),
    );
    expect(emit).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });
});

describe("La cola de barridos", () => {
  const trabajos: ScheduledJobRow[] = [
    { id: "j1", space_id: "e1", kind: "monthly_charges", attempts: 1 },
    { id: "j2", space_id: "e1", kind: "dunning_sweep", attempts: 1 },
  ];

  it("ejecuta cada trabajo reclamado", async () => {
    const run = vi.fn(async () => 3);
    const result = await runScheduledJobs(
      gateway({ claimScheduledJobs: async () => trabajos, runScheduledJob: run }),
    );
    expect(run).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ran: 2, failed: 0 });
  });

  it("un trabajo que falla no tumba a los siguientes y queda marcado con su error", async () => {
    const finish = vi.fn(async () => {});
    const run = vi.fn(async (id: string) => {
      if (id === "j1") throw new Error("el restaurante no tiene plan");
      return 1;
    });
    const result = await runScheduledJobs(
      gateway({ claimScheduledJobs: async () => trabajos, runScheduledJob: run, finishScheduledJob: finish }),
    );
    expect(result).toEqual({ ran: 1, failed: 1 });
    expect(finish).toHaveBeenCalledWith("j1", false, "el restaurante no tiene plan");
  });
});

describe("RN-NOT-05 · la cola de correo, con reintentos e idempotencia", () => {
  function entrega(over: Partial<DeliveryRow> = {}): DeliveryRow {
    return {
      delivery_id: "d1",
      notification_id: "n1",
      attempts: 1,
      recipient_email: "ana@example.com",
      event_type: "job_published",
      audience: "staff",
      deep_link: "/espacios/x/trabajos/1",
      space_name: "Restavor",
      ...over,
    };
  }

  const composer: MailComposer = {
    compose: (d) =>
      d.recipient_email === null
        ? null
        : { to: d.recipient_email, subject: "Aviso de Cuotly", body: d.deep_link },
  };

  const ok: MailTransport = { send: async () => "prov-1" };
  const roto: MailTransport = {
    send: async () => {
      throw new Error("Resend no responde");
    },
  };

  it("RN-NOT-05: un envío correcto se marca enviado con el identificador del proveedor", async () => {
    const marcar = vi.fn(async () => {});
    const result = await drainEmailQueue(
      gateway({ claimDeliveries: async () => [entrega()], markDeliverySent: marcar }),
      ok,
      composer,
    );
    expect(result.sent).toBe(1);
    expect(marcar).toHaveBeenCalledWith("d1", "prov-1");
  });

  it("RN-NOT-05: un fallo reprograma con espera creciente, no lo pierde", async () => {
    const fallar = vi.fn<QueueGateway["markDeliveryFailed"]>(async () => {});
    const ahora = new Date("2026-09-07T10:00:00Z");
    const result = await drainEmailQueue(
      gateway({ claimDeliveries: async () => [entrega({ attempts: 3 })], markDeliveryFailed: fallar }),
      roto,
      composer,
      20,
      ahora,
    );
    expect(result.retried).toBe(1);
    // nextRetryDelayMinutes(3) = 2^2 = 4 minutos.
    expect(fallar).toHaveBeenCalledWith("d1", "Resend no responde", new Date("2026-09-07T10:04:00Z"), false);
  });

  it("RN-NOT-05: al quinto intento la fila queda muerta y deja de reintentarse", async () => {
    const fallar = vi.fn<QueueGateway["markDeliveryFailed"]>(async () => {});
    const result = await drainEmailQueue(
      gateway({ claimDeliveries: async () => [entrega({ attempts: 5 })], markDeliveryFailed: fallar }),
      roto,
      composer,
    );
    expect(result.dead).toBe(1);
    expect(fallar.mock.calls[0]?.[3]).toBe(true);
  });

  it("CA-18: un destinatario sin correo no se reintenta cinco veces contra nada", async () => {
    const fallar = vi.fn<QueueGateway["markDeliveryFailed"]>(async () => {});
    const enviar = vi.fn(async () => "x");
    const result = await drainEmailQueue(
      gateway({
        claimDeliveries: async () => [entrega({ recipient_email: null })],
        markDeliveryFailed: fallar,
      }),
      { send: enviar },
      composer,
    );
    expect(enviar).not.toHaveBeenCalled();
    expect(result.dead).toBe(1);
    expect(fallar.mock.calls[0]?.[3]).toBe(true);
  });
});
