import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La página del comensal (AVI-05, maqueta `CancelarCliente`): cada estado dice lo que tiene que decir, en español y en
 * inglés. La base de datos y la acción de cancelar van simuladas: lo que se prueba es lo que ve quien abre el enlace.
 */
const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: rpcMock }) }));
vi.mock("./actions", () => ({ cancelByLinkAction: async () => undefined }));

import Page from "./page";

const TOKEN = "0123456789abcdef0123456789abcdef";

function view(overrides: Record<string, unknown> = {}, restaurant: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    found: true,
    status: "confirmed",
    cancel_reason: null,
    date: "2026-09-26",
    time: "21:00",
    starts_at: "2026-09-26T19:00:00+00:00",
    party_size: 2,
    customer_name: "Nuria Vidal",
    language: "es",
    service_status: "active",
    timezone: "Europe/Madrid",
    cancel_deadline: "2026-09-26T17:00:00+00:00",
    server_now: "2026-09-20T10:00:00+00:00",
    can_cancel: true,
    restaurant: { name: "Casa Pepe", city: "Sevilla", address: "Calle Sierpes 12", phone: "+34954000000", ...restaurant },
    ...overrides,
  };
}

async function render(data: unknown, query: { lang?: string; error?: string } = {}, token: string = TOKEN, error: Error | null = null): Promise<string> {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue(error ? { data: null, error: { message: error.message } } : { data, error: null });
  const element = await Page({ params: Promise.resolve({ token }), searchParams: Promise.resolve(query) });
  return renderToStaticMarkup(element);
}

beforeEach(() => rpcMock.mockReset());

describe("AVI-05 · la página del enlace del comensal", () => {
  it("AVI-05 · una reserva confirmada dentro de plazo: «Tu reserva», la tarjeta, el botón y el plazo, como la maqueta", async () => {
    const html = await render(view());
    expect(html).toContain("Casa Pepe · Sevilla");
    expect(html).toContain("<h1");
    expect(html).toContain("Tu reserva");
    expect(html).toContain("Sábado 26 de septiembre · 21:00");
    expect(html).toContain("2 personas · a nombre de Nuria Vidal");
    expect(html).toContain("Cancelar mi reserva");
    expect(html).toContain("Puedes cancelar aquí hasta el sábado 26 de septiembre a las 19:00 (2 h antes).");
    expect(html).toContain("¿Quieres cambiar la hora o las personas? Llama al");
    expect(html).toContain('href="tel:+34954000000"');
    expect(html).toContain('name="token"');
    expect(html).toContain(TOKEN);
  });

  it("AVI-05 · tiene `<main>`, idioma de la reserva, y no usa el armazón de Restavor (ni menú ni sesión)", async () => {
    const html = await render(view());
    expect(html).toContain("<main");
    expect(html).toContain('lang="es"');
    expect(html).not.toContain("<nav aria-label=\"Navegación");
  });

  it("AVI-05 · el selector ES/EN lleva a la misma página en el otro idioma, y marca el actual", async () => {
    const html = await render(view());
    expect(html).toContain(`href="/c/${TOKEN}?lang=en"`);
    expect(html).toContain(`href="/c/${TOKEN}?lang=es"`);
    expect(html).toMatch(/aria-current="true"[^>]*>ES</);
  });

  it("AVI-05 · en inglés: el idioma del enlace manda sobre el de la reserva, y la fecha va en inglés", async () => {
    const html = await render(view(), { lang: "en" });
    expect(html).toContain('lang="en"');
    expect(html).toContain("Your booking");
    expect(html).toContain("Saturday 26 September · 21:00");
    expect(html).toContain("2 people · under the name of Nuria Vidal");
    expect(html).toContain("Cancel my booking");
    expect(html).toContain("You can cancel here until Saturday 26 September at 19:00 (2 h before).");
    expect(html).toContain("Want to change the time or the number of people? Call");
  });

  it("AVI-05 · sin `?lang`, el idioma de la reserva (una reserva en inglés sale en inglés)", async () => {
    const html = await render(view({ language: "en" }));
    expect(html).toContain("Your booking");
  });

  it("AVI-05 · una solicitud de grupo pendiente dice que no está confirmada y deja cancelar la solicitud", async () => {
    const html = await render(view({ status: "pending", party_size: 12 }));
    expect(html).toContain("Cancelar mi solicitud");
    expect(html).toContain("Todavía no es una reserva confirmada");
    expect(html).toContain("12 personas");
  });

  it("RN-RES-08 · pasado el plazo: «Ya no se puede cancelar desde aquí. Llama a…», sin botón de cancelar", async () => {
    const html = await render(view({ can_cancel: false }));
    expect(html).toContain("Ya no se puede cancelar desde aquí");
    expect(html).toContain("Llama a Casa Pepe:");
    expect(html).toContain('href="tel:+34954000000"');
    expect(html).not.toContain("Cancelar mi reserva");
    expect(html).not.toContain('name="token"');
  });

  it("decisión 158 · con Reservas cerrada, lo mismo: llama al restaurante", async () => {
    const html = await render(view({ service_status: "closed", can_cancel: false }));
    expect(html).toContain("Ya no se puede cancelar desde aquí");
    expect(html).not.toContain("Cancelar mi reserva");
  });

  it("AVI-05 · cancelada desde el enlace: «Reserva cancelada. Gracias por avisar. El restaurante ya lo sabe.»", async () => {
    const html = await render(view({ status: "cancelled", cancel_reason: "customer_link", can_cancel: false }));
    expect(html).toContain("Reserva cancelada");
    expect(html).toContain("Gracias por avisar. El restaurante ya lo sabe.");
    expect(html).not.toContain('name="token"');
  });

  it("AVI-05 · cancelada por el restaurante: se dice y se da su teléfono por si es un error", async () => {
    const html = await render(view({ status: "cancelled", cancel_reason: "customer", can_cancel: false }));
    expect(html).toContain("Esta reserva está cancelada.");
    expect(html).toContain("Si es un error, llama a Casa Pepe:");
  });

  it("AVI-05 · un grupo rechazado dice que el restaurante no pudo atender la solicitud", async () => {
    const html = await render(view({ status: "cancelled", cancel_reason: "rejected", can_cancel: false }));
    expect(html).toContain("El restaurante no ha podido atender tu solicitud");
    expect(html).toContain("Para buscar otra fecha, llama a Casa Pepe:");
  });

  it("AVI-05 · una reserva que ya pasó no se cancela", async () => {
    const html = await render(view({ server_now: "2026-09-27T10:00:00+00:00", can_cancel: false }));
    expect(html).toContain("Esta reserva ya ha pasado");
  });

  it("AVI-05 · un enlace que no vale (mal formado, desconocido o de plataforma) lo dice sin enseñar nada más", async () => {
    for (const token of ["enlace-no-valido", TOKEN.toUpperCase(), TOKEN.slice(1)]) {
      const html = await render({ found: true }, {}, token);
      expect(html).toContain("Este enlace no es válido");
      expect(rpcMock).not.toHaveBeenCalled();
    }
    const unknown = await render({ found: false });
    expect(unknown).toContain("Este enlace no es válido");
    expect(unknown).not.toContain("Cancelar");
  });

  it("AVI-05 · si la base de datos falla, lo dice con calma (no «enlace no válido») y sin detalles", async () => {
    const html = await render(null, {}, TOKEN, new Error("connection refused: 10.0.0.5"));
    expect(html).toContain("No hemos podido cargar tu reserva ahora mismo");
    expect(html).not.toContain("10.0.0.5");
    expect(html).not.toContain("Este enlace no es válido");
  });

  it("AVI-05 · tras un intento fallido de cancelar se avisa, y demasiados intentos también", async () => {
    expect(await render(view(), { error: "failed" })).toContain("No hemos podido cancelar la reserva");
    expect(await render(view(), { error: "rate" })).toContain("Demasiados intentos seguidos");
    expect(await render(view(), { lang: "en", error: "rate" })).toContain("Too many attempts in a row");
  });

  it("RN-RES-12 · la página no enseña el teléfono ni el correo del comensal, ni el token entero de la reserva", async () => {
    const html = await render(view({ cancel_token: "x".repeat(64), email: "nuria@example.org", phone_e164: "+34600000001" }));
    expect(html).not.toContain("nuria@example.org");
    expect(html).not.toContain("+34600000001");
    expect(html).not.toContain("x".repeat(64));
  });
});
