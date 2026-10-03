import { describe, expect, it } from "vitest";

import {
  isMobilePhone,
  isNoticeErrorCode,
  isNoticeToken,
  noticeLinkToken,
  noticeUrl,
  NOTICE_MAX_ATTEMPTS,
  NOTICE_RETRY_MINUTES,
  phoneCountry,
  pickNoticeChannel,
  rateChannelOf,
  retryDelayMinutes,
  templateForEvent,
  templateHasCancelLink,
  templateNeedsAddress,
  NOTICE_TEMPLATES,
  type ChannelChoice,
} from "./notices";

const ALL = { email: true, whatsapp: true, sms: true };

describe("RN-RES-10 · el canal de un aviso: correo → WhatsApp → SMS", () => {
  it("RN-RES-10 · con email → solo email, aunque haya teléfono con permiso", () => {
    expect(pickNoticeChannel({ email: "a@b.es", phone: "+34600000001", consent: true, switches: ALL })).toEqual({ channel: "email", reason: null });
  });

  it("RN-RES-10 · sin email, con móvil y permiso → WhatsApp", () => {
    expect(pickNoticeChannel({ email: null, phone: "+34600000001", consent: true, switches: ALL })).toEqual({ channel: "whatsapp", reason: null });
  });

  it("RN-RES-10 · con WhatsApp apagado → SMS", () => {
    expect(pickNoticeChannel({ email: null, phone: "+34600000001", consent: true, switches: { ...ALL, whatsapp: false } }).channel).toBe("sms");
  });

  it("RN-RES-10 · con el correo apagado, un comensal con email y móvil recibe WhatsApp (el primero activado)", () => {
    expect(pickNoticeChannel({ email: "a@b.es", phone: "+34600000001", consent: true, switches: { ...ALL, email: false } }).channel).toBe("whatsapp");
  });

  it("RN-RES-10 · sin permiso del comensal no hay WhatsApp ni SMS (no_consent)", () => {
    expect(pickNoticeChannel({ email: null, phone: "+34600000001", consent: false, switches: ALL })).toEqual({ channel: null, reason: "no_consent" });
  });

  it("RN-RES-10 · sin nada de contacto → no_contact", () => {
    expect(pickNoticeChannel({ email: null, phone: null, consent: true, switches: ALL })).toEqual({ channel: null, reason: "no_contact" });
    expect(pickNoticeChannel({ email: "  ", phone: " ", consent: true, switches: ALL })).toEqual({ channel: null, reason: "no_contact" });
  });

  it("RN-RES-10 · un fijo español (+34 8… y +34 9…) no recibe nada", () => {
    expect(isMobilePhone("+34955123456")).toBe(false);
    expect(isMobilePhone("+34855123456")).toBe(false);
    expect(isMobilePhone("+34655123456")).toBe(true);
    expect(isMobilePhone("+34755123456")).toBe(true);
    expect(isMobilePhone("+351912345678")).toBe(true);
    expect(isMobilePhone(null)).toBe(false);
    expect(pickNoticeChannel({ email: null, phone: "+34955123456", consent: true, switches: ALL })).toEqual({ channel: null, reason: "no_contact" });
  });

  it("RN-RES-10 · todo apagado → messaging_disabled", () => {
    expect(pickNoticeChannel({ email: "a@b.es", phone: null, consent: true, switches: { email: false, whatsapp: false, sms: false } })).toEqual({
      channel: null,
      reason: "messaging_disabled",
    });
  });

  it("RN-RES-10 · el respaldo de un WhatsApp no entregable solo mira el SMS", () => {
    expect(pickNoticeChannel({ email: "a@b.es", phone: "+34600000001", consent: true, switches: ALL, afterOrder: 2 }).channel).toBe("sms");
    expect(pickNoticeChannel({ email: null, phone: "+34600000001", consent: true, switches: { ...ALL, sms: false }, afterOrder: 2 })).toEqual({
      channel: null,
      reason: "messaging_disabled",
    });
  });

  it("RN-RES-10 · las 64 combinaciones coinciden con una referencia escrita de otra manera", () => {
    for (let i = 0; i < 64; i += 1) {
      const email = (i & 1) !== 0;
      const phone = (i & 2) !== 0;
      const consent = (i & 4) !== 0;
      const switches = { email: (i & 8) !== 0, whatsapp: (i & 16) !== 0, sms: (i & 32) !== 0 };
      const channel = email && switches.email ? "email" : phone && consent && switches.whatsapp ? "whatsapp" : phone && consent && switches.sms ? "sms" : null;
      const reason = channel !== null ? null : email || (phone && consent) ? "messaging_disabled" : phone ? "no_consent" : "no_contact";
      const expected: ChannelChoice = channel !== null ? { channel, reason: null } : { channel: null, reason: reason as "messaging_disabled" | "no_consent" | "no_contact" };
      expect(pickNoticeChannel({ email: email ? "a@b.es" : null, phone: phone ? "+34600000001" : null, consent, switches }), `combinación ${i}`).toEqual(expected);
    }
  });
});

describe("RN-AGT-03 · el país de un número y su canal de tarifa", () => {
  it("RN-AGT-03 · el prefijo manda el país, y gana el más largo", () => {
    expect(phoneCountry("+34600000001")).toBe("ES");
    expect(phoneCountry("+351912345678")).toBe("PT");
    expect(phoneCountry("+33612345678")).toBe("FR");
    expect(phoneCountry("+12025550123")).toBe("US");
    expect(phoneCountry("+598991234567")).toBe("UY");
    expect(phoneCountry("+3412")).toBe("ES");
  });

  it("RN-AGT-03 · un prefijo desconocido o sin «+» no tiene país (y sin país no hay tarifa)", () => {
    expect(phoneCountry("+99912345678")).toBeNull();
    expect(phoneCountry("34600000001")).toBeNull();
  });

  it("RN-AGT-03 · WhatsApp usa la tarifa `whatsapp_utility` y SMS la suya", () => {
    expect(rateChannelOf("whatsapp")).toBe("whatsapp_utility");
    expect(rateChannelOf("sms")).toBe("sms");
  });
});

describe("RN-RES-10 · de qué evento de la agenda nace qué aviso", () => {
  const t = (type: string, data: Record<string, unknown> = {}) => templateForEvent({ type, data });

  it("RN-RES-10 · alta confirmada → «reserva confirmada»; alta de grupo → «solicitud recibida»", () => {
    expect(t("created", { status: "confirmed" })).toBe("confirmed");
    expect(t("created", { status: "pending" })).toBe("pending_received");
  });

  it("RN-RES-10 · confirmar un grupo → «grupo aceptado»; rechazarlo → «grupo rechazado»; cancelar → «cancelada»", () => {
    expect(t("confirmed")).toBe("group_confirmed");
    expect(t("rejected")).toBe("group_rejected");
    expect(t("cancelled")).toBe("cancelled");
  });

  it("RN-RES-10 · cambiar fecha, hora o personas → «modificada»; cambiar solo el contacto no avisa", () => {
    expect(t("updated", { changed: ["time"] })).toBe("modified");
    expect(t("updated", { changed: ["name", "date"] })).toBe("modified");
    expect(t("updated", { changed: ["party_size"] })).toBe("modified");
    expect(t("updated", { changed: ["name", "phone", "email", "notes", "language"] })).toBeNull();
    expect(t("updated", {})).toBeNull();
  });

  it("RN-RES-10 · el agente que sube una confirmada al umbral → «solicitud recibida»", () => {
    expect(t("updated", { changed: ["party_size"], status_from: "confirmed", status_to: "pending" })).toBe("pending_received");
  });

  it("RN-RES-10 · «No vino», abrir la ficha y los avisos mismos no avisan", () => {
    for (const type of ["no_show", "no_show_undone", "opened", "duplicate_dismissed", "notification_sent", "notification_failed", "notification_skipped"]) {
      expect(t(type), type).toBeNull();
    }
  });
});

describe("RN-RES-10 · las plantillas", () => {
  it("RN-RES-10 · todas llevan enlace de cancelar salvo «grupo rechazado» y «cancelada»", () => {
    expect(NOTICE_TEMPLATES.filter((n) => !templateHasCancelLink(n))).toEqual(["group_rejected", "cancelled"]);
  });

  it("decisión 164 · la dirección hace falta en «confirmada» y «grupo aceptado»", () => {
    expect(NOTICE_TEMPLATES.filter(templateNeedsAddress)).toEqual(["confirmed", "group_confirmed"]);
  });
});

describe("decisión 155 · reintentos", () => {
  it("decisión 155 · cuatro intentos y esperas de 1, 5 y 15 minutos", () => {
    expect(NOTICE_MAX_ATTEMPTS).toBe(4);
    expect(NOTICE_RETRY_MINUTES).toEqual([1, 5, 15]);
    expect([1, 2, 3, 4, 5].map(retryDelayMinutes)).toEqual([1, 5, 15, null, null]);
    expect(retryDelayMinutes(0)).toBeNull();
    expect(retryDelayMinutes(1.5)).toBeNull();
  });

  it("decisión 155 · el error guardado es un código, nunca un texto con un contacto", () => {
    expect(isNoticeErrorCode("meta_131026")).toBe(true);
    expect(isNoticeErrorCode("max_attempts")).toBe(true);
    expect(isNoticeErrorCode("No se pudo enviar a ana@casa.es")).toBe(false);
    expect(isNoticeErrorCode("+34600000001")).toBe(false);
    expect(isNoticeErrorCode("")).toBe(false);
    expect(isNoticeErrorCode("x".repeat(61))).toBe(false);
  });
});

describe("decisión 154 · el enlace del comensal", () => {
  const token = "0123456789abcdef0123456789abcdef";

  it("decisión 154 · el enlace son los 32 primeros caracteres del token y solo valen en minúsculas hexadecimales", () => {
    expect(noticeLinkToken(`${token}${token}`)).toBe(token);
    expect(isNoticeToken(token)).toBe(true);
    expect(isNoticeToken(token.toUpperCase())).toBe(false);
    expect(isNoticeToken(token.slice(1))).toBe(false);
    expect(isNoticeToken(`${token}0`)).toBe(false);
    expect(isNoticeToken("g".repeat(32))).toBe(false);
  });

  it("decisión 154 · la dirección sale sin dobles barras", () => {
    expect(noticeUrl("https://restavor.com", token)).toBe(`https://restavor.com/c/${token}`);
    expect(noticeUrl("https://restavor.com///", token)).toBe(`https://restavor.com/c/${token}`);
  });
});
