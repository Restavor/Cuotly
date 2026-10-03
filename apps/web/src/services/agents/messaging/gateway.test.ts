import { describe, expect, it } from "vitest";

import { createNoticeGateway, parseAutoReplyContext, parseClaimedNotice, type RpcClient } from "./gateway";

const ID = "11111111-1111-4111-8111-111111111111";

function raw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    notice_id: ID,
    attempt: 1,
    template: "confirmed",
    channel: "email",
    language: "es",
    recipient: "nuria@example.org",
    customer_name: "Nuria",
    date: "2026-09-26",
    time: "21:00",
    party_size: 4,
    link_token: "0123456789abcdef0123456789abcdef",
    restaurant: { name: "Casa Pepe", phone: "+34954000000", address: "Calle Sierpes 12", city: "Sevilla", email: "reservas@casapepe.es" },
    ...overrides,
  };
}

describe("decisión 155 · el aviso reclamado, tal como lo devuelve la base de datos", () => {
  it("decisión 155 · se lee entero", () => {
    expect(parseClaimedNotice(raw())).toEqual({
      noticeId: ID,
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
    });
  });

  it("decisión 155 · lo que no cuadra no se envía (plantilla, canal o idioma inventados, falta algo)", () => {
    expect(parseClaimedNotice(raw({ template: "inventada" }))).toBeNull();
    expect(parseClaimedNotice(raw({ channel: "paloma" }))).toBeNull();
    expect(parseClaimedNotice(raw({ language: "fr" }))).toBeNull();
    expect(parseClaimedNotice(raw({ recipient: null }))).toBeNull();
    expect(parseClaimedNotice(raw({ attempt: "1" }))).toBeNull();
    expect(parseClaimedNotice(raw({ link_token: undefined }))).toBeNull();
    expect(parseClaimedNotice(raw({ restaurant: { name: "Casa Pepe" } }))).toBeNull();
    expect(parseClaimedNotice(null)).toBeNull();
    expect(parseClaimedNotice([])).toBeNull();
  });

  it("decisión 164 · la dirección, la ciudad y el correo del restaurante pueden faltar", () => {
    const notice = parseClaimedNotice(raw({ restaurant: { name: "Casa Pepe", phone: "+34954000000", address: null, city: "", email: null } }));
    expect(notice?.restaurant).toEqual({ name: "Casa Pepe", phone: "+34954000000", address: null, city: null, email: null });
  });
});

describe("decisión 162 · el contexto de la respuesta automática", () => {
  it("decisión 162 · con restaurante conocido, su idioma y su teléfono", () => {
    expect(parseAutoReplyContext({ allowed: true, found: true, language: "en", restaurant_name: "Casa Pepe", restaurant_phone: "+34954000000" })).toEqual({
      allowed: true,
      found: true,
      language: "en",
      restaurant: { name: "Casa Pepe", phone: "+34954000000" },
    });
  });

  it("decisión 162 · sin restaurante conocido, el texto genérico; y no permitido, nada", () => {
    expect(parseAutoReplyContext({ allowed: true, found: false })).toEqual({ allowed: true, found: false, language: null, restaurant: null });
    expect(parseAutoReplyContext({ allowed: false })).toEqual({ allowed: false, found: false, language: null, restaurant: null });
    expect(parseAutoReplyContext(null)).toEqual({ allowed: false, found: false, language: null, restaurant: null });
    expect(parseAutoReplyContext({ allowed: true, found: true, language: "fr", restaurant_name: "X", restaurant_phone: "+34954000000" }).found).toBe(false);
  });
});

describe("decisión 155 · las llamadas del servidor a la base de datos", () => {
  function client(data: unknown, error: { message: string } | null = null) {
    const calls: { fn: string; args: Record<string, unknown> | undefined }[] = [];
    const db: RpcClient = {
      rpc(fn, args) {
        calls.push({ fn, args });
        return Promise.resolve({ data, error });
      },
    };
    return { db, calls };
  }

  it("decisión 155 · reclamar manda el restaurante, el tope y los límites de envío, y descarta lo ilegible", async () => {
    const { db, calls } = client([raw(), { basura: true }]);
    const claimed = await createNoticeGateway(db).claim("est-1", { limit: 10, allowlist: ["a@b.es"], enforceAllowlist: true, blockReserved: true });
    expect(claimed).toHaveLength(1);
    expect(calls[0]).toEqual({
      fn: "claim_reservation_notices",
      args: { p_establishment_id: "est-1", p_limit: 10, p_allowlist: ["a@b.es"], p_enforce_allowlist: true, p_block_reserved: true },
    });
  });

  it("decisión 155 · informar manda el intento vigente y el resultado, y devuelve si hubo respaldo", async () => {
    const { db, calls } = client({ outcome: "failed", fallback: true });
    const result = await createNoticeGateway(db).report({ noticeId: ID, attempt: 2, result: "undeliverable", provider: "meta", error: "meta_131026" });
    expect(result).toEqual({ outcome: "failed", fallback: true });
    expect(calls[0]).toEqual({
      fn: "report_reservation_notice",
      args: { p_notice_id: ID, p_attempt: 2, p_result: "undeliverable", p_provider: "meta", p_provider_message_id: null, p_error: "meta_131026" },
    });
  });

  it("decisión 155 · un suceso del proveedor manda el aviso o el proveedor con su identificador, y el precio", async () => {
    const { db, calls } = client({ outcome: "priced" });
    await createNoticeGateway(db).providerEvent({ noticeId: null, provider: "sms", providerMessageId: "SM1", event: "price", priceAmount: 0.075, priceCurrency: "USD" });
    expect(calls[0]).toEqual({
      fn: "reservation_notice_provider_event",
      args: { p_notice_id: null, p_provider: "sms", p_provider_message_id: "SM1", p_event: "price", p_price_amount: 0.075, p_price_currency: "USD", p_error: null },
    });
  });

  it("decisión 155 · los restaurantes con avisos y los precios pendientes se leen de las filas", async () => {
    expect(await createNoticeGateway(client([{ establishment_id: "a" }, { establishment_id: "b" }, { otra: 1 }]).db).dueEstablishments(50)).toEqual(["a", "b"]);
    expect(
      await createNoticeGateway(
        client([
          { notice_id: ID, provider: "sms", provider_message_id: "SM1" },
          { notice_id: ID },
        ]).db,
      ).pricePending(50),
    ).toEqual([{ noticeId: ID, provider: "sms", providerMessageId: "SM1" }]);
  });

  it("decisión 154 · el enlace del comensal y el límite de uso se llaman con el token y el cubo", async () => {
    const { db, calls } = client(true);
    const gateway = createNoticeGateway(db);
    expect(await gateway.rateLimitHit("cancel:7", 5, 60)).toBe(true);
    await gateway.customerView("abc");
    await gateway.customerCancel("abc");
    expect(calls.map((c) => c.fn)).toEqual(["reservation_rate_limit_hit", "reservation_customer_view", "reservation_customer_cancel"]);
    expect(calls[0]!.args).toEqual({ p_bucket: "cancel:7", p_max: 5, p_window_seconds: 60 });
    expect(await createNoticeGateway(client(false).db).rateLimitHit("cancel:7", 5, 60)).toBe(false);
  });

  it("decisión 155 · un error de la base de datos lanza, con el nombre de la función y sin datos del comensal", async () => {
    const { db } = client(null, { message: "connection refused" });
    await expect(createNoticeGateway(db).claim("est-1", { limit: 10, allowlist: [], enforceAllowlist: false, blockReserved: false })).rejects.toThrow(
      "claim_reservation_notices: connection refused",
    );
  });
});
