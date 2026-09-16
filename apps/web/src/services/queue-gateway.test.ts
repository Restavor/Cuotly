import { describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";
import { EXPO_PUSH_ENDPOINT, createExpoPushTransport, createPushComposer } from "./queue-gateway";
import type { DeliveryRow } from "./queue-runner";

function entrega(over: Partial<DeliveryRow> = {}): DeliveryRow {
  return {
    delivery_id: "d1",
    notification_id: "n1",
    attempts: 1,
    channel: "push",
    recipient_email: "ana@example.com",
    push_tokens: ["ExponentPushToken[a]"],
    event_type: "job_published",
    audience: "staff",
    deep_link: "/espacios/restavor/trabajos/1",
    space_name: "Restavor",
    ...over,
  };
}

describe("RN-MOV-04 · el push dice el evento y el espacio, y nada más", () => {
  it("compone el título con el nombre del evento del catálogo y el cuerpo con el espacio", () => {
    const m = createPushComposer().compose(entrega());
    expect(m).not.toBeNull();
    expect(m?.title).toBe(es.notifications.events.job_published);
    expect(m?.body).toContain("Restavor");
    expect(m?.deepLink).toBe("/espacios/restavor/trabajos/1");
    expect(m?.to).toEqual(["ExponentPushToken[a]"]);
  });

  it("no lleva el restaurante, ninguna cifra ni quién: el título es el nombre del catálogo, tal cual, y el cuerpo solo el espacio", () => {
    // El nombre de catálogo de un umbral lleva su porcentaje porque ES el
    // nombre del evento; lo que no puede llevar el push es nada de la fila:
    // ni el restaurante, ni el importe, ni el enlace en el texto.
    const m = createPushComposer().compose(entrega({ event_type: "consumption_threshold_80" }));
    expect(m?.title).toBe(es.notifications.events.consumption_threshold_80);
    expect(m?.body).toBe(es.notifications.push.body("Restavor"));
    expect(m?.body).not.toMatch(/\d/);
    expect(`${m?.title} ${m?.body}`).not.toContain("/espacios/");
  });

  it("sin teléfonos vigentes no hay mensaje", () => {
    expect(createPushComposer().compose(entrega({ push_tokens: [] }))).toBeNull();
    expect(createPushComposer().compose(entrega({ push_tokens: null }))).toBeNull();
  });
});

describe("RN-MOV-05 · el transporte de Expo traduce los tickets", () => {
  function fetchQueResponde(data: unknown, status = 200) {
    return vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ data }), { status, headers: { "Content-Type": "application/json" } }),
    );
  }

  const mensaje = {
    to: ["ExponentPushToken[a]", "ExponentPushToken[b]"],
    title: "Trabajo publicado",
    body: "Espacio: Restavor",
    deepLink: "/espacios/restavor/trabajos/1",
  };

  it("un ticket ok por token, con el identificador del proveedor", async () => {
    const fetchImpl = fetchQueResponde([
      { status: "ok", id: "t-1" },
      { status: "ok", id: "t-2" },
    ]);
    const tickets = await createExpoPushTransport(undefined, fetchImpl).send(mensaje);
    expect(tickets).toEqual([
      { token: "ExponentPushToken[a]", status: "ok", providerId: "t-1" },
      { token: "ExponentPushToken[b]", status: "ok", providerId: "t-2" },
    ]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(EXPO_PUSH_ENDPOINT);
    const cuerpo = JSON.parse(String(init?.body)) as { to: string; data: { deepLink: string } }[];
    expect(cuerpo.map((m) => m.to)).toEqual(mensaje.to);
    expect(cuerpo[0].data.deepLink).toBe(mensaje.deepLink);
  });

  it("`DeviceNotRegistered` es el único error que se traduce a baja del teléfono", async () => {
    const fetchImpl = fetchQueResponde([
      { status: "error", message: "no existe", details: { error: "DeviceNotRegistered" } },
      { status: "error", message: "demasiados", details: { error: "MessageRateExceeded" } },
    ]);
    const tickets = await createExpoPushTransport(undefined, fetchImpl).send(mensaje);
    expect(tickets[0]).toEqual({ token: "ExponentPushToken[a]", status: "unregistered" });
    expect(tickets[1]).toEqual({ token: "ExponentPushToken[b]", status: "error", message: "demasiados" });
  });

  it("si el servicio entero no responde, lanza: la entrega se reintenta con espera creciente", async () => {
    const fetchImpl = fetchQueResponde([], 503);
    await expect(createExpoPushTransport(undefined, fetchImpl).send(mensaje)).rejects.toThrow("503");
  });

  it("el token de acceso, si lo hay, viaja como Bearer; si no, no se manda ninguna cabecera de autorización", async () => {
    const con = fetchQueResponde([{ status: "ok", id: "x" }, { status: "ok", id: "y" }]);
    await createExpoPushTransport("secreto", con).send(mensaje);
    expect((con.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe("Bearer secreto");

    const sin = fetchQueResponde([{ status: "ok", id: "x" }, { status: "ok", id: "y" }]);
    await createExpoPushTransport(undefined, sin).send(mensaje);
    expect((sin.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
