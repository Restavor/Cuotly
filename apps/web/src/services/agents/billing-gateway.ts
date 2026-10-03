/**
 * `src/services/agents/billing-gateway.ts` · la mitad de Supabase de la contratación, el plan y los
 * pagos de Reservas (Fase E de Restavor agents; PRD §4.4, §6.12 y §11.1; migraciones 172 a 174).
 *
 * Aquí no se decide nada: quién ve los datos de pago, cuándo se puede dar de baja o qué cobros salen
 * en «Plan y pagos» lo dicen `reservation_payment_info()`, `request_reservations_cancellation()`,
 * `reservation_plan_charges()`… Esto solo traduce lo que devuelven a tipos de dominio. Ninguna
 * lectura toca una tabla con privilegios de columna: todo entra por funciones que comprueban quién
 * pregunta (CLAUDE.md).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PaymentInfo } from "@/core/agents/payment-info";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/** Los datos para pagar el cobro más antiguo con deuda, o `null` si no hay ninguno. */
export async function loadPaymentInfo(client: Client, establishmentId: string): Promise<PaymentInfo | null> {
  const { data, error } = await client.rpc("reservation_payment_info", { p_establishment_id: establishmentId });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) return null;
  return {
    chargeId: row.charge_id,
    concept: row.concept,
    reference: row.reference,
    baseCents: row.base_cents,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    outstandingCents: row.outstanding_cents,
    dueAt: row.due_at,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    iban: row.iban,
    bizumPhone: row.bizum_phone,
    paymentNote: row.payment_note,
    payeeName: row.payee_name,
  };
}

export type PlanChargeStatus = "paid" | "partially_paid" | "pending" | "overdue";

export interface PlanCharge {
  readonly id: string;
  readonly concept: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly totalCents: number;
  readonly outstandingCents: number;
  readonly dueAt: string;
  readonly status: PlanChargeStatus;
}

function isPlanChargeStatus(value: string): value is PlanChargeStatus {
  return value === "paid" || value === "partially_paid" || value === "pending" || value === "overdue";
}

/** Los últimos cobros de Reservas, con su deuda viva y su estado. */
export async function loadPlanCharges(client: Client, establishmentId: string): Promise<readonly PlanCharge[]> {
  const { data, error } = await client.rpc("reservation_plan_charges", { p_establishment_id: establishmentId });
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((row) =>
    isPlanChargeStatus(row.status)
      ? [
          {
            id: row.charge_id,
            concept: row.concept,
            periodStart: row.period_start,
            periodEnd: row.period_end,
            totalCents: row.total_cents,
            outstandingCents: row.outstanding_cents,
            dueAt: row.due_at,
            status: row.status,
          } satisfies PlanCharge,
        ]
      : [],
  );
}

export interface ServiceDates {
  readonly subscriptionId: string | null;
  readonly activatedAt: string | null;
  readonly endingAt: string | null;
  readonly closedAt: string | null;
  readonly dataPurgedAt: string | null;
  readonly graceDays: number;
  readonly timeZone: string;
}

/** Las fechas del ciclo de vida de un restaurante (columnas con permiso de lectura para el restaurante). */
export async function loadServiceDates(client: Client, establishmentId: string): Promise<ServiceDates | null> {
  const { data, error } = await client
    .from("reservation_settings")
    .select("subscription_id, activated_at, ending_at, closed_at, data_purged_at, grace_days, timezone")
    .eq("establishment_id", establishmentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    subscriptionId: data.subscription_id,
    activatedAt: data.activated_at,
    endingAt: data.ending_at,
    closedAt: data.closed_at,
    dataPurgedAt: data.data_purged_at,
    graceDays: data.grace_days,
    timeZone: data.timezone,
  };
}

export interface TermsStatus {
  readonly status: "pending" | "outdated" | "accepted" | "no_terms";
  readonly version: number | null;
  readonly conditions: string | null;
  readonly acceptedAt: string | null;
}

/** ¿Ha aceptado el Propietario las condiciones vigentes de Reservas? */
export async function loadTermsStatus(client: Client, subscriptionId: string): Promise<TermsStatus | null> {
  const { data, error } = await client.rpc("subscription_terms", { p_subscription_id: subscriptionId });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) return null;
  const status = row.status;
  if (status !== "pending" && status !== "outdated" && status !== "accepted" && status !== "no_terms") return null;
  return { status, version: row.current_version, conditions: row.current_conditions, acceptedAt: row.accepted_at };
}

export async function acceptReservationTerms(client: Client, establishmentId: string): Promise<void> {
  const { error } = await client.rpc("accept_reservation_terms", { p_establishment_id: establishmentId });
  if (error) throw new Error(error.message);
}

/** Darse de baja: devuelve cuándo acaba el periodo pagado. */
export async function requestCancellation(client: Client, establishmentId: string): Promise<string> {
  const { data, error } = await client.rpc("request_reservations_cancellation", { p_establishment_id: establishmentId });
  if (error) throw new Error(error.message);
  return data;
}

export async function undoCancellation(client: Client, establishmentId: string): Promise<void> {
  const { error } = await client.rpc("undo_reservations_cancellation", { p_establishment_id: establishmentId });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Lado de Restavor (el equipo del espacio): aprobar, rechazar, cerrar, reactivar y los datos de pago.
// ---------------------------------------------------------------------------

/** Aprueba una solicitud: crea la suscripción, el primer cobro y los ajustes. Devuelve la suscripción. */
export async function approveRequest(client: Client, requestId: string): Promise<string> {
  const { data, error } = await client.rpc("approve_reservation_request", { p_request_id: requestId });
  if (error) throw new Error(error.message);
  return data;
}

export async function rejectRequest(client: Client, requestId: string, reason: string): Promise<void> {
  const { error } = await client.rpc("reject_reservation_request", { p_request_id: requestId, p_reason: reason });
  if (error) throw new Error(error.message);
}

export async function closeService(client: Client, establishmentId: string, reason: string): Promise<void> {
  const { error } = await client.rpc("close_reservations_service", { p_establishment_id: establishmentId, p_reason: reason });
  if (error) throw new Error(error.message);
}

export async function reactivateClosed(client: Client, establishmentId: string): Promise<void> {
  const { error } = await client.rpc("reactivate_closed_reservations", { p_establishment_id: establishmentId });
  if (error) throw new Error(error.message);
}

export async function savePaymentDetails(
  client: Client,
  input: { readonly spaceId: string; readonly iban: string | null; readonly bizumPhone: string | null; readonly note: string | null },
): Promise<void> {
  const { error } = await client.rpc("set_space_payment_details", {
    p_space_id: input.spaceId,
    p_iban: input.iban,
    p_bizum_phone: input.bizumPhone,
    p_note: input.note,
  });
  if (error) throw new Error(error.message);
}
