/**
 * `src/services/agents/messaging/gateway.ts` · las llamadas del servidor a las funciones de avisos de la base de datos
 * (Fase F; migración 179). Todas son de `service_role`: el motor de avisos, los webhooks y el enlace del comensal no
 * tienen sesión de nadie, y la puerta de cada una es el secreto del cron, la firma del proveedor o el token del enlace.
 *
 * Detrás de una interfaz (`NoticeGateway`) para que el dispatcher y los webhooks se prueben sin base de datos. Un
 * error de la base de datos lanza (quien llama decide si responde 500 para que el proveedor reintente o lo anota).
 */
import type { NoticeChannel, NoticeLanguage, NoticeTemplate } from "@/core/reservations/notices";
import { isNoticeChannel, isNoticeTemplate } from "@/core/reservations/notices";

/** Lo mínimo del cliente de Supabase que se usa: una llamada a una función. */
export interface RpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface ClaimedNotice {
  readonly noticeId: string;
  /** El intento vigente: el informe solo vale si lo repite. */
  readonly attempt: number;
  readonly template: NoticeTemplate;
  readonly channel: NoticeChannel;
  readonly language: NoticeLanguage;
  readonly recipient: string;
  readonly customerName: string;
  readonly date: string;
  readonly time: string;
  readonly partySize: number;
  readonly linkToken: string;
  readonly restaurant: {
    readonly name: string;
    readonly phone: string;
    readonly address: string | null;
    readonly city: string | null;
    readonly email: string | null;
  };
}

export type ReportResult = "sent" | "retry" | "failed" | "undeliverable" | "config";

export type ProviderEvent = "delivered" | "failed" | "undeliverable" | "not_charged" | "price";

export interface AutoReplyContext {
  readonly allowed: boolean;
  readonly found: boolean;
  readonly language: NoticeLanguage | null;
  readonly restaurant: { readonly name: string; readonly phone: string } | null;
}

export interface PricePending {
  readonly noticeId: string;
  readonly provider: string;
  readonly providerMessageId: string;
}

export interface NoticeGateway {
  dueEstablishments(limit: number): Promise<readonly string[]>;
  claim(
    establishmentId: string,
    options: { readonly limit: number; readonly allowlist: readonly string[]; readonly enforceAllowlist: boolean; readonly blockReserved: boolean },
  ): Promise<readonly ClaimedNotice[]>;
  report(input: {
    readonly noticeId: string;
    readonly attempt: number;
    readonly result: ReportResult;
    readonly provider?: string;
    readonly providerMessageId?: string;
    readonly error?: string;
  }): Promise<{ readonly outcome: string; readonly fallback?: boolean }>;
  providerEvent(input: {
    readonly noticeId: string | null;
    readonly provider: string | null;
    readonly providerMessageId: string | null;
    readonly event: ProviderEvent;
    readonly priceAmount?: number;
    readonly priceCurrency?: string;
    readonly error?: string;
  }): Promise<{ readonly outcome: string }>;
  pricePending(limit: number): Promise<readonly PricePending[]>;
  autoreplyContext(phone: string): Promise<AutoReplyContext>;
  customerView(token: string): Promise<unknown>;
  customerCancel(token: string): Promise<unknown>;
  rateLimitHit(bucket: string, max: number, windowSeconds: number): Promise<boolean>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Un aviso reclamado, tal como lo devuelve `claim_reservation_notices()`. Lo que no cuadra no se envía. */
export function parseClaimedNotice(raw: unknown): ClaimedNotice | null {
  if (!isRecord(raw)) return null;
  const restaurant = isRecord(raw.restaurant) ? raw.restaurant : null;
  const template = str(raw.template);
  const channel = str(raw.channel);
  const noticeId = str(raw.notice_id);
  const recipient = str(raw.recipient);
  const customerName = str(raw.customer_name);
  const date = str(raw.date);
  const time = str(raw.time);
  const linkToken = str(raw.link_token);
  const name = restaurant === null ? null : str(restaurant.name);
  const phone = restaurant === null ? null : str(restaurant.phone);
  if (!noticeId || !template || !isNoticeTemplate(template) || !channel || !isNoticeChannel(channel)) return null;
  if (!recipient || !customerName || !date || !time || !linkToken || !restaurant || !name || !phone) return null;
  if (typeof raw.attempt !== "number" || !Number.isInteger(raw.attempt) || typeof raw.party_size !== "number") return null;
  if (raw.language !== "es" && raw.language !== "en") return null;
  return {
    noticeId,
    attempt: raw.attempt,
    template,
    channel,
    language: raw.language,
    recipient,
    customerName,
    date,
    time,
    partySize: raw.party_size,
    linkToken,
    restaurant: { name, phone, address: str(restaurant.address), city: str(restaurant.city), email: str(restaurant.email) },
  };
}

export function parseAutoReplyContext(raw: unknown): AutoReplyContext {
  if (!isRecord(raw) || raw.allowed !== true) return { allowed: false, found: false, language: null, restaurant: null };
  if (raw.found !== true) return { allowed: true, found: false, language: null, restaurant: null };
  const name = str(raw.restaurant_name);
  const phone = str(raw.restaurant_phone);
  const language = raw.language === "es" || raw.language === "en" ? raw.language : null;
  if (!name || !phone || !language) return { allowed: true, found: false, language: null, restaurant: null };
  return { allowed: true, found: true, language, restaurant: { name, phone } };
}

export function createNoticeGateway(db: RpcClient): NoticeGateway {
  async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  }
  return {
    async dueEstablishments(limit) {
      const data = await call("reservation_notice_due_establishments", { p_limit: limit });
      return Array.isArray(data) ? data.flatMap((row) => (isRecord(row) && typeof row.establishment_id === "string" ? [row.establishment_id] : [])) : [];
    },
    async claim(establishmentId, options) {
      const data = await call("claim_reservation_notices", {
        p_establishment_id: establishmentId,
        p_limit: options.limit,
        p_allowlist: [...options.allowlist],
        p_enforce_allowlist: options.enforceAllowlist,
        p_block_reserved: options.blockReserved,
      });
      return Array.isArray(data) ? data.flatMap((item) => parseClaimedNotice(item) ?? []) : [];
    },
    async report(input) {
      const data = await call("report_reservation_notice", {
        p_notice_id: input.noticeId,
        p_attempt: input.attempt,
        p_result: input.result,
        p_provider: input.provider ?? null,
        p_provider_message_id: input.providerMessageId ?? null,
        p_error: input.error ?? null,
      });
      const outcome = isRecord(data) && typeof data.outcome === "string" ? data.outcome : "unknown";
      return { outcome, fallback: isRecord(data) && data.fallback === true };
    },
    async providerEvent(input) {
      const data = await call("reservation_notice_provider_event", {
        p_notice_id: input.noticeId,
        p_provider: input.provider,
        p_provider_message_id: input.providerMessageId,
        p_event: input.event,
        p_price_amount: input.priceAmount ?? null,
        p_price_currency: input.priceCurrency ?? null,
        p_error: input.error ?? null,
      });
      return { outcome: isRecord(data) && typeof data.outcome === "string" ? data.outcome : "unknown" };
    },
    async pricePending(limit) {
      const data = await call("reservation_notices_price_pending", { p_limit: limit });
      return Array.isArray(data)
        ? data.flatMap((row) =>
            isRecord(row) && typeof row.notice_id === "string" && typeof row.provider === "string" && typeof row.provider_message_id === "string"
              ? [{ noticeId: row.notice_id, provider: row.provider, providerMessageId: row.provider_message_id }]
              : [],
          )
        : [];
    },
    async autoreplyContext(phone) {
      return parseAutoReplyContext(await call("whatsapp_autoreply_context", { p_phone: phone }));
    },
    customerView: (token) => call("reservation_customer_view", { p_token: token }),
    customerCancel: (token) => call("reservation_customer_cancel", { p_token: token }),
    async rateLimitHit(bucket, max, windowSeconds) {
      return (await call("reservation_rate_limit_hit", { p_bucket: bucket, p_max: max, p_window_seconds: windowSeconds })) === true;
    },
  };
}
