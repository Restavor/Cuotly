/**
 * `src/services/platform-gateway.ts` — la mitad de Supabase del panel de
 * Administración de Cuotly, Modo soporte y la 2FA (Fase 4, Hito 19).
 *
 * Aquí no se decide nada: cada función de la migración 91 comprueba quién
 * pregunta y con qué sesión (`is_platform_member()`, `is_platform_supporter()`,
 * la 2FA por `session_is_two_factor()`), y esto solo traduce.
 *
 * **Sobre `any`.** `database.types.ts` se regenera contra el proyecto real
 * cuando se aplica cada migración, y la 91 está en el repositorio sin
 * aplicar, a la espera de la orden de Bosco (como estuvo la 85). Hasta
 * entonces las funciones nuevas no existen en `Database` y el `any` se
 * aísla en esta frontera, igual que hizo `report-gateway.ts` en el Hito 16
 * — y se quita al regenerar los tipos, como se hizo entonces.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PlatformAccess, SupportAccessLevel } from "@/core/platform-admin";

/* eslint-disable @typescript-eslint/no-explicit-any --
   Frontera con las funciones de la migración 91 hasta que se regeneren los
   tipos contra el proyecto real (ver la cabecera). */
type AnyClient = SupabaseClient<any, any, any>;

async function rpc<T>(client: AnyClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface PanelSummary {
  readonly users_total: number;
  readonly spaces_total: number;
  readonly spaces_trial: number;
  readonly spaces_active: number;
  readonly spaces_archived: number;
  readonly spaces_without_plan: number;
  readonly requests_pending: number;
  readonly requests_submitted: number;
  readonly subscriptions_total: number;
  readonly revenue_total_cents: number;
  readonly revenue_month_cents: number;
  readonly overdue_charges: number;
  readonly overdue_cents: number;
  readonly declared_payments_pending: number;
  readonly storage_bytes_total: number;
  readonly activity_24h: number;
  readonly incidents: null;
  readonly support_sessions_active: number;
  readonly support_sessions_total: number;
  readonly platform_audit_total: number;
}

export interface PlatformUserRow {
  readonly id: string;
  readonly email: string;
  readonly full_name: string | null;
  readonly created_at: string;
  readonly spaces_count: number;
  readonly is_owner: boolean;
  readonly is_admin: boolean;
  readonly can_approve_spaces: boolean;
  readonly can_manage_subscriptions: boolean;
  readonly can_support: boolean;
  readonly two_factor_enrolled: boolean;
}

export interface PlatformSpaceRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly created_at: string;
  readonly cuotly_status: string | null;
  readonly cuotly_plan: string | null;
  readonly cuotly_trial_ends_at: string | null;
  readonly cuotly_archived_at: string | null;
  readonly cuotly_reactivation_deadline_at: string | null;
  readonly current_period_end: string | null;
  readonly pending_plan: string | null;
  readonly owner_emails: string | null;
  readonly active_establishments: number;
  readonly internal_users: number;
  readonly storage_bytes: number;
  readonly outstanding_cents: number;
  readonly overdue_cents: number;
  readonly has_pending_declaration: boolean;
  readonly support_active: boolean;
}

export interface PlatformChargeRow {
  readonly id: string;
  readonly space_id: string;
  readonly space_name: string;
  readonly space_slug: string;
  readonly reference: string;
  readonly concept: string;
  readonly kind: string;
  readonly total_cents: number;
  readonly outstanding_cents: number;
  readonly status: string;
  readonly period_start: string;
  readonly period_end: string;
  readonly due_at: string;
  readonly issued_at: string;
}

export interface PendingPaymentRow {
  readonly id: string;
  readonly space_id: string;
  readonly space_name: string;
  readonly charge_id: string;
  readonly charge_reference: string;
  readonly amount_cents: number;
  readonly method: string;
  readonly paid_at: string;
  readonly receipt_reference: string | null;
  readonly note: string | null;
  readonly declared_side: string;
  readonly declared_at: string;
  readonly declared_by_email: string;
}

export interface RevenueMonthRow {
  readonly month: string;
  readonly paid_cents: number;
  readonly payments: number;
}

export interface PlatformAuditRow {
  readonly id: string;
  readonly created_at: string;
  readonly space_id: string | null;
  readonly space_name: string | null;
  readonly actor_id: string | null;
  readonly actor_email: string | null;
  readonly action: string;
  readonly entity_type: string;
  readonly entity_id: string | null;
  readonly old_value: unknown;
  readonly new_value: unknown;
  readonly reason: string | null;
  readonly support_session_id: string | null;
}

export interface SupportSessionRow {
  readonly id: string;
  readonly space_id: string;
  readonly space_name: string;
  readonly space_slug: string;
  readonly actor_id: string;
  readonly actor_email: string;
  readonly reason: string;
  readonly access_level: SupportAccessLevel;
  readonly started_at: string;
  readonly expires_at: string;
  readonly ended_at: string | null;
  readonly end_note: string | null;
  readonly is_active: boolean;
  readonly actions_count: number;
}

export interface SupportActionRow {
  readonly id: string;
  readonly created_at: string;
  readonly action: string;
  readonly entity_type: string;
  readonly entity_id: string | null;
  readonly old_value: unknown;
  readonly new_value: unknown;
  readonly reason: string | null;
}

export interface MySupportSession {
  readonly id: string;
  readonly access_level: SupportAccessLevel;
  readonly reason: string;
  readonly started_at: string;
  readonly expires_at: string;
}

/** `my_platform_access()`, en las claves del dominio. */
export async function myPlatformAccess(client: AnyClient): Promise<PlatformAccess> {
  const raw = await rpc<Record<string, boolean> | null>(client, "my_platform_access");
  return {
    isOwner: raw?.is_owner === true,
    isAdmin: raw?.is_admin === true,
    canApproveSpaces: raw?.can_approve_spaces === true,
    canManageSubscriptions: raw?.can_manage_subscriptions === true,
    canSupport: raw?.can_support === true,
    twoFactor: raw?.two_factor === true,
  };
}

export function panelSummary(client: AnyClient): Promise<PanelSummary> {
  return rpc<PanelSummary>(client, "platform_panel_summary");
}

export function listUsers(client: AnyClient, limit = 200, offset = 0): Promise<readonly PlatformUserRow[]> {
  return rpc<PlatformUserRow[]>(client, "platform_list_users", { p_limit: limit, p_offset: offset });
}

export function listSpaces(client: AnyClient): Promise<readonly PlatformSpaceRow[]> {
  return rpc<PlatformSpaceRow[]>(client, "platform_list_spaces");
}

export function listCharges(client: AnyClient, openOnly = true): Promise<readonly PlatformChargeRow[]> {
  return rpc<PlatformChargeRow[]>(client, "platform_list_charges", { p_open_only: openOnly });
}

export function listPendingPayments(client: AnyClient): Promise<readonly PendingPaymentRow[]> {
  return rpc<PendingPaymentRow[]>(client, "platform_list_pending_payments");
}

export function revenueByMonth(client: AnyClient, months = 12): Promise<readonly RevenueMonthRow[]> {
  return rpc<RevenueMonthRow[]>(client, "platform_revenue_by_month", { p_months: months });
}

export function platformAudit(
  client: AnyClient,
  scope: "platform" | "all",
  limit = 50,
  offset = 0,
): Promise<readonly PlatformAuditRow[]> {
  return rpc<PlatformAuditRow[]>(client, "platform_audit", {
    p_scope: scope,
    p_limit: limit,
    p_offset: offset,
  });
}

export function listSupportSessions(client: AnyClient, limit = 100): Promise<readonly SupportSessionRow[]> {
  return rpc<SupportSessionRow[]>(client, "platform_list_support_sessions", { p_limit: limit });
}

export function supportSessionActions(client: AnyClient, sessionId: string): Promise<readonly SupportActionRow[]> {
  return rpc<SupportActionRow[]>(client, "support_session_actions", { p_session_id: sessionId });
}

export async function mySupportSession(client: AnyClient, spaceId: string): Promise<MySupportSession | null> {
  const rows = await rpc<MySupportSession[]>(client, "my_support_session", { p_space_id: spaceId });
  return rows.length > 0 ? rows[0] : null;
}

export function startSupportSession(
  client: AnyClient,
  input: {
    spaceId: string;
    reason: string;
    accessLevel: SupportAccessLevel;
    minutes: number;
    idempotencyKey: string;
  },
): Promise<string> {
  return rpc<string>(client, "start_support_session", {
    p_space_id: input.spaceId,
    p_reason: input.reason,
    p_access_level: input.accessLevel,
    p_minutes: input.minutes,
    p_idempotency_key: input.idempotencyKey,
  });
}

export function endSupportSession(client: AnyClient, sessionId: string, note: string | null): Promise<boolean> {
  return rpc<boolean>(client, "end_support_session", { p_session_id: sessionId, p_note: note });
}

export function setPlatformAdmin(
  client: AnyClient,
  input: {
    userId: string;
    canApproveSpaces: boolean;
    canManageSubscriptions: boolean;
    canSupport: boolean;
  },
): Promise<void> {
  return rpc<void>(client, "set_platform_admin", {
    p_user_id: input.userId,
    p_can_approve_spaces: input.canApproveSpaces,
    p_can_manage_subscriptions: input.canManageSubscriptions,
    p_can_support: input.canSupport,
  });
}

export function revokePlatformAdmin(client: AnyClient, userId: string): Promise<boolean> {
  return rpc<boolean>(client, "revoke_platform_admin", { p_user_id: userId });
}
