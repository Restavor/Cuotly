/**
 * `src/services/support-gateway.ts` — la mitad de Supabase del soporte de
 * Cuotly, el centro de ayuda y la página de estado (Fase 4, Hito 21).
 *
 * Aquí no se decide nada: cada función de la migración 93 comprueba quién
 * pregunta y con qué sesión (`has_capability(…, 'contact_cuotly')`,
 * `is_platform_member()`), y esto solo traduce. Las interfaces de abajo
 * son la forma que la base devuelve, con nombre, para que las pantallas
 * no dependan de la generación.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ClientContext, IncidentKind, IncidentSide, IncidentState, StatusComponent, StatusSeverity } from "@/core/support";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;
type Functions = Database["public"]["Functions"];

async function rpc<F extends keyof Functions>(
  client: Client,
  fn: F,
  args: Functions[F]["Args"],
): Promise<Functions[F]["Returns"]> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as Functions[F]["Returns"];
}

export interface PlatformIncidentRow {
  readonly id: string;
  readonly space_id: string;
  readonly space_name: string;
  readonly space_slug: string;
  readonly space_plan: string | null;
  readonly kind: IncidentKind;
  readonly category: string;
  readonly impact: string | null;
  readonly status: IncidentState;
  readonly status_reason: string | null;
  readonly priority: string | null;
  readonly description: string;
  readonly device: string | null;
  readonly app_version: string | null;
  readonly client_context: ClientContext;
  readonly help_query: string | null;
  readonly opened_by: string;
  readonly opened_by_email: string;
  readonly opened_by_name: string | null;
  readonly opened_at: string;
  readonly first_platform_response_at: string | null;
  readonly resolved_at: string | null;
  readonly closed_at: string | null;
  readonly last_activity_at: string;
  readonly first_response_minutes: number | null;
  readonly resolution_minutes: number | null;
  readonly message_count: number;
  readonly attachment_count: number;
}

export interface PlatformIncidentMessage {
  readonly id: string;
  readonly author_side: IncidentSide;
  readonly author_id: string;
  readonly author_email: string;
  readonly author_name: string | null;
  readonly body: string;
  readonly created_at: string;
}

export function platformListIncidents(client: Client, openOnly = true): Promise<readonly PlatformIncidentRow[]> {
  return rpc(client, "platform_list_incidents", { p_open_only: openOnly }) as Promise<unknown> as Promise<
    readonly PlatformIncidentRow[]
  >;
}

export async function platformIncident(client: Client, incidentId: string): Promise<PlatformIncidentRow | null> {
  const rows = (await rpc(client, "platform_list_incidents", {
    p_open_only: false,
    p_incident_id: incidentId,
  })) as unknown as PlatformIncidentRow[];
  return rows.length > 0 ? rows[0] : null;
}

export function platformIncidentMessages(client: Client, incidentId: string): Promise<readonly PlatformIncidentMessage[]> {
  return rpc(client, "platform_incident_messages", { p_incident_id: incidentId }) as Promise<unknown> as Promise<
    readonly PlatformIncidentMessage[]
  >;
}

export interface OpenIncidentInput {
  readonly spaceId: string;
  readonly kind: IncidentKind;
  readonly category: string;
  readonly description: string;
  readonly impact: string | null;
  readonly device: string | null;
  readonly appVersion: string | null;
  readonly clientContext: ClientContext;
  readonly helpQuery: string | null;
  readonly idempotencyKey: string;
}

export function openIncident(client: Client, input: OpenIncidentInput): Promise<string> {
  return rpc(client, "open_incident", {
    p_space_id: input.spaceId,
    p_kind: input.kind,
    p_category: input.category,
    p_description: input.description,
    p_impact: input.impact ?? undefined,
    p_device: input.device ?? undefined,
    p_app_version: input.appVersion ?? undefined,
    p_client_context: input.clientContext,
    p_help_query: input.helpQuery ?? undefined,
    p_idempotency_key: input.idempotencyKey,
  });
}

export function postIncidentMessage(client: Client, incidentId: string, body: string): Promise<string> {
  return rpc(client, "post_incident_message", { p_incident_id: incidentId, p_body: body });
}

export async function setIncidentStatus(
  client: Client,
  incidentId: string,
  status: IncidentState,
  reason: string | null,
): Promise<void> {
  await rpc(client, "set_incident_status", {
    p_incident_id: incidentId,
    p_status: status,
    p_reason: reason ?? undefined,
  });
}

export function registerIncidentAttachment(
  client: Client,
  input: {
    readonly incidentId: string;
    readonly name: string;
    readonly contentType: string;
    readonly sizeBytes: number;
    readonly storagePath: string;
  },
): Promise<string> {
  return rpc(client, "register_incident_attachment", {
    p_incident_id: input.incidentId,
    p_name: input.name,
    p_content_type: input.contentType,
    p_size_bytes: input.sizeBytes,
    p_storage_path: input.storagePath,
  });
}

export interface IncidentAttention {
  readonly first_response_minutes: number | null;
  readonly resolution_minutes: number | null;
}

export async function incidentAttention(client: Client, incidentId: string): Promise<IncidentAttention | null> {
  const rows = (await rpc(client, "incident_attention", { p_incident_id: incidentId })) as unknown as IncidentAttention[];
  return rows.length > 0 ? rows[0] : null;
}

export interface HelpArticleHit {
  readonly id: string;
  readonly slug: string;
  readonly topic: string;
  readonly title: string;
  readonly excerpt: string;
  readonly audience: readonly string[];
  readonly for_my_role: boolean;
  readonly rank: number;
}

export function searchHelpArticles(
  client: Client,
  query: string,
  role: string,
  limit = 20,
): Promise<readonly HelpArticleHit[]> {
  return rpc(client, "search_help_articles", { p_query: query, p_role: role, p_limit: limit }) as Promise<unknown> as Promise<
    readonly HelpArticleHit[]
  >;
}

export function supportIsOpenNow(client: Client): Promise<boolean> {
  return rpc(client, "support_is_open_at", {});
}

/** RN-SOP-12 · la instantánea pública, ya con forma. */
export interface StatusComponentSnapshot {
  readonly component: StatusComponent;
  readonly measured: boolean;
  readonly measured_state: "operational" | "degraded" | null;
  readonly measured_detail: Readonly<Record<string, unknown>>;
  readonly declared: readonly {
    readonly severity: StatusSeverity;
    readonly title: string;
    readonly body: string | null;
    readonly started_at: string;
    /** RN-ADM-13 · un incidente de seguridad de §142 (migración 95). */
    readonly security: boolean;
  }[] | null;
}

export interface StatusEventSnapshot {
  readonly id: string;
  readonly component: StatusComponent;
  readonly severity: StatusSeverity;
  readonly title: string;
  readonly body: string | null;
  readonly started_at: string;
  readonly security: boolean;
  readonly resolved_at?: string | null;
  readonly resolution_note?: string | null;
}

export interface StatusSnapshot {
  readonly generated_at: string;
  readonly support_open_now: boolean;
  readonly components: readonly StatusComponentSnapshot[];
  readonly open_events: readonly StatusEventSnapshot[];
  readonly history: readonly StatusEventSnapshot[];
}

export async function statusSnapshot(client: Client): Promise<StatusSnapshot> {
  // Sin argumentos: `Args: never`, como `platform_panel_summary`.
  const { data, error } = await client.rpc("platform_status_snapshot");
  if (error) throw new Error(error.message);
  return data as unknown as StatusSnapshot;
}

export function declareStatusEvent(
  client: Client,
  input: { readonly component: StatusComponent; readonly severity: StatusSeverity; readonly title: string; readonly body: string | null },
): Promise<string> {
  return rpc(client, "declare_platform_status_event", {
    p_component: input.component,
    p_severity: input.severity,
    p_title: input.title,
    p_body: input.body ?? undefined,
  });
}

/**
 * RN-ADM-13 (§142, decisión 38) · declarar un incidente de seguridad: un
 * evento de estado marcado como tal y el aviso obligatorio a los
 * propietarios de los espacios afectados (todos si no se dice cuáles). El
 * texto lo escribe quien declara; la plantilla la fijará el bloque legal.
 */
export function declareSecurityIncident(
  client: Client,
  input: {
    readonly title: string;
    readonly body: string | null;
    readonly severity: StatusSeverity;
    readonly component: StatusComponent;
    readonly spaceIds: readonly string[] | null;
  },
): Promise<string> {
  return rpc(client, "declare_security_incident", {
    p_title: input.title,
    p_body: input.body ?? undefined,
    p_severity: input.severity,
    p_component: input.component,
    p_space_ids: input.spaceIds ? [...input.spaceIds] : undefined,
  });
}

export async function resolveStatusEvent(client: Client, id: string, note: string | null): Promise<void> {
  await rpc(client, "resolve_platform_status_event", { p_id: id, p_note: note ?? undefined });
}

export function addPlatformHoliday(client: Client, date: string, name: string): Promise<string> {
  return rpc(client, "add_platform_holiday", { p_date: date, p_name: name });
}

export async function retirePlatformHoliday(client: Client, id: string, reason: string): Promise<void> {
  await rpc(client, "retire_platform_holiday", { p_id: id, p_reason: reason });
}
