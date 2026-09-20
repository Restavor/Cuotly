/**
 * `src/services/integration-sync.ts` — el proceso que ejecuta las
 * sincronizaciones y comprobaciones de las integraciones y la revocación
 * remota pendiente (RN-INT-06, RN-INT-08, RN-INT-09; Fase 3, Hito 14).
 *
 * Lo llama la misma tanda que el resto de la cola (`/api/cola`), con
 * `service_role`: la aplicación no sincroniza desde una pantalla y no
 * existe "Sincronizar ahora" (RN-INT-03). Qué toca sincronizar lo decide
 * `claim_integration_runs()` en la base; qué estado queda lo decide
 * `finish_integration_run()`. Aquí se hace lo que SQL no puede: descifrar
 * la credencial (`credential-vault.ts`), refrescar el token de acceso de
 * Google, llamar a la fuente por su adaptador y pasar el error por el
 * filtro de secretos antes de devolverlo (RN-INT-08).
 *
 * Todo lo externo entra por `SyncDeps`, así que el proceso se prueba
 * entero sin base de datos, sin bóveda real y sin red.
 *
 * Dos decisiones que conviene leer antes de tocar esto:
 *
 *   · Sin bóveda configurada NO se reclama nada. Reclamar y fallar
 *     dejaría cada integración en "Requiere atención" y avisaría a todo
 *     el mundo por un problema de despliegue, no de la fuente. Se
 *     devuelve el motivo y la tanda sigue con lo demás.
 *   · Una ejecución que falla no tumba a las siguientes, y un fallo al
 *     CERRARLA tampoco: se cuenta y se sigue. `finish_integration_run()`
 *     es idempotente (CA-17), así que si se cierra dos veces no pasa nada.
 */

import {
  type MetricPoint,
  type SyncFailureKind,
  isIntegrationProvider,
  isMetricOf,
  sanitizeSyncError,
} from "@/core/integrations";

import { VaultError, type CredentialVault } from "./credential-vault";
import { GoogleOAuthError } from "./google-oauth";
import type { ClaimedRun, IntegrationGateway } from "./integration-gateway";
import { AdapterFailure, type AdapterContext, type IntegrationAdapter } from "./integrations/adapter";

export interface OAuthClient {
  refresh(refreshToken: string): Promise<string>;
  revoke(token: string): Promise<"revoked" | "already_invalid">;
}

export interface SyncDeps {
  readonly gateway: IntegrationGateway;
  /** `null` cuando `INTEGRATIONS_VAULT_KEY` no está: entonces no se reclama nada. */
  readonly vault: CredentialVault | null;
  readonly adapterFor: (provider: string) => IntegrationAdapter | undefined;
  /** `null` cuando el cliente OAuth de Google no está configurado. */
  readonly oauth: OAuthClient | null;
  readonly fetchImpl: typeof fetch;
  readonly now: () => Date;
}

export interface IntegrationSyncResult {
  readonly claimed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly pointsWritten: number;
  /** Puntos que el adaptador devolvió con una métrica fuera de su catálogo: no se guardan. */
  readonly droppedPoints: number;
  readonly skipped: "vault_not_configured" | null;
}

/** Cuántas ejecuciones por tanda: una sincronización de GA4 son seis llamadas, y la tanda tiene un minuto. */
export const RUNS_PER_BATCH = 5;

class RunFailure extends Error {
  constructor(
    message: string,
    readonly failureKind: SyncFailureKind,
  ) {
    super(message);
    this.name = "RunFailure";
  }
}

function toFailure(error: unknown): RunFailure {
  if (error instanceof RunFailure) return error;
  if (error instanceof AdapterFailure) return new RunFailure(error.message, error.failureKind);
  if (error instanceof GoogleOAuthError) return new RunFailure(error.message, error.kind);
  if (error instanceof VaultError) {
    // Una credencial que no se descifra no se arregla reintentando: hace
    // falta una persona (volver a autorizar) o la clave anterior.
    return new RunFailure(error.message, error.reason === "not_configured" ? "transient" : "configuration");
  }
  return new RunFailure(error instanceof Error ? error.message : String(error), "transient");
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayAfter(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return isoDate(d);
}

/** El secreto con el que se llama a la fuente: la clave tal cual, o un token de acceso recién refrescado. */
async function resolveSecret(deps: SyncDeps, vault: CredentialVault, integrationId: string): Promise<string> {
  const credential = await deps.gateway.readCredential(integrationId);
  if (credential === null) {
    throw new RunFailure("La integración no tiene ninguna credencial vigente: hay que volver a autorizarla", "authorization");
  }
  const plain = vault.decrypt(credential.ciphertext, credential.key_version);
  if (credential.kind === "api_key") return plain;
  if (deps.oauth === null) {
    throw new RunFailure("El cliente OAuth de Google no está configurado en este entorno (GOOGLE_OAUTH_CLIENT_ID)", "configuration");
  }
  return deps.oauth.refresh(plain);
}

async function executeRun(
  deps: SyncDeps,
  vault: CredentialVault,
  run: ClaimedRun,
): Promise<{ points: readonly MetricPoint[]; dropped: number; accountLabel: string | null }> {
  if (!isIntegrationProvider(run.provider)) {
    throw new RunFailure(`La fuente "${run.provider}" no existe (RN-INT-01)`, "configuration");
  }
  const adapter = deps.adapterFor(run.provider);
  if (adapter === undefined) {
    throw new RunFailure(`La fuente "${run.provider}" no tiene adaptador`, "configuration");
  }

  const secret = await resolveSecret(deps, vault, run.integration_id);
  const today = run.period_end === null ? isoDate(deps.now()) : dayAfter(run.period_end);
  // RN-INT-10 · solo se le pregunta a Business Profile: las otras cuatro
  // fuentes no tienen reseñas y preguntar por su plan sería una consulta
  // por sincronización a cambio de nada.
  const vigila =
    run.kind === "sync" && run.provider === "business_profile"
      ? await deps.gateway.watchesReviews(run.establishment_id)
      : false;
  const ctx: AdapterContext = {
    provider: run.provider,
    secret,
    propertyId: run.external_property_id,
    window: { from: run.period_start ?? today, to: run.period_end ?? today },
    today,
    fetchImpl: deps.fetchImpl,
    watchesReviews: vigila,
  };

  if (run.kind === "check") {
    const result = await adapter.check(ctx);
    return { points: [], dropped: 0, accountLabel: result.accountLabel };
  }

  const result = await adapter.sync(ctx);
  const provider = run.provider;
  const points = result.points.filter((p) => isMetricOf(provider, p.metric));

  /*
    RN-INT-10, RN-INT-12 · las reseñas se guardan **aparte de los puntos**
    y con su propia llamada, porque no son puntos: `finish_integration_run`
    escribe métricas y no sabe de reseñas.

    Y va **antes** de cerrar la ejecución a propósito: si guardarlas falla,
    la ejecución falla con su motivo en vez de cerrarse en verde habiendo
    perdido las reseñas del día sin que nadie se entere.
  */
  if (result.reviews !== undefined && result.reviews.length > 0) {
    await deps.gateway.recordReviews(
      run.integration_id,
      result.reviews.map((review) => ({
        external_id: review.externalId,
        rating: review.rating,
        comment: review.comment,
        author_name: review.authorName,
        reviewed_at: review.reviewedAt,
        reply_comment: review.replyComment,
        replied_at: review.repliedAt,
      })),
    );
  }

  return { points, dropped: result.points.length - points.length, accountLabel: result.accountLabel };
}

export async function runIntegrationSyncs(
  deps: SyncDeps,
  limit = RUNS_PER_BATCH,
): Promise<IntegrationSyncResult> {
  if (deps.vault === null) {
    return { claimed: 0, succeeded: 0, failed: 0, pointsWritten: 0, droppedPoints: 0, skipped: "vault_not_configured" };
  }
  const vault = deps.vault;
  const runs = await deps.gateway.claimRuns(limit);

  let succeeded = 0;
  let failed = 0;
  let pointsWritten = 0;
  let droppedPoints = 0;

  for (const run of runs) {
    try {
      const { points, dropped, accountLabel } = await executeRun(deps, vault, run);
      droppedPoints += dropped;
      pointsWritten += await deps.gateway.finishRun({
        runId: run.run_id,
        outcome: "succeeded",
        points,
        accountLabel,
      });
      succeeded += 1;
    } catch (error) {
      failed += 1;
      const failure = toFailure(error);
      try {
        await deps.gateway.finishRun({
          runId: run.run_id,
          outcome: "failed",
          failureKind: failure.failureKind,
          error: sanitizeSyncError(failure.message),
        });
      } catch (closing) {
        // Cerrar ha fallado: la ejecución queda "en curso" hasta que
        // alguien la mire, y la siguiente de la tanda sigue.
        console.error("[integraciones] no se pudo cerrar la ejecución", {
          runId: run.run_id,
          message: closing instanceof Error ? closing.message : String(closing),
        });
      }
    }
  }

  return { claimed: runs.length, succeeded, failed, pointsWritten, droppedPoints, skipped: null };
}

export interface RevocationResult {
  readonly attempted: number;
  readonly revoked: number;
  readonly failed: number;
  readonly skipped: "vault_not_configured" | null;
}

/**
 * RN-INT-06/08 · la revocación remota pendiente: una vez por tanda y
 * cada una como máximo dos veces en total (la 82 cierra la pendiente al
 * segundo fallo). Un token que Google ya no reconoce cuenta como
 * revocado.
 */
export async function runPendingRevocations(deps: SyncDeps, limit = 10): Promise<RevocationResult> {
  if (deps.vault === null) {
    return { attempted: 0, revoked: 0, failed: 0, skipped: "vault_not_configured" };
  }
  const vault = deps.vault;
  const pending = await deps.gateway.pendingRevocations(limit);
  let revoked = 0;
  let failed = 0;

  for (const item of pending) {
    let ok = false;
    let error: string | null = null;
    try {
      const stored = await deps.gateway.readRevokedToken(item.integration_id);
      if (stored === null) {
        throw new RunFailure("No hay ningún token guardado que revocar", "configuration");
      }
      if (deps.oauth === null) {
        throw new RunFailure("El cliente OAuth de Google no está configurado en este entorno", "configuration");
      }
      const token = vault.decrypt(stored.ciphertext, stored.key_version);
      await deps.oauth.revoke(token);
      ok = true;
    } catch (caught) {
      error = sanitizeSyncError(toFailure(caught).message);
    }

    try {
      await deps.gateway.recordRevocationAttempt(item.integration_id, ok, error);
      if (ok) revoked += 1;
      else failed += 1;
    } catch (recording) {
      failed += 1;
      console.error("[integraciones] no se pudo anotar el intento de revocación", {
        integrationId: item.integration_id,
        message: recording instanceof Error ? recording.message : String(recording),
      });
    }
  }

  return { attempted: pending.length, revoked, failed, skipped: null };
}
