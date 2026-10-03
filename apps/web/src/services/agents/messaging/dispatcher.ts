/**
 * `src/services/agents/messaging/dispatcher.ts` · el motor de avisos (Fase F; PRD de agents §6.11, AVI-01).
 *
 * Por restaurante: reclama los avisos que tocan (la base de datos decide el canal, comprueba tarifa y saldo y cobra),
 * los redacta con `core/reservations/notice-texts.ts`, los envía de uno en uno y **informa** del resultado. Lo
 * llaman, con la misma lógica: el primer intento tras guardar (`after()` de las acciones de la agenda), la tarea de
 * cada minuto (la red de seguridad: reintentos y avisos que se quedaron sin enviar) y los botones de Pruebas.
 *
 *   · Nunca lanza: un fallo se anota (código, sin datos del comensal) y el aviso vuelve a la cola por su arriendo.
 *   · Un proveedor sin configurar marca el aviso como fallido con un incidente (`config`): nunca lo deja esperando.
 *   · Un WhatsApp no entregable crea su SMS de respaldo en la misma transacción; aquí se vuelve a reclamar enseguida
 *     para que el SMS salga en la misma pasada.
 *   · Si el servidor se cae justo entre enviar e informar, un WhatsApp o un SMS puede salir dos veces (los proveedores
 *     no ofrecen clave de idempotencia; el correo sí) y se cobra una (límite aceptado, decisión 155).
 */
import { noticeUrl, templateHasCancelLink } from "@/core/reservations/notices";
import { renderEmail, renderSms, renderWhatsApp, emailSenderName, type NoticeContext } from "@/core/reservations/notice-texts";

import type { ClaimedNotice, NoticeGateway, ReportResult } from "./gateway";
import type { DispatchPolicy } from "./providers";
import type { MessagingProviders, SendResult } from "./provider";

export interface DispatchDeps {
  readonly gateway: NoticeGateway;
  readonly providers: MessagingProviders;
  readonly policy: DispatchPolicy;
  /** `NEXT_PUBLIC_SITE_URL`: sin ella no se puede escribir el enlace de cancelar. */
  readonly siteUrl: string;
  readonly privacyUrl?: string | undefined;
  /** Para anotar qué pasó sin datos de nadie. Por defecto, `console.error`. */
  readonly log?: (message: string) => void;
  /**
   * Hora límite (ms desde 1970) para empezar trabajo nuevo: la tarea de cada minuto tiene 60 s y un proveedor lento
   * puede tardar 10 s por envío. Pasada la hora no se reclama nada más y lo ya reclamado sin enviar se aplaza con
   * el reintento normal (1, 5, 15 minutos) en vez de esperar al arriendo de cinco minutos.
   */
  readonly deadline?: number | undefined;
  /** El reloj, inyectable para los tests. */
  readonly now?: () => number;
}

/** Lo que la tarea de cada minuto se da para reclamar y enviar, dejando margen para informar y para los precios. */
export const DISPATCH_BUDGET_MS = 40_000;

function timeUp(deps: DispatchDeps): boolean {
  return deps.deadline !== undefined && (deps.now ?? Date.now)() >= deps.deadline;
}

export interface DispatchSummary {
  readonly claimed: number;
  readonly sent: number;
  readonly retried: number;
  readonly failed: number;
  /** WhatsApp no entregables que pasaron a SMS. */
  readonly fallbacks: number;
}

const EMPTY: DispatchSummary = { claimed: 0, sent: 0, retried: 0, failed: 0, fallbacks: 0 };

/** Cuántos avisos de un restaurante se reclaman a la vez, y cuántas pasadas como mucho en una llamada. */
export const CLAIM_BATCH = 10;
export const MAX_ROUNDS = 5;

function contextOf(item: ClaimedNotice, siteUrl: string): NoticeContext {
  return {
    template: item.template,
    language: item.language,
    customerName: item.customerName,
    date: item.date,
    time: item.time,
    partySize: item.partySize,
    restaurant: { name: item.restaurant.name, phone: item.restaurant.phone, address: item.restaurant.address, email: item.restaurant.email },
    linkUrl: siteUrl === "" ? "" : noticeUrl(siteUrl, item.linkToken),
  };
}

/** Del resultado del proveedor a lo que se le cuenta a la base de datos. */
function reportOf(result: Extract<SendResult, { ok: false }>): { readonly result: ReportResult; readonly error: string } {
  switch (result.kind) {
    case "temporary":
      return { result: "retry", error: result.code };
    case "undeliverable":
      return { result: "undeliverable", error: result.code };
    case "config":
      return { result: "config", error: result.code };
    case "permanent":
      return { result: "failed", error: result.code };
  }
}

interface SentOne {
  readonly outcome: "sent" | "retry" | "failed";
  readonly fallback: boolean;
}

async function sendOne(deps: DispatchDeps, item: ClaimedNotice): Promise<SentOne> {
  const log = deps.log ?? ((message: string) => console.error(`[avisos] ${message}`));
  const report = async (
    result: ReportResult,
    extra: { readonly provider?: string; readonly providerMessageId?: string; readonly error?: string } = {},
  ): Promise<SentOne> => {
    try {
      const reported = await deps.gateway.report({ noticeId: item.noticeId, attempt: item.attempt, result, ...extra });
      return { outcome: result === "sent" ? "sent" : result === "retry" ? "retry" : "failed", fallback: reported.fallback === true };
    } catch (error) {
      // La base de datos no contestó: el arriendo de cinco minutos devuelve el aviso a la cola. Se anota SOLO el aviso.
      log(`no se pudo informar del aviso ${item.noticeId}: ${error instanceof Error ? error.message.slice(0, 80) : "error"}`);
      return { outcome: "retry", fallback: false };
    }
  };

  const context = contextOf(item, deps.siteUrl);
  // Sin la dirección pública del sitio no se puede escribir el enlace de cancelar: es de configuración.
  if (templateHasCancelLink(item.template) && context.linkUrl === "") return report("config", { error: "no_site_url" });

  let result: SendResult;
  let providerName: string;
  switch (item.channel) {
    case "email": {
      const provider = deps.providers.email;
      providerName = provider.name;
      if (!provider.isConfigured()) return report("config", { error: `${provider.name}_not_configured` });
      const email = renderEmail(context, { privacyUrl: deps.privacyUrl });
      result = await provider.send({
        noticeId: item.noticeId,
        attempt: item.attempt,
        to: item.recipient,
        senderName: emailSenderName(item.restaurant.name),
        replyTo: item.restaurant.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      break;
    }
    case "whatsapp": {
      const provider = deps.providers.whatsapp;
      providerName = provider.name;
      if (!provider.isConfigured()) return report("config", { error: `${provider.name}_not_configured` });
      const message = renderWhatsApp(context);
      result = await provider.sendTemplate({
        noticeId: item.noticeId,
        attempt: item.attempt,
        to: item.recipient,
        templateName: message.templateName,
        language: message.language,
        variables: message.variables,
        buttonSuffix: message.button?.urlSuffix ?? null,
      });
      break;
    }
    case "sms": {
      const provider = deps.providers.sms;
      providerName = provider.name;
      if (!provider.isConfigured()) return report("config", { error: `${provider.name}_not_configured` });
      const sms = renderSms(context);
      // Un SMS que no cabe en 160 caracteres ni acortando el nombre del restaurante no se parte en dos: falla.
      if (!sms.ok) return report("failed", { error: "sms_too_long" });
      result = await provider.send({ noticeId: item.noticeId, attempt: item.attempt, to: item.recipient, text: sms.text });
      break;
    }
  }

  if (result.ok) return report("sent", { provider: providerName, providerMessageId: result.providerMessageId });
  const mapped = reportOf(result);
  return report(mapped.result, { error: mapped.error });
}

/** Sin tiempo para enviarlo: se aplaza con el reintento normal (cuenta como un intento, como un fallo temporal). */
async function deferOne(deps: DispatchDeps, item: ClaimedNotice): Promise<SentOne> {
  const log = deps.log ?? ((message: string) => console.error(`[avisos] ${message}`));
  try {
    await deps.gateway.report({ noticeId: item.noticeId, attempt: item.attempt, result: "retry", error: "deferred" });
  } catch (error) {
    log(`no se pudo aplazar el aviso ${item.noticeId}: ${error instanceof Error ? error.message.slice(0, 80) : "error"}`);
  }
  return { outcome: "retry", fallback: false };
}

/**
 * Procesa los avisos que tocan de UN restaurante. Un envío a la vez (los proveedores tienen límites de velocidad y
 * así un fallo no arrastra a los demás). Devuelve cuántos salieron, se reintentarán o fallaron.
 */
export async function dispatchEstablishmentNotices(deps: DispatchDeps, establishmentId: string): Promise<DispatchSummary> {
  const log = deps.log ?? ((message: string) => console.error(`[avisos] ${message}`));
  let summary = EMPTY;
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    if (timeUp(deps)) return summary;
    let items: readonly ClaimedNotice[];
    try {
      items = await deps.gateway.claim(establishmentId, {
        limit: CLAIM_BATCH,
        allowlist: deps.policy.allowlist,
        enforceAllowlist: deps.policy.enforceAllowlist,
        blockReserved: deps.policy.blockReservedDomains,
      });
    } catch (error) {
      log(`no se pudieron reclamar avisos de ${establishmentId}: ${error instanceof Error ? error.message.slice(0, 80) : "error"}`);
      return summary;
    }
    if (items.length === 0) return summary;

    let fallbacks = 0;
    let sent = 0;
    let retried = 0;
    let failed = 0;
    for (const item of items) {
      const done = timeUp(deps) ? await deferOne(deps, item) : await sendOne(deps, item);
      if (done.outcome === "sent") sent += 1;
      else if (done.outcome === "retry") retried += 1;
      else failed += 1;
      if (done.fallback) fallbacks += 1;
    }
    summary = {
      claimed: summary.claimed + items.length,
      sent: summary.sent + sent,
      retried: summary.retried + retried,
      failed: summary.failed + failed,
      fallbacks: summary.fallbacks + fallbacks,
    };
    // Otra pasada solo si había más que reclamar o si un WhatsApp pasó a SMS (el SMS nace en cola y toca ya).
    if (items.length < CLAIM_BATCH && fallbacks === 0) return summary;
  }
  return summary;
}

export interface PriceCheckSummary {
  readonly checked: number;
  readonly priced: number;
}

/**
 * El precio real de los SMS que aún no lo tienen (AVI-06): se pregunta al proveedor y, si ya lo sabe, la base de datos
 * corrige el cobro. Lo que el proveedor aún no sabe se vuelve a preguntar en la siguiente tarea (cada 10 minutos).
 */
export async function checkSmsPrices(deps: DispatchDeps, limit = 50): Promise<PriceCheckSummary> {
  const log = deps.log ?? ((message: string) => console.error(`[avisos] ${message}`));
  let checked = 0;
  let priced = 0;
  try {
    for (const row of await deps.gateway.pricePending(limit)) {
      if (timeUp(deps)) break;
      checked += 1;
      const price = await deps.providers.sms.fetchPrice(row.providerMessageId);
      if (price === null || price === "error") continue;
      const outcome = await deps.gateway.providerEvent({
        noticeId: row.noticeId,
        provider: row.provider,
        providerMessageId: row.providerMessageId,
        event: "price",
        priceAmount: price.amount,
        priceCurrency: price.currency,
      });
      if (outcome.outcome === "priced") priced += 1;
    }
  } catch (error) {
    log(`no se pudieron consultar los precios de los SMS: ${error instanceof Error ? error.message.slice(0, 80) : "error"}`);
  }
  return { checked, priced };
}

export interface DispatchAllSummary extends DispatchSummary {
  readonly establishments: number;
  readonly prices: PriceCheckSummary;
}

/** La tarea de cada minuto: todos los restaurantes con avisos por enviar, y luego los precios pendientes. */
export async function dispatchAllDue(base: DispatchDeps, maxEstablishments = 50): Promise<DispatchAllSummary> {
  // Un presupuesto de tiempo: los restaurantes que no entren esperan a la tarea del minuto siguiente.
  const deps: DispatchDeps = { ...base, deadline: base.deadline ?? (base.now ?? Date.now)() + DISPATCH_BUDGET_MS };
  const establishments = await deps.gateway.dueEstablishments(maxEstablishments);
  let total = EMPTY;
  for (const establishmentId of establishments) {
    if (timeUp(deps)) break;
    const one = await dispatchEstablishmentNotices(deps, establishmentId);
    total = {
      claimed: total.claimed + one.claimed,
      sent: total.sent + one.sent,
      retried: total.retried + one.retried,
      failed: total.failed + one.failed,
      fallbacks: total.fallbacks + one.fallbacks,
    };
  }
  return { ...total, establishments: establishments.length, prices: await checkSmsPrices(deps) };
}
