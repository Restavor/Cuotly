import { describe, expect, it } from "vitest";

import { dinerCancelEstablishment, dinerLinkState, parseDinerCancel, parseDinerView, type DinerLinkView } from "./diner-link";

function raw(overrides: Record<string, unknown> = {}, restaurant: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    found: true,
    status: "confirmed",
    cancel_reason: null,
    date: "2026-10-08",
    time: "21:00",
    starts_at: "2026-10-08T19:00:00+00:00",
    party_size: 3,
    customer_name: "Nuria",
    language: "es",
    service_status: "active",
    timezone: "Europe/Madrid",
    cancel_deadline: "2026-10-08T17:00:00+00:00",
    server_now: "2026-10-03T10:00:00+00:00",
    can_cancel: true,
    restaurant: { name: "Casa Pepe", city: "Sevilla", address: "Calle Sierpes 12", phone: "+34954000000", ...restaurant },
    ...overrides,
  };
}

function view(overrides: Record<string, unknown> = {}): DinerLinkView {
  const parsed = parseDinerView(raw(overrides));
  if (!parsed) throw new Error("la vista de la prueba no se leyó");
  return parsed;
}

describe("AVI-05 · lo que devuelve la base de datos para el enlace del comensal", () => {
  it("AVI-05 · una vista válida se lee entera", () => {
    const v = view();
    expect(v.customerName).toBe("Nuria");
    expect(v.partySize).toBe(3);
    expect(v.restaurant).toEqual({ name: "Casa Pepe", city: "Sevilla", address: "Calle Sierpes 12", phone: "+34954000000" });
    expect(v.cancelDeadline.toISOString()).toBe("2026-10-08T17:00:00.000Z");
    expect(v.language).toBe("es");
  });

  it("AVI-05 · un enlace que no vale (no encontrado, mal formado) no se lee", () => {
    expect(parseDinerView({ found: false })).toBeNull();
    expect(parseDinerView(null)).toBeNull();
    expect(parseDinerView("hola")).toBeNull();
    expect(parseDinerView(raw({ status: "inventado" }))).toBeNull();
    expect(parseDinerView(raw({ language: "fr" }))).toBeNull();
    expect(parseDinerView(raw({ starts_at: "no es una fecha" }))).toBeNull();
    expect(parseDinerView(raw({ party_size: "3" }))).toBeNull();
    expect(parseDinerView(raw({ customer_name: "" }))).toBeNull();
    expect(parseDinerView({ ...raw(), restaurant: null })).toBeNull();
  });

  it("AVI-05 · el restaurante puede no tener ciudad, dirección ni teléfono: se dice null, no se inventa", () => {
    const v = parseDinerView(raw({}, { city: null, address: "", phone: null }));
    expect(v?.restaurant).toEqual({ name: "Casa Pepe", city: null, address: null, phone: null });
  });
});

describe("AVI-05 · el estado de la página", () => {
  it("AVI-05 · confirmada y dentro del plazo: se puede cancelar", () => {
    expect(dinerLinkState(view())).toBe("ok");
  });

  it("AVI-05 · una solicitud pendiente dentro del plazo: se puede cancelar la solicitud", () => {
    expect(dinerLinkState(view({ status: "pending" }))).toBe("pending");
  });

  it("RN-RES-08 · pasado el plazo: «Ya no se puede cancelar desde aquí. Llama a…»", () => {
    expect(dinerLinkState(view({ can_cancel: false }))).toBe("deadline_passed");
    expect(dinerLinkState(view({ status: "pending", can_cancel: false }))).toBe("deadline_passed");
  });

  it("AVI-05 · cancelada, y rechazada si el restaurante no pudo atender el grupo", () => {
    expect(dinerLinkState(view({ status: "cancelled", cancel_reason: "customer_link", can_cancel: false }))).toBe("cancelled");
    expect(dinerLinkState(view({ status: "cancelled", cancel_reason: "customer", can_cancel: false }))).toBe("cancelled");
    expect(dinerLinkState(view({ status: "cancelled", cancel_reason: "rejected", can_cancel: false }))).toBe("rejected");
  });

  it("decisión 158 · con Reservas cerrada: llama al restaurante (aunque la reserva siga confirmada)", () => {
    expect(dinerLinkState(view({ service_status: "closed", can_cancel: false }))).toBe("closed");
  });

  it("RN-RES-11 · en pausa el enlace funciona igual", () => {
    expect(dinerLinkState(view({ service_status: "paused" }))).toBe("ok");
  });

  it("AVI-05 · una reserva que ya pasó, o «no vino», no se cancela", () => {
    expect(dinerLinkState(view({ starts_at: "2026-10-03T09:00:00+00:00", can_cancel: false }))).toBe("past");
    expect(dinerLinkState(view({ status: "no_show", can_cancel: false }))).toBe("past");
  });

  it("AVI-05 · la hora la pone la base de datos, no el reloj del comensal", () => {
    // La reserva es dentro de dos días según la base de datos: manda `server_now`, vaya el reloj del navegador como vaya.
    expect(dinerLinkState(view({ server_now: "2026-10-06T19:00:00+00:00", starts_at: "2026-10-08T19:00:00+00:00" }))).toBe("ok");
  });
});

describe("RN-RES-08 · el resultado de cancelar desde el enlace", () => {
  it("RN-RES-08 · se leen los seis resultados y se rechaza lo demás", () => {
    for (const outcome of ["cancelled", "already_cancelled", "deadline_passed", "closed", "not_cancellable", "not_found"]) {
      expect(parseDinerCancel({ outcome })).toBe(outcome);
    }
    expect(parseDinerCancel({ outcome: "inventado" })).toBeNull();
    expect(parseDinerCancel(null)).toBeNull();
    expect(parseDinerCancel("cancelled")).toBeNull();
  });
});

describe("AVI-01 · el aviso de «cancelada» sale al momento", () => {
  it("AVI-01 · el servidor sabe de qué restaurante es la cancelación; solo si se canceló", () => {
    expect(dinerCancelEstablishment({ outcome: "cancelled", establishment_id: "est-1" })).toBe("est-1");
    expect(dinerCancelEstablishment({ outcome: "already_cancelled", establishment_id: "est-1" })).toBeNull();
    expect(dinerCancelEstablishment({ outcome: "cancelled" })).toBeNull();
    expect(dinerCancelEstablishment(null)).toBeNull();
  });
});
