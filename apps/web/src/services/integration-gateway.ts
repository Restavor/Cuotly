/**
 * `src/services/integration-gateway.ts` — la mitad de Supabase del
 * proceso de sincronización de integraciones (Fase 3, Hito 14). Todo lo
 * que hay aquí son llamadas a funciones reservadas a `service_role`
 * (migraciones 81 y 82): reclamar ejecuciones, leer la credencial
 * cifrada, cerrar la ejecución, y la revocación remota pendiente.
 *
 * Separado de `integration-sync.ts` por lo mismo que `queue-gateway.ts`
 * lo está de `queue-runner.ts`: el runner decide y se prueba entero con
 * una interfaz falsa; aquí solo se traduce.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { MetricPoint, SyncFailureKind } from "@/core/integrations";

/* eslint-disable @typescript-eslint/no-explicit-any --
   Las funciones de la cola son SECURITY DEFINER reservadas a service_role y
   no están en `Database` (los tipos generados describen lo que puede tocar
   una sesión de usuario). El `any` se aísla en esta frontera. */
type AnyClient = SupabaseClient<any, any, any>;

async function rpc<T>(client: AnyClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export interface ClaimedRun {
  readonly run_id: string;
  readonly integration_id: string;
  readonly space_id: string;
  readonly establishment_id: string;
  readonly provider: string;
  readonly kind: "sync" | "check";
  readonly external_property_id: string | null;
  readonly period_start: string | null;
  readonly period_end: string | null;
  readonly last_success_at: string | null;
}

export interface StoredCredential {
  readonly kind: "oauth_refresh_token" | "api_key";
  readonly ciphertext: string;
  readonly key_version: number;
  readonly expires_at: string | null;
}

export interface PendingRevocation {
  readonly integration_id: string;
  readonly space_id: string;
  readonly establishment_id: string;
  readonly provider: string;
  readonly attempts: number;
}

export interface FinishRunInput {
  readonly runId: string;
  readonly outcome: "succeeded" | "failed";
  readonly failureKind?: SyncFailureKind;
  readonly error?: string;
  readonly points?: readonly MetricPoint[];
  readonly accountLabel?: string | null;
}

export interface IntegrationGateway {
  claimRuns(limit: number): Promise<readonly ClaimedRun[]>;
  readCredential(integrationId: string): Promise<StoredCredential | null>;
  finishRun(input: FinishRunInput): Promise<number>;
  pendingRevocations(limit: number): Promise<readonly PendingRevocation[]>;
  readRevokedToken(integrationId: string): Promise<Pick<StoredCredential, "ciphertext" | "key_version"> | null>;
  recordRevocationAttempt(integrationId: string, ok: boolean, error: string | null): Promise<boolean>;
  /**
   * RN-INT-10 · si el plan del establecimiento concede la vigilancia de
   * reseñas. Se pregunta para **no llamar a Google** cuando no toca; la
   * barrera de verdad la pone `record_establishment_reviews()`, que lo
   * vuelve a comprobar (CLAUDE.md: la autoridad es el servidor).
   */
  watchesReviews(establishmentId: string): Promise<boolean>;
  /** RN-INT-10, RN-INT-12 · guarda las nuevas y avisa. Devuelve cuántas eran nuevas. */
  recordReviews(integrationId: string, reviews: readonly unknown[]): Promise<number>;
}

export function createSupabaseIntegrationGateway(client: AnyClient): IntegrationGateway {
  return {
    claimRuns: (limit) => rpc<readonly ClaimedRun[]>(client, "claim_integration_runs", { p_limit: limit }),

    async readCredential(integrationId) {
      const rows = await rpc<readonly StoredCredential[]>(client, "read_integration_credential", {
        p_integration_id: integrationId,
      });
      return rows[0] ?? null;
    },

    async watchesReviews(establishmentId) {
      // Por las tablas y no por `establishment_watches_reviews()`: esa
      // función es interna (no tiene EXECUTE ni para `authenticated`) y
      // aquí se lee con `service_role`, que ve las filas directamente.
      const { data, error } = await client
        .from("subscriptions")
        .select("plan_id, plans(watches_reviews)")
        .eq("establishment_id", establishmentId)
        .eq("kind", "plan")
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(`subscriptions: ${error.message}`);
      const fila = (data ?? [])[0] as { plans?: unknown } | undefined;
      const plan = Array.isArray(fila?.plans) ? fila?.plans[0] : fila?.plans;
      return (plan as { watches_reviews?: boolean } | undefined)?.watches_reviews === true;
    },

    recordReviews: (integrationId, reviews) =>
      rpc<number>(client, "record_establishment_reviews", {
        p_integration_id: integrationId,
        p_reviews: reviews,
      }),

    finishRun: (input) =>
      rpc<number>(client, "finish_integration_run", {
        p_run_id: input.runId,
        p_outcome: input.outcome,
        p_failure_kind: input.failureKind ?? null,
        p_error: input.error ?? null,
        p_points: input.points ?? [],
        p_account_label: input.accountLabel ?? null,
      }),

    pendingRevocations: (limit) =>
      rpc<readonly PendingRevocation[]>(client, "pending_integration_revocations", { p_limit: limit }),

    async readRevokedToken(integrationId) {
      const rows = await rpc<readonly Pick<StoredCredential, "ciphertext" | "key_version">[]>(
        client,
        "read_revoked_integration_token",
        { p_integration_id: integrationId },
      );
      return rows[0] ?? null;
    },

    recordRevocationAttempt: (integrationId, ok, error) =>
      rpc<boolean>(client, "record_integration_revocation_attempt", {
        p_integration_id: integrationId,
        p_ok: ok,
        p_error: error,
      }),
  };
}

/**
 * Guardar una credencial ya cifrada, con el actor por parámetro. La llama
 * el servidor de la aplicación (la vuelta de OAuth, o el formulario de la
 * clave) con `service_role`, después de cifrar: la sesión de la persona no
 * puede ejecutar `store_integration_credential()` a propósito
 * (RN-INT-02), y la función vuelve a comprobar el permiso del actor como
 * si fuera él (RN-INT-05).
 */
export async function storeEncryptedCredential(
  client: AnyClient,
  input: {
    readonly integrationId: string;
    readonly actorId: string;
    readonly kind: "oauth_refresh_token" | "api_key";
    readonly ciphertext: string;
    readonly keyVersion: number;
    readonly expiresAt?: Date | null;
    readonly accountLabel?: string | null;
    readonly externalPropertyId?: string | null;
  },
): Promise<string> {
  return rpc<string>(client, "store_integration_credential", {
    p_integration_id: input.integrationId,
    p_actor_id: input.actorId,
    p_kind: input.kind,
    p_ciphertext: input.ciphertext,
    p_key_version: input.keyVersion,
    p_expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
    p_account_label: input.accountLabel ?? null,
    p_external_property_id: input.externalPropertyId ?? null,
  });
}
