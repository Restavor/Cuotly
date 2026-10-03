/**
 * `src/core/reservations/notices.ts` · los avisos a los comensales de Reservas (Fase F; PRD de agents §6.11 y
 * §10.3; RN-RES-10, RN-AGT-07).
 *
 * Todo lo que decide la base de datos con una función SQL tiene aquí su espejo —el canal, el país de un número,
 * la plantilla de cada evento, el calendario de reintentos, el enlace corto—, y un test lo comprueba contra el
 * texto de la migración 179 (`notices-migracion.test.ts`). Si alguien cambia una de las dos, el test falla.
 * La base de datos manda; esto sirve para que el servidor y las pantallas hablen igual que ella. **No decide nada en
 * producción** (el canal y la plantilla de cada aviso los decide siempre la base de datos): son una referencia
 * documentada, con sus constantes comprobadas contra la migración, que el servidor usa solo para nombres, enlaces y reintentos.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */

/** Las seis plantillas (PRD §6.11). Mandan los textos de `docs/agents/textos-avisos.md`. */
export const NOTICE_TEMPLATES = ["confirmed", "pending_received", "group_confirmed", "group_rejected", "modified", "cancelled"] as const;
export type NoticeTemplate = (typeof NOTICE_TEMPLATES)[number];

/** Los tres canales, en el orden en que se prueban: correo, WhatsApp, SMS (decisión 153). */
export const NOTICE_CHANNELS = ["email", "whatsapp", "sms"] as const;
export type NoticeChannel = (typeof NOTICE_CHANNELS)[number];

export const NOTICE_STATUSES = ["queued", "sent", "delivered", "failed", "skipped"] as const;
export type NoticeStatus = (typeof NOTICE_STATUSES)[number];

/** Por qué un aviso no salió (columna `skip_reason`). `platform_source` ya no se escribe: la plataforma no deja nada. */
export const NOTICE_SKIP_REASONS = [
  "no_balance",
  "messaging_disabled",
  "platform_source",
  "no_contact",
  "no_consent",
  "no_rate",
  "obsolete",
  "not_allowed",
  "missing_data",
] as const;
export type NoticeSkipReason = (typeof NOTICE_SKIP_REASONS)[number];

export type NoticeLanguage = "es" | "en";

export function isNoticeTemplate(value: string): value is NoticeTemplate {
  return (NOTICE_TEMPLATES as readonly string[]).includes(value);
}

export function isNoticeChannel(value: string): value is NoticeChannel {
  return (NOTICE_CHANNELS as readonly string[]).includes(value);
}

/** Todas llevan el enlace de cancelar salvo «grupo rechazado» y «reserva cancelada» (PRD §6.11). */
export function templateHasCancelLink(template: NoticeTemplate): boolean {
  return template !== "group_rejected" && template !== "cancelled";
}

/** La dirección del restaurante entra en «reserva confirmada» y «grupo aceptado»: sin ella el aviso no sale (decisión 164). */
export function templateNeedsAddress(template: NoticeTemplate): boolean {
  return template === "confirmed" || template === "group_confirmed";
}

// ---------------------------------------------------------------------------
// El canal (espejo de `reservation_notice_pick_channel()`)
// ---------------------------------------------------------------------------

export interface ChannelSwitches {
  readonly email: boolean;
  readonly whatsapp: boolean;
  readonly sms: boolean;
}

export interface ChannelInput {
  readonly email: string | null;
  readonly phone: string | null;
  /** `whatsapp_consent`: vale para WhatsApp y para SMS. */
  readonly consent: boolean;
  readonly switches: ChannelSwitches;
  /** Descarta los canales de orden menor o igual (1 correo, 2 WhatsApp, 3 SMS): el respaldo de un WhatsApp usa 2. */
  readonly afterOrder?: 0 | 1 | 2 | 3;
}

export type ChannelChoice =
  | { readonly channel: NoticeChannel; readonly reason: null }
  | { readonly channel: null; readonly reason: "messaging_disabled" | "no_consent" | "no_contact" };

/** Un fijo español (+34 8… o +34 9…) no recibe WhatsApp ni SMS; de otros países no se puede saber desde el número. */
export function isMobilePhone(phone: string | null): boolean {
  return phone !== null && !/^\+34[89]/.test(phone);
}

function present(value: string | null): boolean {
  return value !== null && value.trim() !== "";
}

/**
 * El canal de un aviso: el primero que sirva entre correo → WhatsApp → SMS, mirando solo lo que el restaurante
 * tiene activado y lo que el comensal puede recibir. Un solo canal por aviso.
 */
export function pickNoticeChannel(input: ChannelInput): ChannelChoice {
  const after = input.afterOrder ?? 0;
  const hasEmail = present(input.email);
  const phoneUsable = present(input.phone) && isMobilePhone(input.phone === null ? null : input.phone.trim());
  const canPhone = phoneUsable && input.consent;
  const emailPossible = after < 1 && hasEmail;
  const whatsappPossible = after < 2 && canPhone;
  const smsPossible = after < 3 && canPhone;

  if (emailPossible && input.switches.email) return { channel: "email", reason: null };
  if (whatsappPossible && input.switches.whatsapp) return { channel: "whatsapp", reason: null };
  if (smsPossible && input.switches.sms) return { channel: "sms", reason: null };
  if (emailPossible || whatsappPossible || smsPossible) return { channel: null, reason: "messaging_disabled" };
  if (phoneUsable && !input.consent) return { channel: null, reason: "no_consent" };
  return { channel: null, reason: "no_contact" };
}

// ---------------------------------------------------------------------------
// El país de un número (espejo de `reservation_phone_country()`) y su tarifa
// ---------------------------------------------------------------------------

/** Prefijo (sin «+») → país. Lo que no está aquí no tiene país: sin país no hay tarifa y el aviso no sale (`no_rate`). */
export const PHONE_COUNTRY_PREFIXES: ReadonlyArray<readonly [prefix: string, iso: string]> = [
  ["34", "ES"], ["351", "PT"], ["33", "FR"], ["39", "IT"], ["49", "DE"], ["44", "GB"], ["353", "IE"],
  ["31", "NL"], ["32", "BE"], ["41", "CH"], ["43", "AT"], ["376", "AD"], ["377", "MC"], ["352", "LU"],
  ["45", "DK"], ["46", "SE"], ["47", "NO"], ["358", "FI"], ["48", "PL"], ["30", "GR"], ["420", "CZ"],
  ["36", "HU"], ["40", "RO"], ["359", "BG"], ["385", "HR"], ["356", "MT"], ["357", "CY"], ["212", "MA"],
  ["1", "US"], ["52", "MX"], ["54", "AR"], ["55", "BR"], ["56", "CL"], ["57", "CO"], ["51", "PE"],
  ["58", "VE"], ["598", "UY"], ["593", "EC"], ["591", "BO"], ["595", "PY"], ["506", "CR"], ["507", "PA"],
  ["503", "SV"], ["502", "GT"], ["504", "HN"], ["505", "NI"], ["81", "JP"], ["86", "CN"], ["91", "IN"],
  ["61", "AU"], ["64", "NZ"], ["971", "AE"], ["966", "SA"], ["972", "IL"], ["90", "TR"], ["27", "ZA"],
];

/** El país de un número E.164, por el prefijo más largo que case. `null` si no se conoce. */
export function phoneCountry(phone: string): string | null {
  if (!phone.startsWith("+")) return null;
  let best: readonly [string, string] | null = null;
  for (const entry of PHONE_COUNTRY_PREFIXES) {
    if (phone.startsWith(`+${entry[0]}`) && (best === null || entry[0].length > best[0].length)) best = entry;
  }
  return best === null ? null : best[1];
}

/** El canal de la tabla de tarifas (`messaging_rates.channel`) de un canal de aviso de pago. */
export function rateChannelOf(channel: "whatsapp" | "sms"): "whatsapp_utility" | "sms" {
  return channel === "whatsapp" ? "whatsapp_utility" : "sms";
}

// ---------------------------------------------------------------------------
// De qué evento nace qué aviso (espejo de `reservation_notice_template()`)
// ---------------------------------------------------------------------------

export interface AgendaEvent {
  readonly type: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/** La plantilla que genera un evento de la agenda, o `null` si no avisa (PRD §6.8, §6.9 y §6.11). */
export function templateForEvent(event: AgendaEvent): NoticeTemplate | null {
  switch (event.type) {
    case "created":
      return event.data.status === "pending" ? "pending_received" : event.data.status === "confirmed" ? "confirmed" : null;
    case "confirmed":
      return "group_confirmed";
    case "rejected":
      return "group_rejected";
    case "cancelled":
      return "cancelled";
    case "updated": {
      if (event.data.status_from === "confirmed" && event.data.status_to === "pending") return "pending_received";
      const changed = Array.isArray(event.data.changed) ? event.data.changed : [];
      return changed.some((c) => c === "date" || c === "time" || c === "party_size") ? "modified" : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Reintentos (decisión 155)
// ---------------------------------------------------------------------------

/** Cuatro intentos como mucho: el primero al guardar y tres reintentos. */
export const NOTICE_MAX_ATTEMPTS = 4;

/** Minutos de espera tras el intento 1, 2 y 3. */
export const NOTICE_RETRY_MINUTES: readonly number[] = [1, 5, 15];

/** Cuánto se arrienda un aviso reclamado: si el servidor se cae, vuelve a la cola solo. */
export const NOTICE_LEASE_MINUTES = 5;

/** La espera tras un intento fallido, o `null` si era el último. */
export function retryDelayMinutes(attempt: number): number | null {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt >= NOTICE_MAX_ATTEMPTS) return null;
  return NOTICE_RETRY_MINUTES[attempt - 1] ?? null;
}

// ---------------------------------------------------------------------------
// El enlace del comensal (decisión 154)
// ---------------------------------------------------------------------------

/** El token del enlace tiene 32 caracteres hexadecimales en minúsculas (los 32 primeros de un UUID v4: 122 bits aleatorios). */
export const NOTICE_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

export function isNoticeToken(value: string): boolean {
  return NOTICE_TOKEN_PATTERN.test(value);
}

/** Los 32 primeros caracteres del token de la reserva: lo que va en el enlace. */
export function noticeLinkToken(cancelToken: string): string {
  return cancelToken.slice(0, 32);
}

/** `https://restavor.com/c/<token>`: sin barra final en la base y sin dobles barras. */
export function noticeUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/c/${token}`;
}

// ---------------------------------------------------------------------------
// Lo que se puede guardar de un error de proveedor
// ---------------------------------------------------------------------------

/** El error de un aviso es un CÓDIGO: el texto del proveedor puede llevar el contacto del comensal (RN-RES-12). */
export const NOTICE_ERROR_CODE_PATTERN = /^[a-z0-9_.:-]{1,60}$/;

export function isNoticeErrorCode(value: string): boolean {
  return NOTICE_ERROR_CODE_PATTERN.test(value);
}
