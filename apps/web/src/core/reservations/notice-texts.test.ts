import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  cleanNoticeText,
  EMAIL_PALETTE,
  emailFooter,
  emailSenderName,
  escapeHtml,
  renderEmail,
  renderSms,
  renderWhatsApp,
  whatsAppAutoReply,
  WHATSAPP_MAX_VARIABLES,
  WHATSAPP_TEMPLATES,
  type NoticeContext,
} from "./notice-texts";
import { NOTICE_TEMPLATES, templateHasCancelLink, type NoticeLanguage, type NoticeTemplate } from "./notices";
import { isSmsSafe, SMS_MAX_LENGTH, toSmsSafe } from "./sms-text";

const TOKEN = "0123456789abcdef0123456789abcdef";
const LINK = `https://restavor.com/c/${TOKEN}`;

function context(template: NoticeTemplate, language: NoticeLanguage, overrides: Partial<NoticeContext> = {}): NoticeContext {
  return {
    template,
    language,
    customerName: "Nuria",
    date: "2026-09-26",
    time: "21:00",
    partySize: 4,
    restaurant: { name: "Casa Pepe", phone: "+34954000000", address: "Calle Sierpes 12, Sevilla", email: "reservas@casapepe.test" },
    linkUrl: LINK,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Los textos de `docs/agents/textos-avisos.md` mandan: se leen del propio documento
// ---------------------------------------------------------------------------
/** El asunto de una sección: unas veces se llama «Email · asunto ES» y otras «Asunto ES». */
function subjectOf(lines: Record<string, string>, language: "ES" | "EN"): string | undefined {
  return lines[`Email · asunto ${language}`] ?? lines[`Asunto ${language}`];
}

const DOC = readFileSync(join(process.cwd(), "..", "..", "docs", "agents", "textos-avisos.md"), "utf8");

const SECTION_TEMPLATES: Record<string, NoticeTemplate> = {
  confirmed: "confirmed",
  pending_received: "pending_received",
  group_confirmed: "group_confirmed",
  group_rejected: "group_rejected",
  modified: "modified",
  cancelled: "cancelled",
};

/** Las líneas `**Canal ES:** texto` de cada sección, por plantilla. */
function docLines(): Record<NoticeTemplate, Record<string, string>> {
  const result = {} as Record<NoticeTemplate, Record<string, string>>;
  for (const section of DOC.split(/\n## /).slice(1)) {
    const key = /\(`([a-z_]+)`\)/.exec(section.split("\n")[0] ?? "")?.[1];
    if (!key || !(key in SECTION_TEMPLATES)) continue;
    const lines: Record<string, string> = {};
    for (const line of section.split("\n")) {
      const m = /^\*\*([^*]+):\*\*\s*(.*)$/.exec(line);
      if (m) lines[m[1]!.trim()] = m[2]!.trim();
    }
    result[SECTION_TEMPLATES[key]!] = lines;
  }
  return result;
}

/** Pone en el texto del documento los valores de la prueba. */
function fill(text: string, language: NoticeLanguage): string {
  const people = language === "es" ? "4" : "4";
  const long = language === "es" ? "sábado 26 de septiembre" : "Saturday 26 September";
  const short = language === "es" ? "sáb 26/09" : "Sat 26/09";
  return text
    .replace(/\{nombre\}/g, "Nuria")
    .replace(/\{restaurante\}/g, "Casa Pepe")
    .replace(/\{fecha_larga\}/g, long)
    .replace(/\{fecha_corta\}/g, short)
    .replace(/\{hora\}/g, "21:00")
    .replace(/\{personas\}/g, people)
    .replace(/\{direccion\}/g, "Calle Sierpes 12, Sevilla")
    .replace(/\{telefono\}/g, "+34954000000")
    .replace(/\{enlace_corto\}/g, LINK)
    .replace(/\{enlace\}/g, LINK);
}

describe("AVI-02 a AVI-04 · el documento de textos tiene los seis avisos", () => {
  const lines = docLines();
  it("AVI-01 · el documento trae las seis plantillas con sus líneas de correo, WhatsApp y SMS", () => {
    expect(Object.keys(lines).sort()).toEqual([...NOTICE_TEMPLATES].sort());
    for (const t of NOTICE_TEMPLATES) {
      for (const k of ["WhatsApp ES", "WhatsApp EN", "SMS ES", "SMS EN"]) {
        expect(lines[t][k], `${t} · ${k}`).toBeTruthy();
      }
      expect(subjectOf(lines[t], "ES"), `${t} · asunto ES`).toBeTruthy();
      expect(subjectOf(lines[t], "EN"), `${t} · asunto EN`).toBeTruthy();
    }
  });
});

describe("AVI-03 · el WhatsApp dice EXACTAMENTE lo del documento", () => {
  const lines = docLines();
  for (const template of NOTICE_TEMPLATES) {
    for (const language of ["es", "en"] as const) {
      it(`AVI-03 · ${template} · ${language}: el mensaje es el del documento`, () => {
        const doc = lines[template][`WhatsApp ${language.toUpperCase()}`]!;
        // Se quitan el botón y la nota «sin botón»: no forman parte del cuerpo.
        const body = fill(doc.replace(/\s*\[(?:Botón|Button):[^\]]*\]\s*$/, "").replace(/\s*\((?:sin botón|no button)\)\s*$/, ""), language);
        expect(renderWhatsApp(context(template, language)).text).toBe(body);
      });
    }
  }

  it("AVI-03 · el botón «Cancelar mi reserva» solo va donde el documento lo pone", () => {
    const lines2 = docLines();
    for (const template of NOTICE_TEMPLATES) {
      for (const language of ["es", "en"] as const) {
        const doc = lines2[template][`WhatsApp ${language.toUpperCase()}`]!;
        const docButton = /\[(?:Botón|Button): ([^→]+) →/.exec(doc)?.[1]?.trim() ?? null;
        const ours = renderWhatsApp(context(template, language)).button;
        expect(ours?.label ?? null, `${template} ${language}`).toBe(docButton);
        expect(ours === null, `${template} ${language}`).toBe(!templateHasCancelLink(template));
        if (ours) expect(ours.urlSuffix).toBe(TOKEN);
      }
    }
  });

  it("AVI-03 · como mucho 5 variables por plantilla, ninguna al principio ni al final del cuerpo, y huecos seguidos", () => {
    for (const template of NOTICE_TEMPLATES) {
      for (const language of ["es", "en"] as const) {
        const spec = WHATSAPP_TEMPLATES[template][language];
        expect(spec.variables.length, `${template} ${language}`).toBeLessThanOrEqual(WHATSAPP_MAX_VARIABLES);
        expect(spec.body.match(/\{\{\d\}\}/g)?.length, `${template} ${language}`).toBe(spec.variables.length);
        expect(spec.body.startsWith("{{"), `${template} ${language}`).toBe(false);
        expect(spec.body.endsWith("}}"), `${template} ${language}`).toBe(false);
        expect(/\}\}\s*\{\{/.test(spec.body), `${template} ${language}`).toBe(false);
        expect(spec.body.length).toBeLessThanOrEqual(1024);
      }
    }
  });

  it("AVI-03 · el nombre de la plantilla es el mismo en los dos idiomas (cada idioma es una traducción)", () => {
    for (const template of NOTICE_TEMPLATES) {
      expect(WHATSAPP_TEMPLATES[template].es.name).toBe(WHATSAPP_TEMPLATES[template].en.name);
      expect(WHATSAPP_TEMPLATES[template].es.name).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("AVI-03 · ninguna variable lleva saltos de línea, ni queda vacía, aunque el comensal escriba lo que sea", () => {
    const out = renderWhatsApp(
      context("confirmed", "es", {
        customerName: "Nuria\nGarcía\t   Pérez  https://malo.example/x   www.otro.test",
        restaurant: { name: "Casa\r\nPepe", phone: "+34954000000", address: null, email: null },
      }),
    );
    for (const v of out.variables) {
      expect(v).not.toMatch(/[\r\n\t]/);
      expect(v).not.toMatch(/ {2,}/);
      expect(v).not.toMatch(/https?:|www\./i);
      expect(v.length).toBeGreaterThan(0);
    }
    expect(out.variables[0]).toBe("Nuria García Pérez");
    expect(out.variables[1]).toBe("Casa Pepe");
    expect(out.variables[3]).toBe("-");
  });

  it("AVI-03 · una persona se dice en singular", () => {
    expect(renderWhatsApp(context("confirmed", "es", { partySize: 1 })).text).toContain("1 persona.");
    expect(renderWhatsApp(context("confirmed", "en", { partySize: 1 })).text).toContain("1 person.");
    expect(renderWhatsApp(context("confirmed", "en", { partySize: 2 })).text).toContain("2 people.");
  });
});

describe("AVI-04 · el SMS dice lo del documento, sin tildes y en un solo mensaje", () => {
  const lines = docLines();
  for (const template of NOTICE_TEMPLATES) {
    for (const language of ["es", "en"] as const) {
      it(`AVI-04 · ${template} · ${language}: el SMS es el del documento, transliterado`, () => {
        const doc = fill(lines[template][`SMS ${language.toUpperCase()}`]!, language);
        const sms = renderSms(context(template, language));
        expect(sms.ok).toBe(true);
        if (!sms.ok) return;
        expect(sms.text).toBe(toSmsSafe(doc));
        expect(sms.text.length).toBeLessThanOrEqual(SMS_MAX_LENGTH);
        expect(isSmsSafe(sms.text)).toBe(true);
        expect(sms.shortened).toBe(false);
      });
    }
  }

  it("AVI-04 · un restaurante de nombre largo sale igual, con el nombre acortado, en un solo mensaje", () => {
    const sms = renderSms(context("confirmed", "es", { restaurant: { name: "Restaurante Casa de Pepe y María de la Giralda", phone: "+34954000000", address: "Calle Sierpes 12", email: null } }));
    expect(sms.ok && sms.shortened && sms.text.length <= SMS_MAX_LENGTH).toBe(true);
  });

  it("AVI-04 · el SMS lleva el enlace del propio aviso (32 caracteres de token) cuando hay botón o enlace", () => {
    for (const template of NOTICE_TEMPLATES) {
      const sms = renderSms(context(template, "es"));
      expect(sms.ok && sms.text.includes(LINK), template).toBe(templateHasCancelLink(template));
    }
  });

  it("AVI-04 · un SMS que no cabe ni acortando se dice, no se parte en dos", () => {
    const sms = renderSms(context("confirmed", "es", { linkUrl: `https://${"a".repeat(130)}.example/c/${TOKEN}` }));
    expect(sms).toEqual({ ok: false, reason: "too_long" });
  });
});

describe("AVI-02 · el correo", () => {
  const SUBJECT_ES: Record<NoticeTemplate, string> = {
    confirmed: "Tu reserva en Casa Pepe está confirmada",
    pending_received: "Hemos recibido tu solicitud en Casa Pepe",
    group_confirmed: "¡Tu reserva en Casa Pepe está confirmada!",
    group_rejected: "Tu solicitud en Casa Pepe",
    modified: "Hemos cambiado tu reserva en Casa Pepe",
    cancelled: "Tu reserva en Casa Pepe está cancelada",
  };

  it("AVI-02 · el asunto es el del documento, en español e inglés", () => {
    const lines = docLines();
    for (const template of NOTICE_TEMPLATES) {
      for (const language of ["es", "en"] as const) {
        const doc = fill(subjectOf(lines[template], language.toUpperCase() as "ES" | "EN")!, language);
        expect(renderEmail(context(template, language)).subject, `${template} ${language}`).toBe(doc);
      }
      expect(renderEmail(context(template, "es")).subject).toBe(SUBJECT_ES[template]);
    }
  });

  it("AVI-02 · «reserva confirmada» (ES): el cuerpo es el del documento", () => {
    const email = renderEmail(context("confirmed", "es"));
    expect(email.text).toBe(
      [
        "Hola, Nuria:",
        "",
        "Tu reserva está confirmada.",
        "",
        "sábado 26 de septiembre · 21:00 — 4 personas — Casa Pepe · Calle Sierpes 12, Sevilla",
        "",
        `¿No puedes venir? Cancela tu reserva aquí: ${LINK}`,
        "",
        "Para cualquier cambio, llámanos al +34954000000.",
        "",
        "¡Hasta pronto!",
        "Casa Pepe",
        "",
        "--",
        "Recibes este email porque has reservado en Casa Pepe. Reservas con Restavor.",
        "",
      ].join("\n"),
    );
  });

  it("AVI-02 · «reserva confirmada» (EN): el cuerpo es el del documento", () => {
    const email = renderEmail(context("confirmed", "en"));
    expect(email.text).toContain("Hi Nuria,\n\nYour booking is confirmed.");
    expect(email.text).toContain("Saturday 26 September · 21:00 — 4 people — Casa Pepe · Calle Sierpes 12, Sevilla");
    expect(email.text).toContain(`Can't make it? Cancel your booking here: ${LINK}`);
    expect(email.text).toContain("For any changes, call us on +34954000000.");
    expect(email.text).toContain("See you soon!\nCasa Pepe");
  });

  it("AVI-02 · «grupo aceptado» empieza por «¡Buenas noticias, {nombre}! Tu reserva para {personas} personas está confirmada.»", () => {
    expect(renderEmail(context("group_confirmed", "es")).text.startsWith("¡Buenas noticias, Nuria! Tu reserva para 4 personas está confirmada.")).toBe(true);
    expect(renderEmail(context("group_confirmed", "en")).text.startsWith("Good news, Nuria! Your booking for 4 people is confirmed.")).toBe(true);
  });

  it("AVI-02 · el resto de cuerpos es el del documento", () => {
    expect(renderEmail(context("pending_received", "es")).text).toContain(
      `Hola, Nuria: hemos recibido tu solicitud para 4 personas el sábado 26 de septiembre a las 21:00. El restaurante te llamará para confirmarla. Todavía no es una reserva confirmada.\n\nSi ya no la necesitas: ${LINK}`,
    );
    expect(renderEmail(context("pending_received", "en")).text).toContain(
      `Hi Nuria, we've received your request for 4 people on Saturday 26 September at 21:00. The restaurant will call you to confirm it. It is not a confirmed booking yet.\n\nIf you no longer need it: ${LINK}`,
    );
    expect(renderEmail(context("group_rejected", "es")).text).toContain(
      "Hola, Nuria: lo sentimos, no podemos atender tu solicitud para 4 personas el sábado 26 de septiembre a las 21:00. Si quieres buscar otra fecha, llámanos al +34954000000.",
    );
    expect(renderEmail(context("group_rejected", "en")).text).toContain(
      "Hi Nuria, we're sorry, we can't accommodate your request for 4 people on Saturday 26 September at 21:00. To find another date, call us on +34954000000.",
    );
    expect(renderEmail(context("modified", "es")).text).toContain(
      `Hola, Nuria: tu reserva ahora es: sábado 26 de septiembre · 21:00 · 4 personas.\n\nSi no te encaja, llámanos al +34954000000 o cancela aquí: ${LINK}`,
    );
    expect(renderEmail(context("modified", "en")).text).toContain(
      `Hi Nuria, your booking is now: Saturday 26 September · 21:00 · 4 people.\n\nIf it doesn't suit you, call us on +34954000000 or cancel here: ${LINK}`,
    );
    expect(renderEmail(context("cancelled", "es")).text).toContain(
      "Hola, Nuria: tu reserva del sábado 26 de septiembre a las 21:00 para 4 personas está cancelada. Si es un error o quieres otra fecha, llámanos al +34954000000.",
    );
    expect(renderEmail(context("cancelled", "en")).text).toContain(
      "Hi Nuria, your booking on Saturday 26 September at 21:00 for 4 people has been cancelled. If this is a mistake or you'd like another date, call us on +34954000000.",
    );
  });

  it("AVI-02 · llevan enlace de cancelar los que el PRD dice, y solo esos", () => {
    for (const template of NOTICE_TEMPLATES) {
      for (const language of ["es", "en"] as const) {
        const email = renderEmail(context(template, language));
        expect(email.text.includes(LINK), `${template} ${language} texto`).toBe(templateHasCancelLink(template));
        expect(email.html.includes(LINK), `${template} ${language} html`).toBe(templateHasCancelLink(template));
      }
    }
  });

  it("AVI-02 · el pie del documento, con la dirección de privacidad solo si está configurada (sin inventar una)", () => {
    expect(emailFooter("Casa Pepe", "es")).toBe("Recibes este email porque has reservado en Casa Pepe. Reservas con Restavor.");
    expect(emailFooter("Casa Pepe", "es", "https://restavor.com/privacidad")).toBe(
      "Recibes este email porque has reservado en Casa Pepe. Reservas con Restavor. Privacidad: https://restavor.com/privacidad",
    );
    expect(emailFooter("Casa Pepe", "en", "https://restavor.com/privacy")).toBe(
      "You're receiving this email because you booked at Casa Pepe. Bookings with Restavor. Privacy: https://restavor.com/privacy",
    );
    expect(emailFooter("Casa Pepe", "es", "javascript:alert(1)")).not.toContain("Privacidad");
    expect(renderEmail(context("confirmed", "es"), { privacyUrl: "https://restavor.com/privacidad" }).html).toContain("Privacidad: https://restavor.com/privacidad");
  });

  it("decisión 165 · el HTML escapa lo que viene de fuera y no deja pasar etiquetas ni enlaces ajenos", () => {
    const email = renderEmail(
      context("confirmed", "es", {
        customerName: '<script>alert("x")</script> & Cía',
        restaurant: { name: "Casa <b>Pepe</b>", phone: "+34954000000", address: 'Calle "Mayor" 1', email: null },
      }),
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>Pepe");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("&amp; Cía");
    expect(email.html).toContain("Calle &quot;Mayor&quot; 1");
    expect(email.html).toContain(`href="${LINK}"`);
    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it("decisión 165 · el remitente nunca rompe la cabecera `From`", () => {
    expect(emailSenderName("Casa Pepe")).toBe("Casa Pepe");
    expect(emailSenderName('Casa "Pepe" <x@y.es>, Bar; Mar: \\ \r\nBcc: a@b.es')).toBe("Casa Pepe xy.es Bar Mar Bcc ab.es");
    expect(emailSenderName("   ")).toBe("Restavor");
    expect(emailSenderName("x".repeat(100)).length).toBeLessThanOrEqual(60);
  });

  it("AVI-02 · los colores del correo son los de tokens.css (Emerald Control)", () => {
    const tokens = readFileSync(join(process.cwd(), "src", "styles", "tokens.css"), "utf8");
    const token = (name: string) => new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens)?.[1]?.toLowerCase();
    expect(EMAIL_PALETTE.background).toBe(token("background"));
    expect(EMAIL_PALETTE.surface).toBe(token("surface"));
    expect(EMAIL_PALETTE.softSurface).toBe(token("soft-surface"));
    expect(EMAIL_PALETTE.text).toBe(token("text"));
    expect(EMAIL_PALETTE.textSecondary).toBe(token("text-secondary"));
    expect(EMAIL_PALETTE.border).toBe(token("border"));
    expect(EMAIL_PALETTE.primary).toBe(token("primary"));
  });
});

describe("decisión 165 · el saneado de lo que viene de fuera", () => {
  it("decisión 165 · sin saltos de línea, sin enlaces, sin caracteres de control y con largo máximo", () => {
    expect(cleanNoticeText("  Ana\n\nGarcía \t visita https://x.example/a?b=1 y www.malo.test hoy ", 200)).toBe("Ana García visita y hoy");
    expect(cleanNoticeText("a\u0000b‮c​d", 20)).toBe("a b c d");
    expect(cleanNoticeText("x".repeat(100), 10)).toBe("xxxxxxxxxx");
    expect(cleanNoticeText("   ", 10)).toBe("");
  });

  it("decisión 165 · escapar HTML", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
});

describe("decisión 162 · la respuesta automática de WhatsApp", () => {
  it("decisión 162 · con restaurante conocido, el texto del documento en su idioma", () => {
    expect(whatsAppAutoReply("es", { name: "Casa Pepe", phone: "+34954000000" })).toBe(
      "Este número solo envía avisos y no lee mensajes. Para cualquier cosa, llama a Casa Pepe: +34954000000.",
    );
    expect(whatsAppAutoReply("en", { name: "Casa Pepe", phone: "+34954000000" })).toBe(
      "This number only sends notifications and can't read messages. For anything, please call Casa Pepe: +34954000000.",
    );
  });

  it("decisión 162 · sin saber de qué restaurante es, el texto genérico en los dos idiomas", () => {
    const text = whatsAppAutoReply(null, null);
    expect(text).toContain("Este número solo envía avisos de reservas y no lee mensajes. Llama directamente al restaurante.");
    expect(text).toContain("This number only sends booking notifications and can't read messages. Please call the restaurant directly.");
  });

  it("el documento trae los textos de la respuesta automática tal como están en el código", () => {
    expect(DOC).toContain("Este número solo envía avisos y no lee mensajes. Para cualquier cosa, llama a {restaurante}: {telefono}.");
    expect(DOC).toContain("This number only sends notifications and can't read messages. For anything, please call {restaurante}: {telefono}.");
  });
});
