import { describe, expect, it } from "vitest";

import type { PaymentInfo } from "@/core/agents/payment-info";
import type { DeliveryRow } from "../queue-runner";
import { createMailComposer } from "../queue-gateway";
import { composeLifecycleEmail, establishmentIdFromLink, isLifecycleEmailEvent } from "./lifecycle-emails";

const EST = "11111111-2222-3333-4444-555555555555";

function entrega(over: Partial<DeliveryRow> = {}): DeliveryRow {
  return {
    delivery_id: "d1",
    notification_id: "n1",
    attempts: 1,
    channel: "email",
    recipient_email: "duena@casasol.test",
    push_tokens: null,
    event_type: "reservation_service_approved",
    audience: "client",
    deep_link: `/agents/${EST}`,
    space_name: "Restavor",
    entity_type: "establishment",
    establishment_name: "Casa Sol",
    amount_cents: 5808,
    threshold_percent: null,
    subject: null,
    digest_id: null,
    digest_date: null,
    digest_count: null,
    ...over,
  };
}

const info: PaymentInfo = {
  chargeId: "c1",
  concept: "Mensualidad Reservas",
  reference: "Reservas Casa Sol 2026-10",
  baseCents: 4800,
  taxCents: 1008,
  totalCents: 5808,
  outstandingCents: 5808,
  dueAt: "2026-10-10T08:00:00Z",
  periodStart: "2026-10-03T08:00:00Z",
  periodEnd: "2026-11-03T08:00:00Z",
  iban: "ES9121000418450200051332",
  bizumPhone: "+34 600 123 456",
  paymentNote: null,
  payeeName: "Restavor Pruebas S.L.",
};

describe("RN-APP-03 · el correo «Aprobado: datos para pagar»", () => {
  it("RN-APP-03 · lleva importe, IBAN, Bizum, concepto y vencimiento cuando el servidor los leyó", () => {
    const m = composeLifecycleEmail(entrega(), "https://app.restavor.com", {
      paymentByEstablishment: new Map([[EST, info]]),
    })!;
    expect(m.to).toBe("duena@casasol.test");
    expect(m.subject).toBe("Aprobado: datos para pagar Reservas");
    expect(m.body).toContain("58,08");
    expect(m.body).toContain("48,00");
    expect(m.body).toContain("ES91 2100 0418 4502 0005 1332");
    expect(m.body).toContain("A nombre de: Restavor Pruebas S.L.");
    expect(m.body).toContain("+34 600 123 456");
    expect(m.body).toContain("Reservas Casa Sol 2026-10");
    expect(m.body).toContain("10 de octubre de 2026");
    expect(m.body).toContain(`https://app.restavor.com/agents/${EST}`);
  });

  it("RN-APP-03 · sin IBAN ni Bizum dice que faltan los datos de pago y no inventa ninguno", () => {
    const m = composeLifecycleEmail(entrega(), "https://x.test", {
      paymentByEstablishment: new Map([[EST, { ...info, iban: null, bizumPhone: null }]]),
    })!;
    expect(m.body).toContain("Todavía no tenemos a mano los datos de pago");
    expect(m.body).not.toMatch(/ES\d{2}/);
    expect(m.body).not.toContain("Bizum al");
  });

  it("RN-APP-03 · si el correo cae en la cola sin los datos, lleva el importe y remite a la cuenta sin decir que faltan", () => {
    const m = composeLifecycleEmail(entrega(), "https://x.test")!;
    expect(m.body).toContain("Importe: 58,08");
    // No dice «sin configurar» (el IBAN puede estar puesto: la cola simplemente no lo leyó).
    expect(m.body).not.toContain("Todavía no tenemos a mano los datos de pago");
    expect(m.body).toContain("Tienes los datos para pagar");
  });

  it("RN-APP-03 · el mismo texto sale por la cola de dos tandas (createMailComposer)", () => {
    const m = createMailComposer("https://x.test").compose(entrega({ event_type: "reservations_paused", amount_cents: null }))!;
    expect(m.subject).toBe("Reservas está en pausa");
    expect(m.body).toContain("Paga y se reactiva al momento.");
  });
});

describe("RN-RES-11 · los correos del ciclo de vida", () => {
  it("RN-RES-11 · cada tipo tiene su asunto", () => {
    const asuntos: Record<string, string> = {
      reservation_service_rejected: "No podemos darte acceso a Reservas",
      reservations_activated: "Ya puedes usar Reservas",
      reservations_payment_due: "Tu plan de Reservas vence pronto",
      reservations_past_due: "Pago pendiente de Reservas",
      reservations_paused: "Reservas está en pausa",
      reservations_ending: "Baja de Reservas confirmada",
      reservations_closed_purge_soon: "Recordatorio: descarga tus reservas",
    };
    for (const [tipo, asunto] of Object.entries(asuntos)) {
      expect(composeLifecycleEmail(entrega({ event_type: tipo }), "https://x.test")?.subject, tipo).toBe(asunto);
    }
  });

  it("RN-RES-11 · un tipo que no es de Reservas no se redacta aquí, y sin dirección no hay correo", () => {
    expect(isLifecycleEmailEvent("charge_due_today")).toBe(false);
    expect(composeLifecycleEmail(entrega({ event_type: "charge_due_today" }), "https://x.test")).toBeNull();
    expect(composeLifecycleEmail(entrega({ recipient_email: null }), "https://x.test")).toBeNull();
  });

  it("RN-RES-11 · de qué restaurante habla un aviso se lee del enlace", () => {
    expect(establishmentIdFromLink(`/agents/${EST}/plan`)).toBe(EST);
    expect(establishmentIdFromLink(`/agents/${EST}`)).toBe(EST);
    expect(establishmentIdFromLink("/espacios/restavor/reservas")).toBeNull();
  });

  it("RN-RES-11 · el correo de pausa lleva los datos para pagar si se conocen", () => {
    const m = composeLifecycleEmail(entrega({ event_type: "reservations_paused", amount_cents: null }), "https://x.test", {
      paymentByEstablishment: new Map([[EST, info]]),
    })!;
    expect(m.body).toContain("Reservas Casa Sol 2026-10");
  });

  it("RN-AGT-05 · el correo de saldo bajo lleva el saldo que queda y manda a recargar", () => {
    const m = composeLifecycleEmail(
      entrega({ event_type: "agent_balance_low", amount_cents: 400, deep_link: `/agents/${EST}/saldo` }),
      "https://x.test",
    )!;
    expect(m.subject).toBe("Te queda poco saldo");
    expect(m.body).toContain("Casa Sol");
    expect(m.body).toContain("4,00");
    expect(m.body).toContain("Recarga desde Saldo");
    expect(m.body).toContain(`https://x.test/agents/${EST}/saldo`);
  });

  it("RN-AGT-06 · el correo de saldo agotado dice qué deja de funcionar: llamadas, WhatsApp y SMS; los correos no", () => {
    const m = composeLifecycleEmail(entrega({ event_type: "agent_balance_empty", amount_cents: null }), "https://x.test")!;
    expect(m.subject).toBe("Te has quedado sin saldo");
    expect(m.body).toContain("no coge llamadas");
    expect(m.body).toContain("los correos sí");
  });

  it("RN-AGT-04 · el recibo de la recarga lleva el importe y dice que no es una factura", () => {
    const m = composeLifecycleEmail(entrega({ event_type: "agent_topup_receipt", amount_cents: 2420 }), "https://x.test")!;
    expect(m.subject).toBe("Recibo de tu recarga de saldo");
    expect(m.body).toContain("24,20");
    expect(m.body).toContain("no una factura");
  });

  it("RN-AGT-04 · los tres tipos del saldo se redactan aquí y salen por la cola de dos tandas con su texto (no el genérico)", () => {
    for (const type of ["agent_balance_low", "agent_balance_empty", "agent_topup_receipt"]) {
      expect(isLifecycleEmailEvent(type)).toBe(true);
      const m = createMailComposer("https://x.test").compose(entrega({ event_type: type }))!;
      expect(m.subject).not.toBe("");
      expect(m.body).toContain("Casa Sol");
    }
  });
});
