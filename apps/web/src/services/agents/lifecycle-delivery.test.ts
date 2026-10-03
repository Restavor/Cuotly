import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Decisiones 99 y 137 · lo que sale al momento tras aprobar o barrer: el push de todos los avisos y el correo de
 * los dos importantes, con los datos de pago leídos antes de redactar. Nunca lanza.
 */
const rpcMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());
const emailMock = vi.hoisted(() => vi.fn());
const composerMock = vi.hoisted(() => vi.fn(() => ({ compose: () => null })));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: rpcMock }) }));
vi.mock("../queue-runner", () => ({ sendPushNow: pushMock, sendEmailNow: emailMock }));
vi.mock("../queue-gateway", () => ({
  createSupabaseQueueGateway: () => ({}),
  createExpoPushTransport: () => ({ send: async () => [] }),
  createPushComposer: () => ({ compose: () => null }),
  createResendTransport: () => ({ send: async () => null }),
  createMailComposer: composerMock,
}));

import { deliverNoticesNow, establishmentOfKey } from "./lifecycle-delivery";

const EST = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  rpcMock.mockReset();
  pushMock.mockReset();
  emailMock.mockReset();
  composerMock.mockClear();
  emailMock.mockResolvedValue({ sent: 1, retried: 0, dead: 0, blockedBy: null });
  rpcMock.mockResolvedValue({
    data: [
      {
        charge_id: "c1", concept: "Mensualidad", reference: "Reservas Casa Sol 2026-10", base_cents: 4800, tax_cents: 1008,
        total_cents: 5808, outstanding_cents: 5808, due_at: "2026-10-10T08:00:00Z", period_start: "2026-10-03T08:00:00Z",
        period_end: "2026-11-03T08:00:00Z", iban: "ES9121000418450200051332", bizum_phone: null, payment_note: null, payee_name: "Restavor Pruebas S.L.",
      },
    ],
    error: null,
  });
});

describe("Decisión 137 · avisos al momento de Reservas", () => {
  it("Decisión 137 · el push sale siempre; el correo, solo de las claves que se piden, con los datos de pago leídos", async () => {
    await deliverNoticesNow({
      pushKeys: ["a:1", "b:2"],
      emailKeys: ["b:2"],
      establishmentIds: [EST, EST],
    });
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0]?.[2]).toEqual(["a:1", "b:2"]);
    expect(emailMock.mock.calls[0]?.[2]).toEqual(["b:2"]);
    // Se leen una sola vez por restaurante y llegan al redactor.
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("reservation_payment_info", { p_establishment_id: EST });
    const extras = (composerMock.mock.calls[0] as unknown as [string, { paymentByEstablishment: Map<string, { iban: string }> }])[1];
    expect(extras.paymentByEstablishment.get(EST)?.iban).toBe("ES9121000418450200051332");
  });

  it("Decisión 137 · sin correos que mandar no lee los datos de pago", async () => {
    await deliverNoticesNow({ pushKeys: ["a:1"], emailKeys: [], establishmentIds: [] });
    expect(emailMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("Decisión 137 · sin nada que mandar, no toca nada", async () => {
    await deliverNoticesNow({ pushKeys: [], emailKeys: [], establishmentIds: [] });
    expect(pushMock).not.toHaveBeenCalled();
    expect(emailMock).not.toHaveBeenCalled();
  });

  it("Decisión 137 · si el envío falla, no lanza: el aviso queda en la cola de siempre", async () => {
    pushMock.mockRejectedValue(new Error("Expo caído"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(deliverNoticesNow({ pushKeys: ["a:1"], emailKeys: [], establishmentIds: [] })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("Decisión 137 · de qué restaurante habla una clave de aviso del barrido", () => {
    expect(establishmentOfKey(`reservations_paused:${EST}:1759000000`)).toBe(EST);
    expect(establishmentOfKey("reservation_service_approved:no-es-un-uuid")).toBeNull();
    expect(establishmentOfKey("sin-dos-puntos")).toBeNull();
  });
});
