import { describe, expect, it, vi } from "vitest";

import {
  drainDeliveryQueue,
  drainEmailQueue,
  runScheduledJobs,
  runSlaSweep,
  type DeliveryRow,
  type MailComposer,
  type MailTransport,
  type PushComposer,
  type PushTransport,
  type QueueGateway,
  type ScheduledJobRow,
  type SlaCounterRow,
} from "./queue-runner";

function gateway(overrides: Partial<QueueGateway> = {}): QueueGateway {
  return {
    enqueueDueJobs: async () => 0,
    claimScheduledJobs: async () => [],
    runScheduledJob: async () => 0,
    finishScheduledJob: async () => {},
    slaCounters: async () => [],
    emitSlaNotification: async () => 1,
    holidays: async () => [],
    claimDeliveries: async () => [],
    markDeliverySent: async () => {},
    markDeliveryFailed: async () => {},
    revokePushToken: async () => true,
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
    execution_sla_hours: null,
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

  /**
   * Reclamar devuelve una tanda y después nada, que es lo que hace la
   * base: `claim_scheduled_jobs()` marca lo que reparte como `running`, y
   * un segundo reclamo ya no lo devuelve.
   */
  function porTandas(...tandas: readonly ScheduledJobRow[][]) {
    let i = 0;
    return async () => tandas[i++] ?? [];
  }

  it("ejecuta cada trabajo reclamado", async () => {
    const run = vi.fn(async () => 3);
    const result = await runScheduledJobs(
      gateway({ claimScheduledJobs: porTandas(trabajos), runScheduledJob: run }),
    );
    expect(run).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ enqueued: 0, ran: 2, failed: 0 });
  });

  /**
   * RN-FIN-01 · la avería que esta tanda de cambios arregla, dicha como
   * test: vaciar la cola sin haberla llenado antes es lo que dejó
   * `scheduled_jobs` vacía desde la migración 41, y con ella la
   * mensualidad sin emitir para siempre.
   */
  it("RN-FIN-01: llena la cola ANTES de reclamar, no después", async () => {
    const orden: string[] = [];
    const result = await runScheduledJobs(
      gateway({
        enqueueDueJobs: async () => {
          orden.push("llenar");
          return 4;
        },
        claimScheduledJobs: async () => {
          orden.push("reclamar");
          return [];
        },
      }),
    );

    expect(orden).toEqual(["llenar", "reclamar"]);
    expect(result.enqueued).toBe(4);
  });

  it("sigue reclamando tandas hasta agotar la cola", async () => {
    const run = vi.fn(async () => 1);
    const segunda: ScheduledJobRow[] = [
      { id: "j3", space_id: "e2", kind: "lifecycle_sweep", attempts: 1 },
    ];
    const result = await runScheduledJobs(
      gateway({ claimScheduledJobs: porTandas(trabajos, segunda), runScheduledJob: run }),
      2,
    );
    expect(run).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ enqueued: 0, ran: 3, failed: 0 });
  });

  it("una cola que no se agota nunca se corta en el tope, no se queda dando vueltas", async () => {
    const run = vi.fn(async () => 1);
    const result = await runScheduledJobs(
      gateway({ claimScheduledJobs: async () => trabajos, runScheduledJob: run }),
      2,
      5,
    );
    expect(result.ran).toBe(6);
  });

  it("un trabajo que falla no tumba a los siguientes y queda marcado con su error", async () => {
    const finish = vi.fn(async () => {});
    const run = vi.fn(async (id: string) => {
      if (id === "j1") throw new Error("el restaurante no tiene plan");
      return 1;
    });
    const result = await runScheduledJobs(
      gateway({
        claimScheduledJobs: porTandas(trabajos),
        runScheduledJob: run,
        finishScheduledJob: finish,
      }),
    );
    expect(result).toEqual({ enqueued: 0, ran: 1, failed: 1 });
    expect(finish).toHaveBeenCalledWith("j1", false, "el restaurante no tiene plan");
  });
});

describe("RN-NOT-05 · la cola de correo, con reintentos e idempotencia", () => {
  function entrega(over: Partial<DeliveryRow> = {}): DeliveryRow {
    return {
      delivery_id: "d1",
      notification_id: "n1",
      attempts: 1,
      channel: "email",
      recipient_email: "ana@example.com",
      push_tokens: null,
      event_type: "job_published",
      audience: "staff",
      deep_link: "/espacios/x/trabajos/1",
      space_name: "Restavor",
      entity_type: "job",
      establishment_name: "Casa Sol",
      amount_cents: null,
      threshold_percent: null,
      subject: "Quiero cambiar el precio del menú del día",
      digest_id: null,
      digest_date: null,
      digest_count: null,
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

describe("RN-MOV-04 y RN-MOV-05 · la cola de push, el mismo proceso que el correo", () => {
  function entregaPush(over: Partial<DeliveryRow> = {}): DeliveryRow {
    return {
      delivery_id: "d-push",
      notification_id: "n1",
      attempts: 1,
      channel: "push",
      recipient_email: "ana@example.com",
      push_tokens: ["ExponentPushToken[aaa]", "ExponentPushToken[bbb]"],
      event_type: "job_published",
      audience: "staff",
      deep_link: "/espacios/x/trabajos/1",
      space_name: "Restavor",
      entity_type: "job",
      establishment_name: "Casa Sol",
      amount_cents: null,
      threshold_percent: null,
      subject: "Quiero cambiar el precio del menú del día",
      digest_id: null,
      digest_date: null,
      digest_count: null,
      ...over,
    };
  }

  const pushComposer: PushComposer = {
    compose: (d) =>
      d.push_tokens && d.push_tokens.length > 0
        ? { to: d.push_tokens, title: "Trabajo publicado", body: "Restavor", deepLink: d.deep_link }
        : null,
  };
  const mailComposer: MailComposer = { compose: () => null };
  const mailOk: MailTransport = { send: async () => "mail-1" };

  function transportes(push: PushTransport | null) {
    return { mail: mailOk, mailComposer, push, pushComposer };
  }

  it("RN-MOV-04: una entrega push sale por el transporte de push y se marca enviada", async () => {
    const sent = vi.fn<QueueGateway["markDeliverySent"]>(async () => {});
    const push: PushTransport = {
      send: async (m) => m.to.map((token) => ({ token, status: "ok" as const, providerId: `t-${token}` })),
    };
    const r = await drainDeliveryQueue(
      gateway({ claimDeliveries: async () => [entregaPush()], markDeliverySent: sent }),
      transportes(push),
    );
    expect(r).toEqual({ sent: 1, retried: 0, dead: 0 });
    expect(sent).toHaveBeenCalledWith("d-push", "t-ExponentPushToken[aaa]");
  });

  it("RN-MOV-04: correo y push conviven en la misma tanda, cada uno por su transporte", async () => {
    const mailSend = vi.fn<MailTransport["send"]>(async () => "m");
    const pushSend = vi.fn<PushTransport["send"]>(async (m) =>
      m.to.map((token) => ({ token, status: "ok" as const, providerId: null })),
    );
    const r = await drainDeliveryQueue(
      gateway({
        claimDeliveries: async () => [
          entregaPush(),
          entregaPush({ delivery_id: "d-mail", channel: "email", push_tokens: null }),
        ],
      }),
      {
        mail: { send: mailSend },
        mailComposer: { compose: (d) => ({ to: d.recipient_email ?? "", subject: "s", body: "b" }) },
        push: { send: pushSend },
        pushComposer,
      },
    );
    expect(r.sent).toBe(2);
    expect(mailSend).toHaveBeenCalledTimes(1);
    expect(pushSend).toHaveBeenCalledTimes(1);
  });

  it("RN-MOV-05: un token que el proveedor da por inexistente se da de baja y no se reintenta", async () => {
    const revoke = vi.fn<QueueGateway["revokePushToken"]>(async () => true);
    const failed = vi.fn<QueueGateway["markDeliveryFailed"]>(async () => {});
    const push: PushTransport = {
      send: async (m) => m.to.map((token) => ({ token, status: "unregistered" as const })),
    };
    const r = await drainDeliveryQueue(
      gateway({ claimDeliveries: async () => [entregaPush()], revokePushToken: revoke, markDeliveryFailed: failed }),
      transportes(push),
    );
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenCalledWith("ExponentPushToken[aaa]", "provider_rejected");
    // Ningún teléfono vivo: muerta, no reprogramada.
    expect(r).toEqual({ sent: 0, retried: 0, dead: 1 });
    expect(failed.mock.calls[0][3]).toBe(true);
  });

  it("RN-MOV-05: si un teléfono recibe y otro ya no existe, la entrega es enviada y el muerto se cierra", async () => {
    const revoke = vi.fn<QueueGateway["revokePushToken"]>(async () => true);
    const sent = vi.fn<QueueGateway["markDeliverySent"]>(async () => {});
    const push: PushTransport = {
      send: async (m) => [
        { token: m.to[0], status: "unregistered" as const },
        { token: m.to[1], status: "ok" as const, providerId: "t-2" },
      ],
    };
    const r = await drainDeliveryQueue(
      gateway({ claimDeliveries: async () => [entregaPush()], revokePushToken: revoke, markDeliverySent: sent }),
      transportes(push),
    );
    expect(r.sent).toBe(1);
    expect(revoke).toHaveBeenCalledWith("ExponentPushToken[aaa]", "provider_rejected");
    expect(sent).toHaveBeenCalledWith("d-push", "t-2");
  });

  it("RN-NOT-05: un fallo del proveedor de push reprograma con espera creciente, como el correo", async () => {
    const failed = vi.fn<QueueGateway["markDeliveryFailed"]>(async () => {});
    const push: PushTransport = {
      send: async () => {
        throw new Error("Expo no responde");
      },
    };
    const r = await drainDeliveryQueue(
      gateway({ claimDeliveries: async () => [entregaPush()], markDeliveryFailed: failed }),
      transportes(push),
    );
    expect(r).toEqual({ sent: 0, retried: 1, dead: 0 });
    expect(failed.mock.calls[0][3]).toBe(false);
  });

  it("RN-MOV-04: sin transporte de push la entrega se reprograma, no se pierde ni se finge enviada", async () => {
    const failed = vi.fn<QueueGateway["markDeliveryFailed"]>(async () => {});
    const sent = vi.fn<QueueGateway["markDeliverySent"]>(async () => {});
    const r = await drainDeliveryQueue(
      gateway({ claimDeliveries: async () => [entregaPush()], markDeliveryFailed: failed, markDeliverySent: sent }),
      transportes(null),
    );
    expect(r.retried).toBe(1);
    expect(sent).not.toHaveBeenCalled();
  });

  it("CA-18: una entrega push sin ningún teléfono vigente muere en vez de reintentarse contra nada", async () => {
    const failed = vi.fn<QueueGateway["markDeliveryFailed"]>(async () => {});
    const r = await drainDeliveryQueue(
      gateway({ claimDeliveries: async () => [entregaPush({ push_tokens: [] })], markDeliveryFailed: failed }),
      transportes({ send: async () => [] }),
    );
    expect(r.dead).toBe(1);
    expect(failed.mock.calls[0][3]).toBe(true);
  });

  it("RN-MOV-04: `drainEmailQueue` (solo correo) no pierde una entrega push: la deja en cola", async () => {
    const failed = vi.fn<QueueGateway["markDeliveryFailed"]>(async () => {});
    const r = await drainEmailQueue(
      gateway({ claimDeliveries: async () => [entregaPush()], markDeliveryFailed: failed }),
      mailOk,
      mailComposer,
    );
    expect(r).toEqual({ sent: 0, retried: 0, dead: 1 });
  });
});

describe("RN-SLA-18 · el barrido mide contra el plazo congelado (decisión 61)", () => {
  it("RN-SLA-18 · un Premium+ con 48 h ya tiene aviso donde uno de 72 h todavía no", async () => {
    /*
      El fallo silencioso que evita esta regla: si el barrido midiera
      siempre contra las 72 h de la tabla, un Premium+ **no recibiría
      ningún aviso hasta pasarse de largo**, porque el 100 % de 72 h llega
      cuando las 48 reales hace rato que vencieron.

      El reloj contractual corre lunes 09:00–24:00 y martes a viernes
      enteros (RN-CLK-01/02), así que el martes a las 22:00 llevan
      consumidas 37 h laborables: el 77 % de 48 y el 51 % de 72.
    */
    const eventos = [{ event_type: "started" as const, occurred_at: LUNES_9.toISOString() }];
    const martes22 = new Date("2026-09-08T20:00:00Z");

    const cortoEmit = vi.fn<QueueGateway["emitSlaNotification"]>(async () => 1);
    await runSlaSweep(
      gateway({
        slaCounters: async () => [
          contador({ counter_kind: "t3", category: "small", execution_sla_hours: 48, events: eventos }),
        ],
        emitSlaNotification: cortoEmit,
      }),
      "espacio",
      martes22,
    );

    const normalEmit = vi.fn<QueueGateway["emitSlaNotification"]>(async () => 1);
    await runSlaSweep(
      gateway({
        slaCounters: async () => [
          contador({ counter_kind: "t3", category: "small", execution_sla_hours: null, events: eventos }),
        ],
        emitSlaNotification: normalEmit,
      }),
      "espacio",
      martes22,
    );

    expect(cortoEmit.mock.calls.map((c) => c[1])).toEqual(["t3_threshold_75"]);
    // El mismo trabajo, el mismo momento, el plazo de la tabla: todavía no
    // hay nada que avisar.
    expect(normalEmit).not.toHaveBeenCalled();
  });
});
