import { describe, expect, it } from "vitest";

import {
  QUOTE_OUTCOMES,
  QUOTE_STATES,
  QUOTE_STORED_STATES,
  clientCanAnswerQuote,
  isQuoteState,
  quoteDisplayState,
  quoteTone,
  quotedJobCanStart,
} from "./quotes";

describe("RN-QUO-01 · los estados de un presupuesto (§84)", () => {
  it("guarda cuatro y enseña cinco: pendiente de pago y pagado se derivan", () => {
    expect([...QUOTE_STORED_STATES]).toEqual(["draft", "sent", "accepted", "rejected"]);
    expect([...QUOTE_STATES]).toEqual(["draft", "sent", "rejected", "pending_payment", "paid"]);
    expect(isQuoteState("accepted")).toBe(false);
    expect(isQuoteState("paid")).toBe(true);
  });

  it("RN-QUO-04 · aceptado con deuda viva es pendiente de pago; a cero, pagado (RN-DAT-05)", () => {
    expect(quoteDisplayState("accepted", 30250)).toBe("pending_payment");
    expect(quoteDisplayState("accepted", 0)).toBe("paid");
    expect(quoteDisplayState("sent", 30250)).toBe("sent");
    expect(quoteDisplayState("rejected", 0)).toBe("rejected");
    expect(quoteDisplayState("draft", 0)).toBe("draft");
  });

  it("RN-QUO-02 · la aceptación crea un trabajo o una plantilla, nada más", () => {
    expect([...QUOTE_OUTCOMES]).toEqual(["job", "menu_template"]);
  });

  it("cada estado tiene un tono y ninguno se comparte por accidente", () => {
    expect(quoteTone("paid")).toBe("success");
    expect(quoteTone("pending_payment")).toBe("warning");
    expect(quoteTone("sent")).toBe("warning");
    expect(quoteTone("rejected")).toBe("danger");
    expect(quoteTone("draft")).toBe("neutral");
  });
});

describe("RN-JOB-06 / RN-QUO-05 · la puerta de Comenzar de un trabajo presupuestado", () => {
  it("con pago previo exigido, deuda viva y sin autorización: no", () => {
    expect(quotedJobCanStart({ requiresPaymentBeforeStart: true, outstandingCents: 30250, startAuthorized: false }))
      .toEqual({ ok: false, blocker: "payment_pending" });
  });

  it("pagado: sí", () => {
    expect(quotedJobCanStart({ requiresPaymentBeforeStart: true, outstandingCents: 0, startAuthorized: false }))
      .toEqual({ ok: true });
  });

  it("autorizado el inicio antes del pago (registrado): sí", () => {
    expect(quotedJobCanStart({ requiresPaymentBeforeStart: true, outstandingCents: 30250, startAuthorized: true }))
      .toEqual({ ok: true });
  });

  it("sin pago previo exigido: sí, aunque quede deuda", () => {
    expect(quotedJobCanStart({ requiresPaymentBeforeStart: false, outstandingCents: 30250, startAuthorized: false }))
      .toEqual({ ok: true });
  });
});

describe("RN-QUO-03 · quién responde a un presupuesto por el restaurante", () => {
  it("solo el propietario (local o global), y solo a uno enviado", () => {
    expect(clientCanAnswerQuote("sent", true)).toBe(true);
    expect(clientCanAnswerQuote("sent", false)).toBe(false);
    expect(clientCanAnswerQuote("pending_payment", true)).toBe(false);
    expect(clientCanAnswerQuote("draft", true)).toBe(false);
  });
});
