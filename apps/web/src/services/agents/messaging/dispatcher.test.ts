import { describe, expect, it } from "vitest";

import type { ClaimedNotice, NoticeGateway, ProviderEvent, ReportResult } from "./gateway";
import { checkSmsPrices, dispatchAllDue, dispatchEstablishmentNotices, MAX_ROUNDS, type DispatchDeps } from "./dispatcher";
import { createFakeProviders } from "./fake";
import type { EmailMessage, MessagingProviders, SendResult, SmsMessage, WhatsAppTemplateMessage } from "./provider";
import { fakeCaseOf } from "./fake";

const SITE = "https://restavor.com";

function notice(overrides: Partial<ClaimedNotice> = {}): ClaimedNotice {
  return {
    noticeId: "11111111-1111-4111-8111-111111111111",
    attempt: 1,
    template: "confirmed",
    channel: "email",
    language: "es",
    recipient: "nuria@example.org",
    customerName: "Nuria",
    date: "2026-09-26",
    time: "21:00",
    partySize: 4,
    linkToken: "0123456789abcdef0123456789abcdef",
    restaurant: { name: "Casa Pepe", phone: "+34954000000", address: "Calle Sierpes 12", city: "Sevilla", email: "reservas@casapepe.es" },
    ...overrides,
  };
}

interface Report {
  noticeId: string;
  attempt: number;
  result: ReportResult;
  provider?: string;
  providerMessageId?: string;
  error?: string;
}

/** Una base de datos de mentira: reparte avisos por pasadas y apunta los informes. */
function gateway(rounds: ClaimedNotice[][], options: { failReport?: boolean; fallbackFor?: string[] } = {}) {
  const reports: Report[] = [];
  const events: { event: ProviderEvent; noticeId: string | null; priceAmount?: number; priceCurrency?: string }[] = [];
  const claims: { establishmentId: string; allowlist: readonly string[]; enforceAllowlist: boolean; blockReserved: boolean }[] = [];
  let round = 0;
  const gw: NoticeGateway = {
    async dueEstablishments() {
      return ["est-1", "est-2"];
    },
    async claim(establishmentId, options) {
      claims.push({ establishmentId, allowlist: options.allowlist, enforceAllowlist: options.enforceAllowlist, blockReserved: options.blockReserved });
      return rounds[round++] ?? [];
    },
    async report(input) {
      if (options.failReport) throw new Error("base de datos caída");
      reports.push({ ...input });
      return { outcome: input.result === "sent" ? "sent" : "failed", fallback: input.result === "undeliverable" && (options.fallbackFor ?? []).includes(input.noticeId) };
    },
    async providerEvent(input) {
      events.push({ event: input.event, noticeId: input.noticeId, ...(input.priceAmount !== undefined ? { priceAmount: input.priceAmount } : {}), ...(input.priceCurrency !== undefined ? { priceCurrency: input.priceCurrency } : {}) });
      return { outcome: input.event === "price" ? "priced" : "delivered" };
    },
    async pricePending() {
      return [{ noticeId: "n-1", provider: "sms", providerMessageId: "SM1" }, { noticeId: "n-2", provider: "sms", providerMessageId: "SM2" }, { noticeId: "n-3", provider: "sms", providerMessageId: "SM3" }];
    },
    async autoreplyContext() {
      return { allowed: false, found: false, language: null, restaurant: null };
    },
    async customerView() {
      return null;
    },
    async customerCancel() {
      return null;
    },
    async rateLimitHit() {
      return true;
    },
  };
  return { gw, reports, events, claims };
}

function deps(gw: NoticeGateway, providers: MessagingProviders = createFakeProviders(), overrides: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    gateway: gw,
    providers,
    policy: { enforceAllowlist: false, allowlist: [], blockReservedDomains: false },
    siteUrl: SITE,
    log: () => undefined,
    ...overrides,
  };
}

/** Proveedores que apuntan lo que se les pide y devuelven lo que se les diga. */
function recording(result: SendResult | ((channel: string) => SendResult) = { ok: true, providerMessageId: "id-1" }, configured = true) {
  const sent: { channel: string; message: EmailMessage | WhatsAppTemplateMessage | SmsMessage }[] = [];
  const answer = (channel: string) => (typeof result === "function" ? result(channel) : result);
  const providers: MessagingProviders = {
    mode: "real",
    email: { name: "resend", isConfigured: () => configured, async send(message) { sent.push({ channel: "email", message }); return answer("email"); } },
    whatsapp: {
      name: "meta",
      isConfigured: () => configured,
      async sendTemplate(message) { sent.push({ channel: "whatsapp", message }); return answer("whatsapp"); },
      async sendText() { return { ok: true, providerMessageId: "t" }; },
    },
    sms: {
      name: "sms",
      isConfigured: () => configured,
      async send(message) { sent.push({ channel: "sms", message }); return answer("sms"); },
      async fetchPrice(id) { return id === "SM1" ? { amount: 0.075, currency: "USD" } : id === "SM2" ? null : "error"; },
    },
  };
  return { providers, sent };
}

describe("AVI-01 · el motor de avisos: reclamar, redactar, enviar e informar", () => {
  it("AVI-01 · un correo se redacta con sus textos, se envía una vez y se informa «enviado» con el proveedor y su identificador", async () => {
    const { gw, reports } = gateway([[notice()]]);
    const { providers, sent } = recording({ ok: true, providerMessageId: "re_1" });
    const summary = await dispatchEstablishmentNotices(deps(gw, providers), "est-1");
    expect(summary).toEqual({ claimed: 1, sent: 1, retried: 0, failed: 0, fallbacks: 0 });
    expect(sent).toHaveLength(1);
    const message = sent[0]!.message as EmailMessage;
    expect(message.subject).toBe("Tu reserva en Casa Pepe está confirmada");
    expect(message.text).toContain("https://restavor.com/c/0123456789abcdef0123456789abcdef");
    expect(message.senderName).toBe("Casa Pepe");
    expect(message.replyTo).toBe("reservas@casapepe.es");
    expect(message.to).toBe("nuria@example.org");
    expect(reports).toEqual([{ noticeId: notice().noticeId, attempt: 1, result: "sent", provider: "resend", providerMessageId: "re_1" }]);
  });

  it("AVI-03 · un WhatsApp lleva la plantilla, sus variables y el botón con el token", async () => {
    const { gw } = gateway([[notice({ channel: "whatsapp", recipient: "+34600000001" })]]);
    const { providers, sent } = recording();
    await dispatchEstablishmentNotices(deps(gw, providers), "est-1");
    const message = sent[0]!.message as WhatsAppTemplateMessage;
    expect(message.templateName).toBe("restavor_confirmed");
    expect(message.language).toBe("es");
    expect(message.to).toBe("+34600000001");
    expect(message.variables).toHaveLength(5);
    expect(message.buttonSuffix).toBe("0123456789abcdef0123456789abcdef");
  });

  it("AVI-03 · un WhatsApp de «cancelada» no lleva botón", async () => {
    const { gw } = gateway([[notice({ channel: "whatsapp", template: "cancelled", recipient: "+34600000001" })]]);
    const { providers, sent } = recording();
    await dispatchEstablishmentNotices(deps(gw, providers), "est-1");
    expect((sent[0]!.message as WhatsAppTemplateMessage).buttonSuffix).toBeNull();
  });

  it("AVI-04 · un SMS va sin tildes y con el enlace", async () => {
    const { gw } = gateway([[notice({ channel: "sms", recipient: "+34600000001", customerName: "Ñuria" })]]);
    const { providers, sent } = recording();
    await dispatchEstablishmentNotices(deps(gw, providers), "est-1");
    const message = sent[0]!.message as SmsMessage;
    expect(message.text).toBe("Casa Pepe: reserva confirmada sab 26/09 21:00, 4 pers. Cambios: +34954000000. Cancelar: https://restavor.com/c/0123456789abcdef0123456789abcdef");
    expect(message.text.length).toBeLessThanOrEqual(160);
  });

  it("AVI-04 · un SMS que no cabe en 160 caracteres ni acortando no se parte: falla con un código", async () => {
    const { gw, reports } = gateway([[notice({ channel: "sms", recipient: "+34600000001" })]]);
    const { providers, sent } = recording();
    await dispatchEstablishmentNotices(deps(gw, providers, { siteUrl: `https://${"a".repeat(140)}.example` }), "est-1");
    expect(sent).toHaveLength(0);
    expect(reports[0]).toMatchObject({ result: "failed", error: "sms_too_long" });
  });

  it("decisión 155 · un fallo temporal se informa como «reintentar» con su código; uno definitivo, como «fallido»", async () => {
    const temporary = recording({ ok: false, kind: "temporary", code: "meta_131000" });
    const a = gateway([[notice({ channel: "whatsapp", recipient: "+34600000001" })]]);
    expect(await dispatchEstablishmentNotices(deps(a.gw, temporary.providers), "est-1")).toMatchObject({ retried: 1, failed: 0 });
    expect(a.reports[0]).toMatchObject({ result: "retry", error: "meta_131000" });

    const permanent = recording({ ok: false, kind: "permanent", code: "resend_http_422" });
    const b = gateway([[notice()]]);
    expect(await dispatchEstablishmentNotices(deps(b.gw, permanent.providers), "est-1")).toMatchObject({ retried: 0, failed: 1 });
    expect(b.reports[0]).toMatchObject({ result: "failed", error: "resend_http_422" });
  });

  it("decisión 157 · un WhatsApp no entregable se informa así y se reclama otra vez para que su SMS salga en la misma pasada", async () => {
    const wa = notice({ channel: "whatsapp", recipient: "+34600000404" });
    const sms = notice({ noticeId: "22222222-2222-4222-8222-222222222222", channel: "sms", recipient: "+34600000405" });
    const { gw, reports, claims } = gateway([[wa], [sms], []], { fallbackFor: [wa.noticeId] });
    const summary = await dispatchEstablishmentNotices(deps(gw, createFakeProviders()), "est-1");
    expect(reports.map((r) => `${r.result}:${r.noticeId === wa.noticeId ? "wa" : "sms"}`)).toEqual(["undeliverable:wa", "undeliverable:sms"]);
    expect(summary.fallbacks).toBe(1);
    expect(claims).toHaveLength(2);
  });

  it("decisión 155 · el proveedor sin configurar marca el aviso fallido con un incidente (`config`), nunca lo deja esperando ni llama al proveedor", async () => {
    const { gw, reports } = gateway([[notice(), notice({ noticeId: "33333333-3333-4333-8333-333333333333", channel: "whatsapp", recipient: "+34600000001" })]]);
    const { providers, sent } = recording({ ok: true, providerMessageId: "x" }, false);
    await dispatchEstablishmentNotices(deps(gw, providers), "est-1");
    expect(sent).toHaveLength(0);
    expect(reports.map((r) => `${r.result}:${r.error}`)).toEqual(["config:resend_not_configured", "config:meta_not_configured"]);
  });

  it("decisión 154 · sin la dirección pública del sitio no se puede escribir el enlace de cancelar: de configuración", async () => {
    const { gw, reports } = gateway([[notice(), notice({ noticeId: "33333333-3333-4333-8333-333333333333", template: "cancelled" })]]);
    const { providers, sent } = recording();
    await dispatchEstablishmentNotices(deps(gw, providers, { siteUrl: "" }), "est-1");
    expect(reports[0]).toMatchObject({ result: "config", error: "no_site_url" });
    // Un aviso sin enlace de cancelar sale igual.
    expect(reports[1]).toMatchObject({ result: "sent" });
    expect(sent).toHaveLength(1);
  });

  it("decisión 165 · los límites del entorno llegan al reclamo (lista permitida y dominios reservados)", async () => {
    const { gw, claims } = gateway([[]]);
    await dispatchEstablishmentNotices(deps(gw, createFakeProviders(), { policy: { enforceAllowlist: true, allowlist: ["a@b.es"], blockReservedDomains: true } }), "est-9");
    expect(claims[0]).toEqual({ establishmentId: "est-9", allowlist: ["a@b.es"], enforceAllowlist: true, blockReserved: true });
  });

  it("decisión 155 · si la base de datos no contesta al informar, no lanza: el arriendo devuelve el aviso a la cola", async () => {
    const { gw } = gateway([[notice()]], { failReport: true });
    const summary = await dispatchEstablishmentNotices(deps(gw, recording().providers), "est-1");
    expect(summary).toMatchObject({ claimed: 1, retried: 1 });
  });

  it("decisión 155 · si no se pueden reclamar avisos, no lanza y lo anota", async () => {
    const logs: string[] = [];
    const gw: NoticeGateway = { ...gateway([]).gw, claim: async () => { throw new Error("connection refused"); } };
    expect(await dispatchEstablishmentNotices(deps(gw, createFakeProviders(), { log: (m) => logs.push(m) }), "est-1")).toMatchObject({ claimed: 0 });
    expect(logs[0]).toContain("connection refused");
  });

  it("decisión 155 · sin avisos que tocar no se hace nada, y con un lote entero se vuelve a reclamar (como mucho `MAX_ROUNDS` pasadas)", async () => {
    expect((await dispatchEstablishmentNotices(deps(gateway([[]]).gw), "est-1")).claimed).toBe(0);
    const full = Array.from({ length: 10 }, (_, i) => notice({ noticeId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}` }));
    const g = gateway(Array.from({ length: 20 }, () => full));
    await dispatchEstablishmentNotices(deps(g.gw), "est-1");
    expect(g.claims).toHaveLength(MAX_ROUNDS);
  });

  it("decisión 159 · con el proveedor falso, los casos por teléfono: `…0404` pasa a SMS y `…0500` se reintenta", async () => {
    expect(fakeCaseOf("+34600000404")).toBe("no_whatsapp");
    const g = gateway([[notice({ channel: "whatsapp", recipient: "+34600000500", attempt: 1 })]]);
    await dispatchEstablishmentNotices(deps(g.gw, createFakeProviders()), "est-1");
    expect(g.reports[0]).toMatchObject({ result: "retry", error: "meta_131000" });
    const h = gateway([[notice({ channel: "whatsapp", recipient: "+34600000500", attempt: 3 })]]);
    await dispatchEstablishmentNotices(deps(h.gw, createFakeProviders()), "est-1");
    expect(h.reports[0]).toMatchObject({ result: "sent", provider: "fake" });
  });
});

describe("AVI-06 · la tarea de cada minuto y el precio real del SMS", () => {
  it("AVI-06 · recorre los restaurantes con avisos y luego consulta los precios pendientes", async () => {
    const g = gateway([[notice()], [], []]);
    const summary = await dispatchAllDue(deps(g.gw, recording().providers));
    expect(summary.establishments).toBe(2);
    expect(summary.sent).toBe(1);
    expect(summary.prices).toEqual({ checked: 3, priced: 1 });
  });

  it("AVI-06 · el precio que el proveedor ya sabe se cuenta a la base de datos con su moneda; el que aún no sabe, o falla, se deja", async () => {
    const g = gateway([]);
    const result = await checkSmsPrices(deps(g.gw, recording().providers));
    expect(result).toEqual({ checked: 3, priced: 1 });
    expect(g.events).toEqual([{ event: "price", noticeId: "n-1", priceAmount: 0.075, priceCurrency: "USD" }]);
  });

  it("AVI-06 · si la base de datos no contesta, no lanza", async () => {
    const gw: NoticeGateway = { ...gateway([]).gw, pricePending: async () => { throw new Error("caída"); } };
    expect(await checkSmsPrices(deps(gw, recording().providers))).toEqual({ checked: 0, priced: 0 });
  });
});

describe("AVI-01 · el presupuesto de tiempo de la tarea de cada minuto (decisión 155)", () => {
  it("AVI-01 · pasada la hora límite no se reclama nada más ni se consultan precios", async () => {
    const g = gateway([[notice()]]);
    const summary = await dispatchAllDue(deps(g.gw, recording().providers, { deadline: 1_000, now: () => 2_000 }));
    expect(g.claims).toHaveLength(0);
    expect(summary.claimed).toBe(0);
    expect(summary.prices.checked).toBe(0);
  });

  it("AVI-01 · lo ya reclamado cuando se acaba el tiempo se aplaza con el reintento normal, sin llamar al proveedor", async () => {
    const first = notice();
    const second = notice({ noticeId: "22222222-2222-4222-8222-222222222222" });
    const g = gateway([[first, second]]);
    const { providers, sent } = recording();
    let clock = 0;
    // El reloj salta tras el primer envío: el segundo ya no tiene tiempo.
    const wrapped: MessagingProviders = {
      ...providers,
      email: {
        ...providers.email,
        async send(message) {
          const result = await providers.email.send(message);
          clock = 10_000;
          return result;
        },
      },
    };
    const summary = await dispatchEstablishmentNotices(deps(g.gw, wrapped, { deadline: 5_000, now: () => clock }), "est-1");
    expect(sent).toHaveLength(1);
    expect(g.reports.map((r) => `${r.result}:${r.error ?? ""}`)).toEqual(["sent:", "retry:deferred"]);
    expect(summary).toMatchObject({ sent: 1, retried: 1 });
  });

  it("AVI-01 · sin hora límite (el primer intento tras guardar) no se aplaza nada", async () => {
    const g = gateway([[notice(), notice({ noticeId: "22222222-2222-4222-8222-222222222222" })]]);
    const summary = await dispatchEstablishmentNotices(deps(g.gw, recording().providers), "est-1");
    expect(summary.sent).toBe(2);
  });
});
