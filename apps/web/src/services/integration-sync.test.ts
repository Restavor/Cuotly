import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { VAULT_KEY_ENV, createCredentialVault, type CredentialVault } from "./credential-vault";
import { GoogleOAuthError } from "./google-oauth";
import type { ClaimedRun, FinishRunInput, IntegrationGateway, PendingRevocation, StoredCredential } from "./integration-gateway";
import { runIntegrationSyncs, runPendingRevocations, type OAuthClient, type SyncDeps } from "./integration-sync";
import { AdapterFailure, type IntegrationAdapter } from "./integrations/adapter";

/**
 * RN-INT-09 · el proceso de la cola, probado entero con una base falsa,
 * una bóveda real con clave de prueba, adaptadores falsos y sin red. Lo
 * que se vigila: que descifre y refresque antes de llamar a la fuente,
 * que cierre cada ejecución con el motivo que RN-INT-08 manda, que un
 * fallo no tumbe a los demás, que el error se guarde sin secretos, que
 * sin bóveda no reclame nada y que la revocación remota (RN-INT-06) se
 * anote como salió.
 */
const vault: CredentialVault = createCredentialVault({ [VAULT_KEY_ENV]: randomBytes(32).toString("base64") });

function run(overrides: Partial<ClaimedRun> = {}): ClaimedRun {
  return {
    run_id: "run-1",
    integration_id: "int-1",
    space_id: "space-1",
    establishment_id: "est-1",
    provider: "ga4",
    kind: "sync",
    external_property_id: "properties/123",
    period_start: "2026-09-01",
    period_end: "2026-09-13",
    last_success_at: null,
    ...overrides,
  };
}

function credencial(plain: string, kind: StoredCredential["kind"] = "oauth_refresh_token"): StoredCredential {
  const { ciphertext, keyVersion } = vault.encrypt(plain);
  return { kind, ciphertext, key_version: keyVersion, expires_at: null };
}

interface Falsa {
  readonly gateway: IntegrationGateway;
  readonly cierres: FinishRunInput[];
  readonly revocaciones: { integrationId: string; ok: boolean; error: string | null }[];
  readonly resenas: { integrationId: string; reviews: readonly unknown[] }[];
}

function gatewayFalso(opts: {
  runs?: ClaimedRun[];
  credentials?: Record<string, StoredCredential | null>;
  pending?: PendingRevocation[];
  revokedTokens?: Record<string, StoredCredential | null>;
  finishFails?: boolean;
  watchesReviews?: boolean;
}): Falsa {
  const cierres: FinishRunInput[] = [];
  const revocaciones: Falsa["revocaciones"] = [];
  const resenasGuardadas: { integrationId: string; reviews: readonly unknown[] }[] = [];
  const gateway: IntegrationGateway = {
    claimRuns: vi.fn(async () => opts.runs ?? []),
    readCredential: vi.fn(async (id) => opts.credentials?.[id] ?? null),
    watchesReviews: vi.fn(async () => opts.watchesReviews === true),
    recordReviews: vi.fn(async (integrationId, reviews) => {
      resenasGuardadas.push({ integrationId, reviews });
      return reviews.length;
    }),
    finishRun: vi.fn(async (input) => {
      if (opts.finishFails) throw new Error("la base no contesta");
      cierres.push(input);
      return input.points?.length ?? 0;
    }),
    pendingRevocations: vi.fn(async () => opts.pending ?? []),
    readRevokedToken: vi.fn(async (id) => opts.revokedTokens?.[id] ?? null),
    recordRevocationAttempt: vi.fn(async (integrationId, ok, error) => {
      revocaciones.push({ integrationId, ok, error });
      return ok;
    }),
  };
  return { gateway, cierres, revocaciones, resenas: resenasGuardadas };
}

function oauthFalso(overrides: Partial<OAuthClient> = {}): OAuthClient {
  return {
    refresh: vi.fn(async () => "ya29.acceso"),
    revoke: vi.fn(async () => "revoked" as const),
    ...overrides,
  };
}

function adaptador(overrides: Partial<IntegrationAdapter> = {}): IntegrationAdapter {
  return {
    provider: "ga4",
    check: vi.fn(async () => ({ accountLabel: null })),
    sync: vi.fn(async () => ({
      points: [{ metric: "sessions", dimension: "", period_start: "2026-09-12", period_end: "2026-09-12", value: 3, unit: null }],
      accountLabel: null,
    })),
    ...overrides,
  };
}

function deps(falsa: Falsa, extra: Partial<SyncDeps> = {}): SyncDeps {
  return {
    gateway: falsa.gateway,
    vault,
    adapterFor: () => adaptador(),
    oauth: oauthFalso(),
    fetchImpl: vi.fn() as unknown as typeof fetch,
    now: () => new Date("2026-09-14T09:00:00Z"),
    ...extra,
  };
}

describe("integration-sync (RN-INT-09)", () => {
  it("RN-INT-09 · una sincronización: descifra, refresca el token, llama al adaptador con la ventana y cierra con los puntos", async () => {
    const falsa = gatewayFalso({ runs: [run()], credentials: { "int-1": credencial("1//refresco") } });
    const oauth = oauthFalso();
    const ga4 = adaptador();
    const resultado = await runIntegrationSyncs(deps(falsa, { oauth, adapterFor: () => ga4 }));

    expect(resultado).toEqual({ claimed: 1, succeeded: 1, failed: 0, pointsWritten: 1, droppedPoints: 0, skipped: null });
    expect(oauth.refresh).toHaveBeenCalledWith("1//refresco");
    const ctx = vi.mocked(ga4.sync).mock.calls[0][0];
    expect(ctx.secret).toBe("ya29.acceso");
    expect(ctx.propertyId).toBe("properties/123");
    expect(ctx.window).toEqual({ from: "2026-09-01", to: "2026-09-13" });
    // "Hoy" es el día siguiente al final de la ventana, en la zona del espacio.
    expect(ctx.today).toBe("2026-09-14");
    expect(falsa.cierres[0]).toMatchObject({ runId: "run-1", outcome: "succeeded" });
    expect(falsa.cierres[0].points).toHaveLength(1);
  });

  it("una clave API no se refresca: va tal cual a la fuente", async () => {
    const falsa = gatewayFalso({
      runs: [run({ provider: "clarity", external_property_id: null })],
      credentials: { "int-1": credencial("token-clarity", "api_key") },
    });
    const oauth = oauthFalso();
    const clarity = adaptador({ provider: "clarity", sync: vi.fn(async () => ({ points: [], accountLabel: null })) });
    await runIntegrationSyncs(deps(falsa, { oauth, adapterFor: () => clarity }));

    expect(oauth.refresh).not.toHaveBeenCalled();
    expect(vi.mocked(clarity.sync).mock.calls[0][0].secret).toBe("token-clarity");
  });

  it("RN-INT-02 · una comprobación llama a check y no a sync, y no escribe puntos", async () => {
    const falsa = gatewayFalso({
      runs: [run({ kind: "check", period_start: null, period_end: null })],
      credentials: { "int-1": credencial("1//refresco") },
    });
    const ga4 = adaptador({ check: vi.fn(async () => ({ accountLabel: "cuenta@gmail.com" })) });
    await runIntegrationSyncs(deps(falsa, { adapterFor: () => ga4 }));

    expect(ga4.check).toHaveBeenCalledOnce();
    expect(ga4.sync).not.toHaveBeenCalled();
    expect(falsa.cierres[0]).toMatchObject({ outcome: "succeeded", points: [], accountLabel: "cuenta@gmail.com" });
    // Sin ventana, "hoy" es el día del proceso.
    expect(vi.mocked(ga4.check).mock.calls[0][0].today).toBe("2026-09-14");
  });

  it("RN-INT-08 · cada fallo se cierra con su motivo: la fuente (adaptador), Google (refresco), la credencial (bóveda), sin credencial", async () => {
    const otraBoveda = createCredentialVault({ [VAULT_KEY_ENV]: randomBytes(32).toString("base64") });
    const falsa = gatewayFalso({
      runs: [
        run({ run_id: "r-fuente", integration_id: "i-fuente" }),
        run({ run_id: "r-google", integration_id: "i-google" }),
        run({ run_id: "r-boveda", integration_id: "i-boveda" }),
        run({ run_id: "r-sin", integration_id: "i-sin" }),
        run({ run_id: "r-desconocida", integration_id: "i-fuente", provider: "reservas" }),
      ],
      credentials: {
        "i-fuente": credencial("1//ok"),
        "i-google": credencial("1//revocado"),
        "i-boveda": otraBoveda.encrypt("1//otra-clave") as unknown as StoredCredential,
        "i-sin": null,
      },
    });
    // La credencial de "i-boveda" viene con la forma de la base.
    const cifradaAjena = otraBoveda.encrypt("1//otra-clave");
    (falsa.gateway.readCredential as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => {
      if (id === "i-boveda") return { kind: "oauth_refresh_token", ciphertext: cifradaAjena.ciphertext, key_version: 1, expires_at: null };
      if (id === "i-fuente") return credencial("1//ok");
      if (id === "i-google") return credencial("1//revocado");
      return null;
    });
    const oauth = oauthFalso({
      refresh: vi.fn(async (token: string) => {
        if (token === "1//revocado") throw new GoogleOAuthError("Google respondió 400 (invalid_grant)", "authorization");
        return "ya29.acceso";
      }),
    });
    const ga4 = adaptador({
      sync: vi.fn(async () => {
        throw new AdapterFailure("GA4 runReport: HTTP 404 property not found", "configuration");
      }),
    });

    const resultado = await runIntegrationSyncs(deps(falsa, { oauth, adapterFor: () => ga4 }));

    expect(resultado).toMatchObject({ claimed: 5, succeeded: 0, failed: 5 });
    const porRun = new Map(falsa.cierres.map((c) => [c.runId, c]));
    expect(porRun.get("r-fuente")).toMatchObject({ outcome: "failed", failureKind: "configuration" });
    expect(porRun.get("r-google")).toMatchObject({ outcome: "failed", failureKind: "authorization" });
    expect(porRun.get("r-boveda")).toMatchObject({ outcome: "failed", failureKind: "configuration" });
    expect(porRun.get("r-sin")).toMatchObject({ outcome: "failed", failureKind: "authorization" });
    expect(porRun.get("r-desconocida")).toMatchObject({ outcome: "failed", failureKind: "configuration" });
  });

  it("RN-INT-08 · el error se guarda sin secretos: un token que la fuente devolviera no llega a la base", async () => {
    const falsa = gatewayFalso({ runs: [run()], credentials: { "int-1": credencial("1//refresco") } });
    const ga4 = adaptador({
      sync: vi.fn(async () => {
        throw new AdapterFailure("GA4: HTTP 500 {\"access_token\":\"ya29.SECRETO-QUE-NO-DEBE-SALIR\"}", "transient");
      }),
    });
    await runIntegrationSyncs(deps(falsa, { adapterFor: () => ga4 }));

    expect(falsa.cierres[0].error).not.toContain("SECRETO-QUE-NO-DEBE-SALIR");
    expect(falsa.cierres[0].error).toContain("[oculto]");
  });

  it("RN-INT-09 · un fallo no tumba a las demás, y un fallo al cerrar tampoco", async () => {
    const falsa = gatewayFalso({
      runs: [run({ run_id: "r-1", integration_id: "i-1" }), run({ run_id: "r-2", integration_id: "i-2" })],
      credentials: { "i-1": null, "i-2": credencial("1//ok") },
    });
    const resultado = await runIntegrationSyncs(deps(falsa));
    expect(resultado).toMatchObject({ succeeded: 1, failed: 1 });
    expect(falsa.cierres.map((c) => [c.runId, c.outcome])).toEqual([
      ["r-1", "failed"],
      ["r-2", "succeeded"],
    ]);

    const rota = gatewayFalso({ runs: [run({ run_id: "r-1" }), run({ run_id: "r-2" })], credentials: { "int-1": credencial("1//ok") }, finishFails: true });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const resultadoRoto = await runIntegrationSyncs(deps(rota));
    expect(resultadoRoto).toMatchObject({ claimed: 2, succeeded: 0, failed: 2 });
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it("los puntos con una métrica fuera del catálogo de la fuente no se guardan, y se cuentan", async () => {
    const falsa = gatewayFalso({ runs: [run()], credentials: { "int-1": credencial("1//ok") } });
    const ga4 = adaptador({
      sync: vi.fn(async () => ({
        points: [
          { metric: "sessions", dimension: "", period_start: "2026-09-12", period_end: "2026-09-12", value: 3, unit: null },
          { metric: "inventada", dimension: "", period_start: "2026-09-12", period_end: "2026-09-12", value: 1, unit: null },
        ],
        accountLabel: null,
      })),
    });
    const resultado = await runIntegrationSyncs(deps(falsa, { adapterFor: () => ga4 }));
    expect(resultado).toMatchObject({ pointsWritten: 1, droppedPoints: 1 });
    expect(falsa.cierres[0].points?.map((p) => p.metric)).toEqual(["sessions"]);
  });

  it("sin bóveda no se reclama nada: un problema de despliegue no deja a nadie en «Requiere atención»", async () => {
    const falsa = gatewayFalso({ runs: [run()] });
    const resultado = await runIntegrationSyncs(deps(falsa, { vault: null }));

    expect(resultado.skipped).toBe("vault_not_configured");
    expect(falsa.gateway.claimRuns).not.toHaveBeenCalled();
    expect(await runPendingRevocations(deps(falsa, { vault: null }))).toMatchObject({ skipped: "vault_not_configured" });
  });

  it("sin cliente OAuth una fuente por OAuth falla como configuración, y una clave API sigue funcionando", async () => {
    const falsa = gatewayFalso({
      runs: [run({ run_id: "r-oauth", integration_id: "i-oauth" }), run({ run_id: "r-clave", integration_id: "i-clave", provider: "clarity" })],
      credentials: { "i-oauth": credencial("1//ok"), "i-clave": credencial("clave", "api_key") },
    });
    const resultado = await runIntegrationSyncs(deps(falsa, { oauth: null }));
    expect(resultado).toMatchObject({ succeeded: 1, failed: 1 });
    expect(falsa.cierres.find((c) => c.runId === "r-oauth")).toMatchObject({ outcome: "failed", failureKind: "configuration" });
  });

  it("RN-INT-06 · la revocación remota: revoca con el token guardado y anota el resultado; un token que Google ya no reconoce cuenta como revocado", async () => {
    const guardado = vault.encrypt("1//revocar");
    const falsa = gatewayFalso({
      pending: [
        { integration_id: "i-1", space_id: "s", establishment_id: "e", provider: "ga4", attempts: 0 },
        { integration_id: "i-2", space_id: "s", establishment_id: "e", provider: "ga4", attempts: 0 },
        { integration_id: "i-3", space_id: "s", establishment_id: "e", provider: "ga4", attempts: 1 },
      ],
      revokedTokens: {
        "i-1": { kind: "oauth_refresh_token", ciphertext: guardado.ciphertext, key_version: guardado.keyVersion, expires_at: null },
        "i-2": { kind: "oauth_refresh_token", ciphertext: guardado.ciphertext, key_version: guardado.keyVersion, expires_at: null },
        "i-3": null,
      },
    });
    const oauth = oauthFalso({
      revoke: vi
        .fn<OAuthClient["revoke"]>()
        .mockResolvedValueOnce("revoked")
        .mockResolvedValueOnce("already_invalid"),
    });

    const resultado = await runPendingRevocations(deps(falsa, { oauth }));

    expect(oauth.revoke).toHaveBeenCalledWith("1//revocar");
    expect(resultado).toEqual({ attempted: 3, revoked: 2, failed: 1, skipped: null });
    expect(falsa.revocaciones).toEqual([
      { integrationId: "i-1", ok: true, error: null },
      { integrationId: "i-2", ok: true, error: null },
      { integrationId: "i-3", ok: false, error: "No hay ningún token guardado que revocar" },
    ]);
  });

  it("RN-INT-08 · un fallo de Google al revocar se anota como fallo con su motivo, sin secretos", async () => {
    const guardado = vault.encrypt("1//revocar");
    const falsa = gatewayFalso({
      pending: [{ integration_id: "i-1", space_id: "s", establishment_id: "e", provider: "ga4", attempts: 0 }],
      revokedTokens: { "i-1": { kind: "oauth_refresh_token", ciphertext: guardado.ciphertext, key_version: 1, expires_at: null } },
    });
    const oauth = oauthFalso({
      revoke: vi.fn(async () => {
        throw new GoogleOAuthError("Google respondió 503 al revocar token=1//revocar", "transient");
      }),
    });
    await runPendingRevocations(deps(falsa, { oauth }));

    expect(falsa.revocaciones[0].ok).toBe(false);
    expect(falsa.revocaciones[0].error).toContain("503");
    expect(falsa.revocaciones[0].error).not.toContain("1//revocar");
  });
});
