import { describe, expect, it } from "vitest";

import { parseFakeNotices, renderFakeMessage } from "./fake-notices";

const ID = "11111111-1111-4111-8111-111111111111";

function raw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    notice_id: ID,
    establishment_id: "22222222-2222-4222-8222-222222222222",
    establishment_name: "Casa Pepe",
    template: "confirmed",
    channel: "email",
    language: "es",
    status: "sent",
    attempts: 1,
    cost_micros: null,
    price_final: false,
    recipient: "nuria@example.test",
    customer_name: "Nuria",
    date: "2026-09-26",
    time: "21:00",
    party_size: 4,
    link_token: "0123456789abcdef0123456789abcdef",
    created_at: "2026-10-03T10:00:00+00:00",
    restaurant: { name: "Casa Pepe", phone: "+34954000000", address: "Calle Sierpes 12", email: "reservas@casapepe.test" },
    ...overrides,
  };
}

describe("decisión 159 · los mensajes de prueba, redactados con los textos de verdad", () => {
  it("decisión 159 · se leen las filas válidas y se descartan las que no cuadran", () => {
    const rows = parseFakeNotices([raw(), raw({ channel: "paloma" }), { basura: 1 }, raw({ status: "inventado" }), raw({ party_size: "4" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ noticeId: ID, channel: "email", template: "confirmed", partySize: 4, recipient: "nuria@example.test" });
    expect(parseFakeNotices(null)).toEqual([]);
  });

  it("decisión 159 · un correo se redacta con asunto, texto y el enlace de cancelar", () => {
    const [notice] = parseFakeNotices([raw()]);
    const message = renderFakeMessage(notice!, "https://restavor.com");
    expect(message.subject).toBe("Tu reserva en Casa Pepe está confirmada");
    expect(message.body).toContain("Tu reserva está confirmada.");
    expect(message.link).toBe("https://restavor.com/c/0123456789abcdef0123456789abcdef");
  });

  it("decisión 159 · un WhatsApp sin botón (cancelada) no lleva enlace; con botón (confirmada), sí", () => {
    const confirmed = renderFakeMessage(parseFakeNotices([raw({ channel: "whatsapp" })])[0]!, "https://restavor.com");
    expect(confirmed.subject).toBeNull();
    expect(confirmed.body).toBe(
      "Hola, Nuria. Tu reserva en Casa Pepe está confirmada: sábado 26 de septiembre · 21:00 · 4 personas. Calle Sierpes 12. ¿Algún cambio? Llama al +34954000000.",
    );
    expect(confirmed.link).toContain("/c/");
    expect(renderFakeMessage(parseFakeNotices([raw({ channel: "whatsapp", template: "cancelled" })])[0]!, "https://restavor.com").link).toBeNull();
  });

  it("decisión 159 · un SMS sale sin tildes y con el enlace", () => {
    const message = renderFakeMessage(parseFakeNotices([raw({ channel: "sms", language: "en" })])[0]!, "https://restavor.com");
    expect(message.body).toBe("Casa Pepe: booking confirmed Sat 26/09 21:00, 4 ppl. Changes: +34954000000. Cancel: https://restavor.com/c/0123456789abcdef0123456789abcdef");
    expect(message.link).not.toBeNull();
  });
});
