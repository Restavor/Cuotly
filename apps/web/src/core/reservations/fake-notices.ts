/**
 * `src/core/reservations/fake-notices.ts` · Pruebas › Mensajes con el proveedor falso (Fase F; PRD de agents §10.3,
 * decisión 159).
 *
 * El proveedor falso no tiene tabla: sus mensajes son los avisos con `provider = 'fake'`, y la pantalla de Pruebas los
 * redacta al vuelo con los datos de ahora (`reservation_fake_notices()` los devuelve con lo necesario). Aquí se leen y
 * se redactan, con los mismos textos que los canales de verdad.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */
import { noticeUrl, isNoticeChannel, isNoticeTemplate, NOTICE_STATUSES, type NoticeChannel, type NoticeLanguage, type NoticeStatus, type NoticeTemplate } from "./notices";
import { renderEmail, renderSms, renderWhatsApp, type NoticeContext } from "./notice-texts";

export interface FakeNotice {
  readonly noticeId: string;
  readonly establishmentId: string;
  readonly establishmentName: string;
  readonly template: NoticeTemplate;
  readonly channel: NoticeChannel;
  readonly language: NoticeLanguage;
  readonly status: NoticeStatus;
  readonly attempts: number;
  readonly costMicros: number | null;
  readonly priceFinal: boolean;
  readonly recipient: string;
  readonly customerName: string;
  readonly date: string;
  readonly time: string;
  readonly partySize: number;
  readonly linkToken: string;
  readonly createdAt: string;
  readonly restaurant: { readonly name: string; readonly phone: string; readonly address: string | null; readonly email: string | null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Las filas de `reservation_fake_notices()`; lo que no cuadra se descarta (no se enseña a medias). */
export function parseFakeNotices(raw: unknown): readonly FakeNotice[] {
  if (!Array.isArray(raw)) return [];
  const out: FakeNotice[] = [];
  for (const item of raw) {
    if (!isRecord(item) || !isRecord(item.restaurant)) continue;
    const template = text(item.template);
    const channel = text(item.channel);
    const status = text(item.status);
    const noticeId = text(item.notice_id);
    const establishmentId = text(item.establishment_id);
    const recipient = text(item.recipient);
    const customerName = text(item.customer_name);
    const date = text(item.date);
    const time = text(item.time);
    const linkToken = text(item.link_token);
    const createdAt = text(item.created_at);
    const name = text(item.restaurant.name);
    const phone = text(item.restaurant.phone);
    if (!noticeId || !establishmentId || !template || !isNoticeTemplate(template) || !channel || !isNoticeChannel(channel)) continue;
    if (!status || !(NOTICE_STATUSES as readonly string[]).includes(status) || !recipient || !customerName || !date || !time || !linkToken || !createdAt || !name || !phone) continue;
    if (typeof item.party_size !== "number" || (item.language !== "es" && item.language !== "en")) continue;
    out.push({
      noticeId,
      establishmentId,
      establishmentName: text(item.establishment_name) ?? name,
      template,
      channel,
      language: item.language,
      status: status as NoticeStatus,
      attempts: typeof item.attempts === "number" ? item.attempts : 0,
      costMicros: typeof item.cost_micros === "number" ? item.cost_micros : null,
      priceFinal: item.price_final === true,
      recipient,
      customerName,
      date,
      time,
      partySize: item.party_size,
      linkToken,
      createdAt,
      restaurant: { name, phone, address: text(item.restaurant.address), email: text(item.restaurant.email) },
    });
  }
  return out;
}

export interface FakeMessage {
  /** Asunto, solo en el correo. */
  readonly subject: string | null;
  readonly body: string;
  /** El enlace de cancelar del propio aviso, o `null` si ese aviso no lo lleva. */
  readonly link: string | null;
}

/** Lo que diría el aviso, con los textos de verdad. */
export function renderFakeMessage(notice: FakeNotice, siteUrl: string): FakeMessage {
  const linkUrl = noticeUrl(siteUrl, notice.linkToken);
  const context: NoticeContext = {
    template: notice.template,
    language: notice.language,
    customerName: notice.customerName,
    date: notice.date,
    time: notice.time,
    partySize: notice.partySize,
    restaurant: notice.restaurant,
    linkUrl,
  };
  if (notice.channel === "email") {
    const email = renderEmail(context);
    return { subject: email.subject, body: email.text, link: email.text.includes(linkUrl) ? linkUrl : null };
  }
  if (notice.channel === "whatsapp") {
    const whatsapp = renderWhatsApp(context);
    return { subject: null, body: whatsapp.text, link: whatsapp.button ? linkUrl : null };
  }
  const sms = renderSms(context);
  return { subject: null, body: sms.ok ? sms.text : "", link: sms.ok && sms.text.includes(linkUrl) ? linkUrl : null };
}
