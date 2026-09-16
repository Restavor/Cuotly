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
    entity_type: "job",
    establishment_name: "Casa Sol",
    amount_cents: null,
    threshold_percent: null,
    subject: "Quiero cambiar el precio del menú del día",
    ...over,
  };
}

describe("RN-MOV-04 (decisión 36) · el push dice qué ha pasado, dónde y qué se pide", () => {
  it("título: el nombre del evento y el restaurante; cuerpo: el espacio y la frase de lo que se pide", () => {
    const m = createPushComposer().compose(entrega());
    expect(m).not.toBeNull();
    expect(m?.title).toBe(`${es.notifications.events.job_published} · Casa Sol`);
    expect(m?.body).toContain("Restavor");
    expect(m?.body).toContain("«Quiero cambiar el precio del menú del día»");
    expect(m?.deepLink).toBe("/espacios/restavor/trabajos/1");
    expect(m?.to).toEqual(["ExponentPushToken[a]"]);
  });

  it("la cifra y el umbral van cuando el aviso los trae, y no se inventan cuando no", () => {
    const con = createPushComposer().compose(entrega({ event_type: "consumption_threshold_80", threshold_percent: 80, amount_cents: 12950, subject: null }));
    expect(con?.body).toContain("80 %");
    expect(con?.body).toContain("129,50");
    expect(con?.body).not.toContain("«");
    const sin = createPushComposer().compose(entrega({ amount_cents: null, threshold_percent: null }));
    expect(sin?.body).not.toMatch(/\d+ ?%/);
  });

  it("sin restaurante (un aviso del espacio) el título es solo el evento", () => {
    const m = createPushComposer().compose(entrega({ event_type: "absence_requested", establishment_name: null, subject: "Viaje" }));
    expect(m?.title).toBe(es.notifications.events.absence_requested);
    expect(m?.body).toBe("Restavor\n«Viaje»");
  });

  it("nunca lleva el enlace en el texto ni el correo de nadie: solo lo que trae la fila", () => {
    const m = createPushComposer().compose(entrega());
    expect(`${m?.title} ${m?.body}`).not.toContain("/espacios/");
    expect(`${m?.title} ${m?.body}`).not.toContain("ana@example.com");
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
