/**
 * `src/core/agents/balance.ts` · el saldo de Restavor agents (Fase E2; PRD de agents §5.2, RN-AGT-01 a RN-AGT-09).
 *
 * El libro guarda **millonésimas de euro** (decisión 94); en pantalla se enseña al céntimo. Las cuentas de la
 * recarga —el IVA y el total— son **las mismas que hace la base de datos** (`create_agent_topup()`): medio
 * céntimo se aleja de cero. Si alguien cambia una, tiene que cambiar la otra: lo comprueba el test de este
 * archivo contra los ejemplos del test SQL (suite 94).
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */
import { localDateOf } from "@/core/reservations/dates";

/** Importes que se ofrecen de un clic (RN-AGT-04): 10, 20 y 50 €, en céntimos. */
export const TOPUP_PRESETS_CENTS = [1000, 2000, 5000] as const;

/** La recarga mínima: 10 €. */
export const MIN_TOPUP_CENTS = 1000;

/** Las millonésimas que tiene un céntimo. */
export const MICROS_PER_CENT = 10_000;

export interface TopupAmounts {
  readonly netCents: number;
  readonly vatCents: number;
  readonly totalCents: number;
}

/**
 * El IVA de un importe neto, al céntimo, con el redondeo de siempre (medio céntimo se aleja de cero). El tipo
 * puede llevar dos decimales (`spaces.tax_rate_percent` es `numeric(5, 2)`), y se calcula con enteros para no
 * arrastrar errores de coma flotante.
 */
export function vatCents(netCents: number, ratePercent: number): number {
  if (!Number.isInteger(netCents) || netCents < 0) throw new RangeError(`Importe neto no válido: ${netCents}`);
  if (!Number.isFinite(ratePercent) || ratePercent < 0) throw new RangeError(`Tipo de IVA no válido: ${ratePercent}`);
  const rateHundredths = Math.round(ratePercent * 100);
  const numerator = netCents * rateHundredths;
  const quotient = Math.floor(numerator / 10_000);
  return (numerator % 10_000) * 2 >= 10_000 ? quotient + 1 : quotient;
}

/** Lo que se paga por una recarga: lo que sube el saldo (sin IVA), el IVA y el total. */
export function topupAmounts(netCents: number, ratePercent: number): TopupAmounts {
  const vat = vatCents(netCents, ratePercent);
  return { netCents, vatCents: vat, totalCents: netCents + vat };
}

export type CustomTopupResult =
  | { readonly ok: true; readonly cents: number }
  | { readonly ok: false; readonly reason: "empty" | "invalid" | "too_small" };

/**
 * «12», «12,5» o «12.50» → céntimos. Solo euros con hasta dos decimales; nada de símbolos ni de miles. Menos de
 * 10 € no vale (RN-AGT-04).
 */
export function parseCustomTopup(input: string): CustomTopupResult {
  const text = input.trim();
  if (text === "") return { ok: false, reason: "empty" };
  if (!/^\d{1,5}([.,]\d{1,2})?$/.test(text)) return { ok: false, reason: "invalid" };
  const [whole = "0", fraction = ""] = text.replace(",", ".").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents < MIN_TOPUP_CENTS) return { ok: false, reason: "too_small" };
  return { ok: true, cents };
}

export type EurosResult =
  | { readonly ok: true; readonly cents: number }
  | { readonly ok: false; readonly reason: "empty" | "invalid" | "zero" | "negative" };

/**
 * Un importe en euros escrito a mano → céntimos, para lo que registra Restavor (recarga a mano, ajuste, devolución).
 * Con `signed` admite «-1,50» y «+4» (un ajuste puede restar); sin él, solo positivos. Cero no vale: un apunte de
 * cero no existe (RN-AGT-02).
 */
export function parseEuros(input: string, options: { readonly signed?: boolean } = {}): EurosResult {
  const text = input.trim();
  if (text === "") return { ok: false, reason: "empty" };
  const match = /^([+-])?(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(text);
  if (!match) return { ok: false, reason: "invalid" };
  const [, sign, whole = "0", fraction = ""] = match;
  if (sign === "-" && !options.signed) return { ok: false, reason: "negative" };
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents === 0) return { ok: false, reason: "zero" };
  return { ok: true, cents: sign === "-" ? -cents : cents };
}

export type MicrosResult =
  | { readonly ok: true; readonly micros: number }
  | { readonly ok: false; readonly reason: "empty" | "invalid" };

/**
 * El precio de un mensaje escrito en euros → millonésimas (RN-AGT-03: un WhatsApp cuesta menos de dos céntimos, así
 * que se admiten hasta seis decimales). «0,016» son 16.000 millonésimas. Cero vale: un aviso puede no costar nada.
 */
export function parseEurosToMicros(input: string): MicrosResult {
  const text = input.trim();
  if (text === "") return { ok: false, reason: "empty" };
  const match = /^(\d{1,3})(?:[.,](\d{1,6}))?$/.exec(text);
  if (!match) return { ok: false, reason: "invalid" };
  const [, whole = "0", fraction = ""] = match;
  return { ok: true, micros: Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0")) };
}

/** Un precio en millonésimas, en euros sin redondear al céntimo: 16.000 → «0,016 €». */
export function formatMicrosAsEuros(micros: number): string {
  if (!Number.isInteger(micros) || micros < 0) throw new RangeError(`Precio no válido: ${micros}`);
  const text = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(micros / 1_000_000);
  return `${text} €`;
}

/** Un importe en millonésimas, al céntimo (medio céntimo se aleja de cero), como `agent_balance_cents()`. */
export function microsToCents(micros: number): number {
  const cents = Math.abs(micros) / MICROS_PER_CENT;
  const rounded = Math.floor(cents + 0.5);
  return micros < 0 && rounded !== 0 ? -rounded : rounded;
}

export type BalanceState = "ok" | "low" | "empty";

/**
 * En qué punto está el saldo (RN-AGT-05 y RN-AGT-06): a 0 o menos, agotado; por debajo del umbral, bajo. Con el
 * umbral en 0 nunca hay «bajo» (Restavor lo configura).
 */
export function balanceState(balanceCents: number, thresholdCents: number): BalanceState {
  if (balanceCents <= 0) return "empty";
  if (thresholdCents > 0 && balanceCents < thresholdCents) return "low";
  return "ok";
}

/** «5 h 32 min», «12 min», «45 s»: la duración de las llamadas de un mes. */
export function formatCallTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError(`Duración no válida: ${seconds}`);
  if (seconds === 0) return "0 min";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** El primer día del mes de `now` en la zona del restaurante, `AAAA-MM-01` (lo que pide `agent_spend_summary()`). */
export function monthStart(now: Date, timeZone: string): string {
  return `${localDateOf(now, timeZone).slice(0, 7)}-01`;
}

export type SpendKind = "call" | "whatsapp" | "sms";

export interface SpendRow {
  readonly kind: SpendKind;
  readonly entries: number;
  /** Lo gastado, en céntimos y en positivo. */
  readonly cents: number;
}

export interface SpendSummary {
  readonly rows: readonly SpendRow[];
  /** Lo devuelto por mensajes que el proveedor no cobró (RN-AGT-03), en céntimos y en positivo; 0 si no hubo. */
  readonly refundedCents: number;
  readonly totalCents: number;
  readonly calls: { readonly count: number; readonly seconds: number };
}

interface RawSummary {
  readonly by_kind?: readonly { readonly kind: string; readonly entries: number; readonly micros: number }[];
  readonly calls?: { readonly count: number; readonly seconds: number };
}

const SPEND_KINDS: readonly SpendKind[] = ["call", "whatsapp", "sms"];

/**
 * Lo que devuelve `agent_spend_summary()` → lo que se enseña: el gasto del mes por tipo (llamadas, WhatsApp,
 * SMS), lo devuelto y el total. Las recargas y los ajustes no son gasto. Sin gasto no hay filas: no se inventa
 * ninguna.
 */
export function spendSummary(raw: unknown): SpendSummary {
  const data = (raw ?? {}) as RawSummary;
  const kinds = data.by_kind ?? [];
  const rows: SpendRow[] = [];
  for (const kind of SPEND_KINDS) {
    const found = kinds.find((k) => k.kind === kind);
    if (!found || found.entries === 0) continue;
    rows.push({ kind, entries: found.entries, cents: microsToCents(-found.micros) });
  }
  const refund = kinds.find((k) => k.kind === "refund");
  const refundedCents = refund ? microsToCents(refund.micros) : 0;
  const spent = rows.reduce((sum, row) => sum + row.cents, 0);
  return {
    rows,
    refundedCents,
    totalCents: spent - refundedCents,
    calls: { count: data.calls?.count ?? 0, seconds: data.calls?.seconds ?? 0 },
  };
}

export type MovementKind = "topup" | "call" | "whatsapp" | "sms" | "refund" | "adjustment" | "payout";

export const MOVEMENT_KINDS: readonly MovementKind[] = ["topup", "call", "whatsapp", "sms", "refund", "adjustment", "payout"];

export function isMovementKind(value: string): value is MovementKind {
  return (MOVEMENT_KINDS as readonly string[]).includes(value);
}

/** Si el apunte es una recarga que pagó el restaurante con la tarjeta o una que registró Restavor a mano. */
export function isCardTopup(sourceType: string | null): boolean {
  return sourceType === "topup";
}
