/**
 * `src/core/reservations/notice-texts.ts` · lo que dice cada aviso al comensal (Fase F; PRD de agents §6.11 y §10.3,
 * AVI-02 a AVI-04). **Mandan los textos de `docs/agents/textos-avisos.md`**: seis avisos, dos idiomas y tres
 * canales. Un test compara cada uno con el literal del documento.
 *
 * Lo que viene de fuera —el nombre del comensal, el del restaurante, su dirección— pasa antes por
 * `cleanNoticeText`: sin saltos de línea, sin enlaces, con largo máximo. Lo que llega al correo se escapa como HTML;
 * lo que llega a un WhatsApp o a un SMS ya no puede romper la plantilla ni colar un enlace ajeno (decisión 165).
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */
import { formatNoticeLongDate, formatNoticeShortDate } from "./format";
import { templateHasCancelLink, type NoticeLanguage, type NoticeTemplate } from "./notices";
import { fitSms, type SmsFit } from "./sms-text";

// ---------------------------------------------------------------------------
// Lo que entra: el aviso, la reserva y el restaurante
// ---------------------------------------------------------------------------

export interface NoticeRestaurant {
  readonly name: string;
  /** El teléfono del local, en E.164: lo que el aviso dice que se llame. */
  readonly phone: string;
  readonly address: string | null;
  readonly email: string | null;
}

export interface NoticeContext {
  readonly template: NoticeTemplate;
  readonly language: NoticeLanguage;
  readonly customerName: string;
  /** `YYYY-MM-DD`, la fecha local de la reserva. */
  readonly date: string;
  /** `HH:MM`, la hora local de la reserva. */
  readonly time: string;
  readonly partySize: number;
  readonly restaurant: NoticeRestaurant;
  /** El enlace absoluto de `/c/[token]`. Se usa solo en los avisos que llevan botón o enlace de cancelar. */
  readonly linkUrl: string;
}

// ---------------------------------------------------------------------------
// Texto de fuera: saneado
// ---------------------------------------------------------------------------

/**
 * Lo que un comensal o una ficha escribió, listo para meterlo en un aviso: sin saltos de línea ni caracteres de
 * control ni de dirección de texto, sin enlaces, con los espacios colapsados y con largo máximo.
 */
export function cleanNoticeText(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]+/g, " ")
    .replace(/(?:https?:\/\/|www\.)\S*/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}

/** El nombre del remitente de un correo: sin los caracteres que rompen una cabecera `From`. */
export function emailSenderName(restaurantName: string): string {
  const cleaned = cleanNoticeText(restaurantName, 60).replace(/[<>"@,;:\\]/g, "").replace(/\s+/g, " ").trim();
  return cleaned === "" ? "Restavor" : cleaned;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Las piezas de cada aviso
// ---------------------------------------------------------------------------

interface Parts {
  readonly language: NoticeLanguage;
  readonly name: string;
  readonly restaurant: string;
  readonly phone: string;
  readonly address: string;
  readonly time: string;
  readonly people: string;
  readonly partySize: number;
  readonly longDate: string;
  readonly shortDate: string;
  readonly link: string;
}

function peoplePhrase(count: number, language: NoticeLanguage): string {
  if (language === "es") return `${count} ${count === 1 ? "persona" : "personas"}`;
  return `${count} ${count === 1 ? "person" : "people"}`;
}

function cleanPhone(phone: string): string {
  return phone.replace(/[^0-9+]/g, "").slice(0, 20);
}

function partsOf(ctx: NoticeContext): Parts {
  return {
    language: ctx.language,
    name: cleanNoticeText(ctx.customerName, 60),
    restaurant: cleanNoticeText(ctx.restaurant.name, 80),
    phone: cleanPhone(ctx.restaurant.phone),
    address: cleanNoticeText(ctx.restaurant.address ?? "", 160),
    time: ctx.time,
    people: peoplePhrase(ctx.partySize, ctx.language),
    partySize: ctx.partySize,
    longDate: formatNoticeLongDate(ctx.date, ctx.language),
    shortDate: formatNoticeShortDate(ctx.date, ctx.language),
    link: ctx.linkUrl,
  };
}

// ---------------------------------------------------------------------------
// Correo (AVI-02)
// ---------------------------------------------------------------------------

type Block =
  | { readonly kind: "p"; readonly text: string }
  | { readonly kind: "box"; readonly title: string; readonly lines: readonly string[]; readonly plain: string }
  | { readonly kind: "link"; readonly lead: string; readonly label: string; readonly url: string }
  | { readonly kind: "sign"; readonly lines: readonly string[] };

interface EmailDraft {
  readonly subject: string;
  readonly blocks: readonly Block[];
}

function detailsBox(p: Parts): Block {
  const place = p.address === "" ? p.restaurant : `${p.restaurant} · ${p.address}`;
  return {
    kind: "box",
    title: `${p.longDate} · ${p.time}`,
    lines: [p.people, place],
    plain: `${p.longDate} · ${p.time} — ${p.people} — ${place}`,
  };
}

function emailDraft(template: NoticeTemplate, p: Parts): EmailDraft {
  const es = p.language === "es";
  switch (template) {
    case "confirmed":
      return es
        ? {
            subject: `Tu reserva en ${p.restaurant} está confirmada`,
            blocks: [
              { kind: "p", text: `Hola, ${p.name}:` },
              { kind: "p", text: "Tu reserva está confirmada." },
              detailsBox(p),
              { kind: "link", lead: "¿No puedes venir?", label: "Cancela tu reserva aquí", url: p.link },
              { kind: "p", text: `Para cualquier cambio, llámanos al ${p.phone}.` },
              { kind: "sign", lines: ["¡Hasta pronto!", p.restaurant] },
            ],
          }
        : {
            subject: `Your booking at ${p.restaurant} is confirmed`,
            blocks: [
              { kind: "p", text: `Hi ${p.name},` },
              { kind: "p", text: "Your booking is confirmed." },
              detailsBox(p),
              { kind: "link", lead: "Can't make it?", label: "Cancel your booking here", url: p.link },
              { kind: "p", text: `For any changes, call us on ${p.phone}.` },
              { kind: "sign", lines: ["See you soon!", p.restaurant] },
            ],
          };
    case "pending_received":
      return es
        ? {
            subject: `Hemos recibido tu solicitud en ${p.restaurant}`,
            blocks: [
              {
                kind: "p",
                text: `Hola, ${p.name}: hemos recibido tu solicitud para ${p.people} el ${p.longDate} a las ${p.time}. El restaurante te llamará para confirmarla. Todavía no es una reserva confirmada.`,
              },
              { kind: "link", lead: "", label: "Si ya no la necesitas", url: p.link },
            ],
          }
        : {
            subject: `We've received your request at ${p.restaurant}`,
            blocks: [
              {
                kind: "p",
                text: `Hi ${p.name}, we've received your request for ${p.people} on ${p.longDate} at ${p.time}. The restaurant will call you to confirm it. It is not a confirmed booking yet.`,
              },
              { kind: "link", lead: "", label: "If you no longer need it", url: p.link },
            ],
          };
    case "group_confirmed":
      return es
        ? {
            subject: `¡Tu reserva en ${p.restaurant} está confirmada!`,
            blocks: [
              { kind: "p", text: `¡Buenas noticias, ${p.name}! Tu reserva para ${p.people} está confirmada.` },
              detailsBox(p),
              { kind: "link", lead: "¿No puedes venir?", label: "Cancela tu reserva aquí", url: p.link },
              { kind: "p", text: `Para cualquier cambio, llámanos al ${p.phone}.` },
              { kind: "sign", lines: ["¡Hasta pronto!", p.restaurant] },
            ],
          }
        : {
            subject: `Your booking at ${p.restaurant} is confirmed!`,
            blocks: [
              { kind: "p", text: `Good news, ${p.name}! Your booking for ${p.people} is confirmed.` },
              detailsBox(p),
              { kind: "link", lead: "Can't make it?", label: "Cancel your booking here", url: p.link },
              { kind: "p", text: `For any changes, call us on ${p.phone}.` },
              { kind: "sign", lines: ["See you soon!", p.restaurant] },
            ],
          };
    case "group_rejected":
      return es
        ? {
            subject: `Tu solicitud en ${p.restaurant}`,
            blocks: [
              {
                kind: "p",
                text: `Hola, ${p.name}: lo sentimos, no podemos atender tu solicitud para ${p.people} el ${p.longDate} a las ${p.time}. Si quieres buscar otra fecha, llámanos al ${p.phone}.`,
              },
            ],
          }
        : {
            subject: `Your request at ${p.restaurant}`,
            blocks: [
              {
                kind: "p",
                text: `Hi ${p.name}, we're sorry, we can't accommodate your request for ${p.people} on ${p.longDate} at ${p.time}. To find another date, call us on ${p.phone}.`,
              },
            ],
          };
    case "modified":
      return es
        ? {
            subject: `Hemos cambiado tu reserva en ${p.restaurant}`,
            blocks: [
              { kind: "p", text: `Hola, ${p.name}: tu reserva ahora es: ${p.longDate} · ${p.time} · ${p.people}.` },
              { kind: "link", lead: `Si no te encaja, llámanos al ${p.phone} o`, label: "cancela aquí", url: p.link },
            ],
          }
        : {
            subject: `Your booking at ${p.restaurant} has changed`,
            blocks: [
              { kind: "p", text: `Hi ${p.name}, your booking is now: ${p.longDate} · ${p.time} · ${p.people}.` },
              { kind: "link", lead: `If it doesn't suit you, call us on ${p.phone} or`, label: "cancel here", url: p.link },
            ],
          };
    case "cancelled":
      return es
        ? {
            subject: `Tu reserva en ${p.restaurant} está cancelada`,
            blocks: [
              {
                kind: "p",
                text: `Hola, ${p.name}: tu reserva del ${p.longDate} a las ${p.time} para ${p.people} está cancelada. Si es un error o quieres otra fecha, llámanos al ${p.phone}.`,
              },
            ],
          }
        : {
            subject: `Your booking at ${p.restaurant} has been cancelled`,
            blocks: [
              {
                kind: "p",
                text: `Hi ${p.name}, your booking on ${p.longDate} at ${p.time} for ${p.people} has been cancelled. If this is a mistake or you'd like another date, call us on ${p.phone}.`,
              },
            ],
          };
  }
}

/** El pie de todos los correos. Sin enlace de privacidad configurado, no se inventa uno (decisión 165). */
export function emailFooter(restaurantName: string, language: NoticeLanguage, privacyUrl?: string): string {
  const name = cleanNoticeText(restaurantName, 80);
  const privacy = privacyUrl !== undefined && /^https?:\/\/\S+$/i.test(privacyUrl) ? privacyUrl : null;
  if (language === "es") {
    return `Recibes este email porque has reservado en ${name}. Reservas con Restavor.${privacy ? ` Privacidad: ${privacy}` : ""}`;
  }
  return `You're receiving this email because you booked at ${name}. Bookings with Restavor.${privacy ? ` Privacy: ${privacy}` : ""}`;
}

/**
 * Los colores del correo son los de `tokens.css` (Emerald Control), copiados aquí porque un correo no puede leer una
 * hoja de estilos: `notice-texts.test.ts` lee `tokens.css` y falla si alguno se separa.
 */
export const EMAIL_PALETTE = {
  background: "#f5f7f4",
  surface: "#ffffff",
  softSurface: "#eaf0ec",
  text: "#17211f",
  textSecondary: "#66736e",
  border: "#dde5e1",
  primary: "#145c4e",
} as const;

export interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export function renderEmail(ctx: NoticeContext, options: { readonly privacyUrl?: string } = {}): RenderedEmail {
  const p = partsOf(ctx);
  const draft = emailDraft(ctx.template, p);
  const footer = emailFooter(ctx.restaurant.name, ctx.language, options.privacyUrl);
  const c = EMAIL_PALETTE;

  const textParts = draft.blocks.map((b) => {
    switch (b.kind) {
      case "p":
        return b.text;
      case "box":
        return b.plain;
      case "link":
        return `${b.lead === "" ? "" : `${b.lead} `}${b.label}: ${b.url}`;
      case "sign":
        return b.lines.join("\n");
    }
  });
  const text = `${textParts.join("\n\n")}\n\n--\n${footer}\n`;

  const htmlBlocks = draft.blocks.map((b) => {
    switch (b.kind) {
      case "p":
        return `<p style="margin:0">${escapeHtml(b.text)}</p>`;
      case "box":
        return (
          `<div style="border:1px solid ${c.border};border-radius:12px;padding:14px 16px;background:${c.softSurface}">` +
          `<strong style="font-size:17px">${escapeHtml(b.title)}</strong>` +
          b.lines.map((l) => `<br>${escapeHtml(l)}`).join("") +
          `</div>`
        );
      case "link":
        return (
          `<p style="margin:0">${b.lead === "" ? "" : `${escapeHtml(b.lead)} `}` +
          `<a href="${escapeHtml(b.url)}" style="color:${c.primary};font-weight:700">${escapeHtml(b.label)}</a>.</p>`
        );
      case "sign":
        return `<p style="margin:0">${b.lines.map(escapeHtml).join("<br>")}</p>`;
    }
  });
  const html =
    `<!doctype html><html lang="${ctx.language}"><head><meta charset="utf-8"><title>${escapeHtml(draft.subject)}</title></head>` +
    `<body style="margin:0;background:${c.background};color:${c.text};font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">` +
    `<div style="max-width:560px;margin:0 auto;padding:20px 16px">` +
    `<div style="background:${c.surface};border-radius:14px;padding:22px 20px;font-size:16px;line-height:1.5;display:flex;flex-direction:column;gap:16px">` +
    htmlBlocks.join("") +
    `</div>` +
    `<p style="margin:14px 4px 0;font-size:12px;line-height:1.5;color:${c.textSecondary}">${escapeHtml(footer)}</p>` +
    `</div></body></html>`;

  return { subject: draft.subject, text, html };
}

// ---------------------------------------------------------------------------
// WhatsApp (AVI-03): una plantilla de Meta (categoría «utilidad») por aviso e idioma
// ---------------------------------------------------------------------------

/** Lo que va en cada hueco `{{n}}` de una plantilla de WhatsApp. */
export type WhatsAppVariable = "name" | "restaurant" | "details" | "address" | "phone" | "request" | "when";

export interface WhatsAppTemplateSpec {
  /** El nombre de la plantilla en Meta. El mismo para los dos idiomas: cada idioma es una traducción suya. */
  readonly name: string;
  /** El cuerpo tal como se da de alta en Meta, con `{{1}}`… (máximo 5; ni empieza ni acaba en variable). */
  readonly body: string;
  readonly variables: readonly WhatsAppVariable[];
  /** El texto del botón de URL dinámica, o `null` si la plantilla no lleva botón. */
  readonly button: string | null;
}

export const WHATSAPP_MAX_VARIABLES = 5;

const D: readonly WhatsAppVariable[] = ["name", "restaurant", "details", "address", "phone"];

export const WHATSAPP_TEMPLATES: Readonly<Record<NoticeTemplate, Readonly<Record<NoticeLanguage, WhatsAppTemplateSpec>>>> = {
  confirmed: {
    es: { name: "restavor_confirmed", body: "Hola, {{1}}. Tu reserva en {{2}} está confirmada: {{3}}. {{4}}. ¿Algún cambio? Llama al {{5}}.", variables: D, button: "Cancelar mi reserva" },
    en: { name: "restavor_confirmed", body: "Hi {{1}}. Your booking at {{2}} is confirmed: {{3}}. {{4}}. Any changes? Call {{5}}.", variables: D, button: "Cancel my booking" },
  },
  pending_received: {
    es: {
      name: "restavor_pending_received",
      body: "Hola, {{1}}. Hemos recibido tu solicitud en {{2}} para {{3}}. El restaurante te llamará para confirmarla. Todavía no es una reserva confirmada.",
      variables: ["name", "restaurant", "request"],
      button: "Cancelar mi solicitud",
    },
    en: {
      name: "restavor_pending_received",
      body: "Hi {{1}}. We've received your request at {{2}} for {{3}}. The restaurant will call you to confirm. It is not a confirmed booking yet.",
      variables: ["name", "restaurant", "request"],
      button: "Cancel my request",
    },
  },
  group_confirmed: {
    es: { name: "restavor_group_confirmed", body: "¡Buenas noticias, {{1}}! {{2}} ha confirmado tu reserva: {{3}}. {{4}}. ¿Algún cambio? Llama al {{5}}.", variables: D, button: "Cancelar mi reserva" },
    en: { name: "restavor_group_confirmed", body: "Good news, {{1}}! {{2}} has confirmed your booking: {{3}}. {{4}}. Any changes? Call {{5}}.", variables: D, button: "Cancel my booking" },
  },
  group_rejected: {
    es: {
      name: "restavor_group_rejected",
      body: "Hola, {{1}}. Lo sentimos, {{2}} no puede atender tu solicitud para {{3}}. Para buscar otra fecha, llama al {{4}}.",
      variables: ["name", "restaurant", "request", "phone"],
      button: null,
    },
    en: {
      name: "restavor_group_rejected",
      body: "Hi {{1}}. We're sorry, {{2}} can't accommodate your request for {{3}}. To find another date, call {{4}}.",
      variables: ["name", "restaurant", "request", "phone"],
      button: null,
    },
  },
  modified: {
    es: {
      name: "restavor_modified",
      body: "Hola, {{1}}. Hemos cambiado tu reserva en {{2}}. Ahora es: {{3}}. Si no te encaja, llama al {{4}}.",
      variables: ["name", "restaurant", "details", "phone"],
      button: "Cancelar mi reserva",
    },
    en: {
      name: "restavor_modified",
      body: "Hi {{1}}. Your booking at {{2}} has changed. It is now: {{3}}. If it doesn't suit you, call {{4}}.",
      variables: ["name", "restaurant", "details", "phone"],
      button: "Cancel my booking",
    },
  },
  cancelled: {
    es: {
      name: "restavor_cancelled",
      body: "Hola, {{1}}. Tu reserva en {{2}} del {{3}} está cancelada. Si es un error, llama al {{4}}.",
      variables: ["name", "restaurant", "when", "phone"],
      button: null,
    },
    en: {
      name: "restavor_cancelled",
      body: "Hi {{1}}. Your booking at {{2}} on {{3}} has been cancelled. If this is a mistake, call {{4}}.",
      variables: ["name", "restaurant", "when", "phone"],
      button: null,
    },
  },
};

function whatsAppValue(variable: WhatsAppVariable, p: Parts): string {
  const es = p.language === "es";
  switch (variable) {
    case "name":
      return p.name;
    case "restaurant":
      return p.restaurant;
    case "details":
      return `${p.longDate} · ${p.time} · ${p.people}`;
    case "address":
      return p.address;
    case "phone":
      return p.phone;
    case "request":
      return es ? `${p.people} el ${p.longDate} a las ${p.time}` : `${p.people} on ${p.longDate} at ${p.time}`;
    case "when":
      return es ? `${p.longDate} a las ${p.time} para ${p.people}` : `${p.longDate} at ${p.time} for ${p.people}`;
  }
}

export interface RenderedWhatsApp {
  readonly templateName: string;
  readonly language: NoticeLanguage;
  /** Los valores de `{{1}}`… en orden. Ninguno lleva saltos de línea. */
  readonly variables: readonly string[];
  /** El mensaje tal como lo lee quien lo recibe: el cuerpo con las variables puestas. */
  readonly text: string;
  /** El texto del botón y lo que va al final de su URL (el token), o `null` si la plantilla no lleva botón. */
  readonly button: { readonly label: string; readonly urlSuffix: string } | null;
}

/** Una variable de Meta no puede llevar saltos de línea, tabuladores ni más de cuatro espacios seguidos, ni quedar vacía. */
function whatsAppSafe(value: string): string {
  const cleaned = value.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return cleaned === "" ? "-" : cleaned;
}

export function renderWhatsApp(ctx: NoticeContext): RenderedWhatsApp {
  const p = partsOf(ctx);
  const spec = WHATSAPP_TEMPLATES[ctx.template][ctx.language];
  const variables = spec.variables.map((v) => whatsAppSafe(whatsAppValue(v, p)));
  const text = spec.body.replace(/\{\{(\d)\}\}/g, (_, n: string) => variables[Number(n) - 1] ?? "");
  const token = ctx.linkUrl.split("/c/")[1] ?? "";
  const button = spec.button !== null && templateHasCancelLink(ctx.template) ? { label: spec.button, urlSuffix: token } : null;
  return { templateName: spec.name, language: ctx.language, variables, text, button };
}

/** La respuesta automática a quien contesta al WhatsApp de Restavor (decisión 162). */
export function whatsAppAutoReply(language: NoticeLanguage | null, restaurant: { readonly name: string; readonly phone: string } | null): string {
  if (restaurant === null || language === null) {
    return "Este número solo envía avisos de reservas y no lee mensajes. Llama directamente al restaurante.\n\nThis number only sends booking notifications and can't read messages. Please call the restaurant directly.";
  }
  const name = cleanNoticeText(restaurant.name, 80);
  const phone = cleanPhone(restaurant.phone);
  return language === "es"
    ? `Este número solo envía avisos y no lee mensajes. Para cualquier cosa, llama a ${name}: ${phone}.`
    : `This number only sends notifications and can't read messages. For anything, please call ${name}: ${phone}.`;
}

// ---------------------------------------------------------------------------
// SMS (AVI-04): sin tildes ni eñes, un solo mensaje de 160 caracteres
// ---------------------------------------------------------------------------

function smsBody(template: NoticeTemplate, p: Parts, restaurant: string): string {
  const n = p.partySize;
  const when = `${p.shortDate} ${p.time}`;
  if (p.language === "es") {
    switch (template) {
      case "confirmed":
        return `${restaurant}: reserva confirmada ${when}, ${n} pers. Cambios: ${p.phone}. Cancelar: ${p.link}`;
      case "pending_received":
        return `${restaurant}: solicitud recibida ${when}, ${n} pers. Te llamaremos para confirmar. Cancelar: ${p.link}`;
      case "group_confirmed":
        return `${restaurant}: grupo confirmado ${when}, ${n} pers. Cambios: ${p.phone}. Cancelar: ${p.link}`;
      case "group_rejected":
        return `${restaurant}: no podemos atender tu solicitud del ${when} (${n} pers). Llama al ${p.phone} para otra fecha.`;
      case "modified":
        return `${restaurant}: tu reserva ahora es ${when}, ${n} pers. Dudas: ${p.phone}. Cancelar: ${p.link}`;
      case "cancelled":
        return `${restaurant}: reserva cancelada ${when}, ${n} pers. Si es un error: ${p.phone}`;
    }
  }
  switch (template) {
    case "confirmed":
      return `${restaurant}: booking confirmed ${when}, ${n} ppl. Changes: ${p.phone}. Cancel: ${p.link}`;
    case "pending_received":
      return `${restaurant}: request received ${when}, ${n} ppl. We'll call you to confirm. Cancel: ${p.link}`;
    case "group_confirmed":
      return `${restaurant}: group confirmed ${when}, ${n} ppl. Changes: ${p.phone}. Cancel: ${p.link}`;
    case "group_rejected":
      return `${restaurant}: we can't accommodate your request on ${when} (${n} ppl). Call ${p.phone} for another date.`;
    case "modified":
      return `${restaurant}: your booking is now ${when}, ${n} ppl. Questions: ${p.phone}. Cancel: ${p.link}`;
    case "cancelled":
      return `${restaurant}: booking cancelled ${when}, ${n} ppl. If this is a mistake: ${p.phone}`;
  }
}

/** El SMS de un aviso, o `too_long` si ni acortando el nombre del restaurante cabe en 160 caracteres. */
export function renderSms(ctx: NoticeContext): SmsFit {
  const p = partsOf(ctx);
  return fitSms((restaurant) => smsBody(ctx.template, p, restaurant), p.restaurant);
}
