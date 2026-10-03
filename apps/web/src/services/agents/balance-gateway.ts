/**
 * `src/services/agents/balance-gateway.ts` · la mitad de Supabase del saldo de Restavor agents (Fase E2;
 * PRD de agents §5.2 y §11; migración 176).
 *
 * Aquí no se decide nada: quién ve el saldo, cuánto vale el IVA, si una recarga se apunta o no, lo dicen
 * `agent_balance_cents()`, `create_agent_topup()`, `agent_spend_summary()`… Esto solo traduce lo que
 * devuelven a tipos de dominio y ordena la recarga con tarjeta (crear la recarga → pedir la página de pago a
 * Stripe → apuntar la sesión). `agent_balance_entries` tiene privilegios de columna: toda lectura enumera
 * sus columnas (CLAUDE.md) y nunca pide `created_by` ni `idempotency_key`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { balanceState, spendSummary, type BalanceState, type MovementKind, type SpendSummary, isMovementKind } from "@/core/agents/balance";
import type { Database } from "@/lib/supabase/database.types";

import { createCheckoutSession, StripeError, type CheckoutInput, type CheckoutSession } from "./stripe";

type Client = SupabaseClient<Database>;

export interface Movement {
  readonly id: string;
  readonly kind: MovementKind;
  readonly amountMicros: number;
  readonly note: string | null;
  readonly sourceType: string | null;
  readonly createdAt: string;
}

const MOVEMENT_COLUMNS = "id, kind, amount_micros, note, source_type, created_at";

function toMovement(row: {
  id: string;
  kind: string;
  amount_micros: number;
  note: string | null;
  source_type: string | null;
  created_at: string;
}): Movement[] {
  return isMovementKind(row.kind)
    ? [{ id: row.id, kind: row.kind, amountMicros: row.amount_micros, note: row.note, sourceType: row.source_type, createdAt: row.created_at }]
    : [];
}

/** Los últimos apuntes del libro, del más reciente al más antiguo. */
export async function loadMovements(client: Client, establishmentId: string, limit: number): Promise<readonly Movement[]> {
  const { data, error } = await client
    .from("agent_balance_entries")
    .select(MOVEMENT_COLUMNS)
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap(toMovement);
}

/** Todos los apuntes, de más antiguo a más reciente, para el Excel. Páginas de 1.000, con un tope de seguridad. */
export async function loadAllMovements(client: Client, establishmentId: string): Promise<readonly Movement[]> {
  const PAGE = 1000;
  const MAX_PAGES = 100;
  const rows: Movement[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await client
      .from("agent_balance_entries")
      .select(MOVEMENT_COLUMNS)
      .eq("establishment_id", establishmentId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []).flatMap(toMovement));
    if ((data ?? []).length < PAGE) return rows;
  }
  throw new Error("Hay demasiados apuntes para descargarlos de una vez");
}

/** Solo el estado del saldo (para las barras de Hoy): lo que hay, el umbral y si está bajo o agotado. */
export async function loadBalanceBar(
  client: Client,
  establishmentId: string,
): Promise<{ readonly balanceCents: number; readonly thresholdCents: number; readonly state: BalanceState }> {
  const [balance, settings] = await Promise.all([
    client.rpc("agent_balance_cents", { p_establishment_id: establishmentId }),
    client.from("reservation_settings").select("low_balance_threshold_cents").eq("establishment_id", establishmentId).maybeSingle(),
  ]);
  if (balance.error) throw new Error(balance.error.message);
  if (settings.error) throw new Error(settings.error.message);
  if (typeof balance.data !== "number" || !settings.data) throw new Error("Saldo no disponible");
  const thresholdCents = settings.data.low_balance_threshold_cents;
  return { balanceCents: balance.data, thresholdCents, state: balanceState(balance.data, thresholdCents) };
}

export interface BalancePageData {
  readonly balanceCents: number;
  readonly thresholdCents: number;
  readonly state: BalanceState;
  /** `null` si no hay llamadas con coste en los últimos 30 días: no se enseña ni se inventa (RN-AGT-09). */
  readonly minutes: number | null;
  readonly spend: SpendSummary;
  readonly vatRatePercent: number;
  readonly movements: readonly Movement[];
}

/** Todo lo de la pantalla de Saldo, leído con la sesión de quien mira (RLS y las funciones comprueban el permiso). */
export async function loadBalancePage(
  client: Client,
  establishmentId: string,
  monthStart: string,
  movementLimit: number,
): Promise<BalancePageData> {
  const [balance, settings, minutes, summary, vat, movements] = await Promise.all([
    client.rpc("agent_balance_cents", { p_establishment_id: establishmentId }),
    client.from("reservation_settings").select("low_balance_threshold_cents").eq("establishment_id", establishmentId).maybeSingle(),
    client.rpc("agent_minutes_estimate", { p_establishment_id: establishmentId }),
    client.rpc("agent_spend_summary", { p_establishment_id: establishmentId, p_month: monthStart }),
    client.rpc("agent_topup_vat_rate", { p_establishment_id: establishmentId }),
    loadMovements(client, establishmentId, movementLimit),
  ]);
  if (balance.error) throw new Error(balance.error.message);
  if (settings.error) throw new Error(settings.error.message);
  if (minutes.error) throw new Error(minutes.error.message);
  if (summary.error) throw new Error(summary.error.message);
  if (vat.error) throw new Error(vat.error.message);
  if (typeof balance.data !== "number" || !settings.data || typeof vat.data !== "number") throw new Error("Saldo no disponible");

  const thresholdCents = settings.data.low_balance_threshold_cents;
  return {
    balanceCents: balance.data,
    thresholdCents,
    state: balanceState(balance.data, thresholdCents),
    minutes: minutes.data,
    spend: spendSummary(summary.data),
    vatRatePercent: vat.data,
    movements,
  };
}

// ---------------------------------------------------------------------------
// La recarga con tarjeta
// ---------------------------------------------------------------------------
export type TopupFailure = "not_owner" | "too_small" | "closed" | "no_reservations" | "stripe" | "failed";

export class TopupError extends Error {
  constructor(
    readonly kind: TopupFailure,
    message: string,
  ) {
    super(message);
    this.name = "TopupError";
  }
}

/** Qué falló al crear la recarga, a partir del mensaje de la base de datos (que es la que decide). */
export function topupFailureOf(message: string): TopupFailure {
  if (/propietario/i.test(message)) return "not_owner";
  if (/mínima/i.test(message)) return "too_small";
  if (/cerrada/i.test(message)) return "closed";
  if (/no tiene Reservas/i.test(message)) return "no_reservations";
  return "failed";
}

export interface StartTopupInput {
  readonly establishmentId: string;
  readonly netCents: number;
  /** Nace con el formulario: pulsar «Pagar» dos veces es una sola recarga. */
  readonly idempotencyKey: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly customerEmail: string | null;
  readonly labels: CheckoutInput["labels"];
  readonly secretKey: string;
}

export interface StartTopupDeps {
  /** Con la sesión de quien recarga: la base de datos comprueba que es el Propietario. */
  readonly user: Client;
  /** Con la clave de servicio: apuntar la sesión de Stripe a la recarga es cosa del servidor. */
  readonly admin: Client;
  readonly createSession?: (secretKey: string, input: CheckoutInput) => Promise<CheckoutSession>;
}

/**
 * Crear la recarga → pedir la página de pago → apuntar la sesión a la recarga. Devuelve la dirección a la que
 * mandar al restaurante. Si Stripe falla, la recarga queda `created` sin sesión (inofensiva: no tiene apunte).
 */
export async function startTopup(input: StartTopupInput, deps: StartTopupDeps): Promise<{ readonly url: string }> {
  const created = await deps.user.rpc("create_agent_topup", {
    p_establishment_id: input.establishmentId,
    p_net_cents: input.netCents,
    p_idempotency_key: input.idempotencyKey,
  });
  if (created.error) throw new TopupError(topupFailureOf(created.error.message), created.error.message);
  const topup = created.data?.[0];
  if (!topup) throw new TopupError("failed", "La recarga no se ha creado");

  const createSession = deps.createSession ?? ((key, checkout) => createCheckoutSession(key, checkout));
  let session: CheckoutSession;
  try {
    session = await createSession(input.secretKey, {
      topupId: topup.topup_id,
      establishmentId: input.establishmentId,
      netCents: topup.net_cents,
      vatCents: topup.vat_cents,
      vatRatePercent: topup.vat_rate_percent,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      customerEmail: input.customerEmail,
      labels: input.labels,
    });
  } catch (error) {
    throw new TopupError("stripe", error instanceof StripeError ? error.message : "No se pudo preparar el pago");
  }

  const attached = await deps.admin.rpc("attach_topup_session", { p_topup_id: topup.topup_id, p_session_id: session.id });
  if (attached.error || attached.data !== true) {
    throw new TopupError("failed", attached.error?.message ?? "No se pudo apuntar la sesión de pago");
  }
  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Restavor: recarga a mano, ajuste y devolución
// ---------------------------------------------------------------------------
export type TeamMoneyMethod = "transfer" | "bizum" | "other";

export async function registerManualTopup(
  client: Client,
  input: { establishmentId: string; netCents: number; method: TeamMoneyMethod; note: string | null; idempotencyKey: string },
): Promise<string> {
  const { data, error } = await client.rpc("record_manual_topup", {
    p_establishment_id: input.establishmentId,
    p_net_cents: input.netCents,
    p_method: input.method,
    p_note: input.note,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function adjustBalance(
  client: Client,
  input: { establishmentId: string; amountCents: number; reason: string; idempotencyKey: string },
): Promise<string> {
  const { data, error } = await client.rpc("adjust_agent_balance", {
    p_establishment_id: input.establishmentId,
    p_amount_cents: input.amountCents,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function registerPayout(
  client: Client,
  input: { establishmentId: string; amountCents: number; note: string | null; idempotencyKey: string },
): Promise<string> {
  const { data, error } = await client.rpc("record_balance_payout", {
    p_establishment_id: input.establishmentId,
    p_amount_cents: input.amountCents,
    p_note: input.note,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function setLowBalanceThreshold(
  client: Client,
  input: { establishmentId: string; thresholdCents: number },
): Promise<void> {
  const { error } = await client.rpc("set_low_balance_threshold", {
    p_establishment_id: input.establishmentId,
    p_cents: input.thresholdCents,
  });
  if (error) throw new Error(error.message);
}
