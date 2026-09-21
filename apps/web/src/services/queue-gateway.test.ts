import { describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";
import {
  EXPO_PUSH_ENDPOINT,
  createExpoPushTransport,
  createMailComposer,
  createPushComposer,
  createResendTransport,
} from "./queue-gateway";
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
    digest_id: null,
    digest_date: null,
    digest_count: null,
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

/**
 * RN-NOT-06 (decisión 65) · el correo y el push del resumen diario.
 *
 * Lo que vigila, y lo primero es lo que más:
 *
 *   · Que una entrega de resumen **no se cuele por el camino del aviso**.
 *     Una entrega de resumen no tiene `event_type` ni `deep_link` —las
 *     columnas del aviso vienen nulas—, así que seguir por ahí compondría
 *     un correo con "undefined" dentro y lo mandaría de verdad.
 *   · Que el cuerpo **no liste qué avisos entraron**. El detalle de cada
 *     uno está protegido por las políticas que deciden quién ve qué, y un
 *     correo reenviado ya no tiene RLS. Dice cuántos son y lleva al sitio.
 *   · Que un resumen sin nada dentro no se componga: no hay nada que
 *     mandar, y la cola lo cierra en vez de reintentarlo cinco veces.
 */
function resumen(over: Partial<DeliveryRow> = {}): DeliveryRow {
  return {
    ...entrega(),
    channel: "email",
    // Las del aviso vienen NULAS en una entrega de resumen. Se ponen así a
    // propósito: es lo que devuelve `claim_notification_deliveries()`.
    notification_id: null,
    event_type: null as unknown as string,
    deep_link: null as unknown as string,
    audience: null as unknown as string,
    entity_type: null as unknown as string,
    digest_id: "dg-1",
    digest_date: "2026-09-21",
    digest_count: 3,
    ...over,
  };
}

describe("RN-NOT-06 · el correo del resumen diario", () => {
  it("se compone sin tocar las columnas del aviso, que vienen nulas", () => {
    const m = createMailComposer("https://cuotly.test").compose(resumen());

    expect(m).not.toBeNull();
    expect(m!.subject).not.toMatch(/undefined/);
    expect(m!.body).not.toMatch(/undefined/);
    expect(m!.subject).toContain("Restavor");
    expect(m!.subject).toContain("3");
  });

  it("NO lista qué avisos entraron: eso se lee en Cuotly, con permisos", () => {
    const m = createMailComposer("https://cuotly.test").compose(resumen());

    // El enlace lleva a los avisos; el cuerpo no trae ni un título.
    expect(m!.body).toContain("https://cuotly.test/avisos");
    expect(m!.body).not.toMatch(/job_published|Trabajo publicado/);
  });

  it("uno solo se dice en singular", () => {
    const m = createMailComposer("https://cuotly.test").compose(resumen({ digest_count: 1 }));
    expect(m!.subject).toContain("1 aviso nuevo");
  });

  it("un resumen vacío no se compone: no hay nada que mandar", () => {
    expect(createMailComposer("https://cuotly.test").compose(resumen({ digest_count: 0 }))).toBeNull();
    expect(createMailComposer("https://cuotly.test").compose(resumen({ digest_count: null }))).toBeNull();
  });

  it("sin dirección de correo tampoco se compone", () => {
    expect(
      createMailComposer("https://cuotly.test").compose(resumen({ recipient_email: null })),
    ).toBeNull();
  });
});

describe("RN-NOT-06 · el push del resumen diario", () => {
  it("dice cuántos son y lleva a los avisos, sin undefined", () => {
    const m = createPushComposer().compose(
      resumen({ channel: "push", push_tokens: ["ExponentPushToken[a]"] }),
    );

    expect(m).not.toBeNull();
    expect(m!.title).not.toMatch(/undefined/);
    expect(m!.body).not.toMatch(/undefined/);
    expect(m!.title).toContain("Restavor");
    expect(m!.body).toContain("3");
    expect(m!.deepLink).toBe("/avisos");
  });

  it("sin teléfono no se compone, como cualquier otro push", () => {
    expect(
      createPushComposer().compose(resumen({ channel: "push", push_tokens: [] })),
    ).toBeNull();
  });
});

describe("El transporte de Resend dice cuándo no puede enviar, en vez de intentarlo", () => {
  /**
   * El 422 real que estuvo once días en producción:
   *
   *   Invalid `from` field. The email address needs to follow the
   *   `email@example.com` or `Name <email@example.com>` format.
   *
   * Lo que se comprueba aquí es que ese error ya no llega a ocurrir: el
   * transporte lo sabe **antes** de que la cola reclame ninguna fila, y lo
   * dice nombrando la variable que hay que tocar. Quien lea la respuesta
   * del cron tiene que poder arreglarlo sin abrir el código.
   */
  const CLAVE = "re_lo_que_sea";

  it("con un remitente válido no pone ninguna pega", () => {
    const t = createResendTransport(CLAVE, "Cuotly <avisos@cuotly.com>");
    expect(t.unusableReason?.()).toBeNull();
  });

  it("con el remitente mal escrito lo dice, y nombra RESEND_FROM", () => {
    const t = createResendTransport(CLAVE, "Cuotly");
    const motivo = t.unusableReason?.();
    expect(motivo).toContain("RESEND_FROM");
  });

  it("sin clave también lo dice, y nombra RESEND_API_KEY", () => {
    const t = createResendTransport(undefined, "Cuotly <avisos@cuotly.com>");
    expect(t.unusableReason?.()).toContain("RESEND_API_KEY");
  });

  it("no llama a Resend con un remitente inválido ni aunque se le llame a pelo", () => {
    // La cola ya pregunta antes, pero este transporte se puede usar desde
    // otro sitio. Mandar un `from` inválido es exactamente el 422 del que
    // viene todo esto, así que ni se intenta la petición.
    const fetchFalso = vi.fn();
    const t = createResendTransport(CLAVE, "Cuotly", fetchFalso as unknown as typeof fetch);

    return expect(
      t.send({ to: "ana@example.com", subject: "s", body: "b" }),
    ).rejects.toThrow(/RESEND_FROM/);
  });

  it("manda el remitente ya recortado, no el crudo con su salto de línea", async () => {
    // Si se mandara el crudo, la variable con un `\n` al final seguiría
    // dando el mismo 422 que estuvo once días sin verse.
    const fetchFalso = vi.fn(async (_url: string, init?: { body?: string }) => {
      void _url;
      void init;
      return { ok: true, json: async () => ({ id: "prov-1" }) };
    });
    const t = createResendTransport(
      CLAVE,
      "  Cuotly <avisos@cuotly.com>\n",
      fetchFalso as unknown as typeof fetch,
    );

    await t.send({ to: "ana@example.com", subject: "s", body: "b" });

    const cuerpo = JSON.parse(String(fetchFalso.mock.calls[0]?.[1]?.body));
    expect(cuerpo.from).toBe("Cuotly <avisos@cuotly.com>");
  });
});
