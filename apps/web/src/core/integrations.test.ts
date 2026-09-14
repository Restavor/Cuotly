import { describe, expect, it } from "vitest";

import {
  INITIAL_BACKFILL_DAYS,
  INTEGRATION_PROVIDERS,
  INTEGRATION_STATES,
  METRICS_BY_PROVIDER,
  RESYNC_OVERLAP_DAYS,
  SYNC_ERROR_MAX_LENGTH,
  canCancelConnection,
  canDisconnect,
  canManageConnections,
  canProvideCredential,
  canRequestCheck,
  canSeeCredentialMetadata,
  credentialKindFor,
  dataFreshness,
  failureNotification,
  failureNotifiesClientOwners,
  integrationAuthKind,
  integrationSyncFrequency,
  integrationTone,
  isIntegrationProvider,
  isIntegrationState,
  nextAttemptAfterFailure,
  nextAttemptAfterSuccess,
  noDataReason,
  retriesAutomatically,
  retryDelayHours,
  sanitizeSyncError,
  stateAfterSync,
  syncWindow,
} from "./integrations";

/**
 * Fase 3 · Hito 13 · las cuentas puras de las integraciones (PRD §27).
 *
 * Quien manda es el servidor (migración 81); esto es la misma cuenta sin
 * Postgres, y que las dos digan lo mismo lo vigila
 * `listas-compartidas.test.ts`. Lo que se prueba aquí es que la cuenta
 * dice lo que las reglas dicen, regla por regla, con su número.
 */
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

describe("integraciones analíticas (PRD §27)", () => {
  it("RN-INT-01 · son cinco fuentes, en el orden de §115, y una sexta no existe", () => {
    expect([...INTEGRATION_PROVIDERS]).toEqual([
      "ga4",
      "search_console",
      "business_profile",
      "clarity",
      "pagespeed",
    ]);
    // Reservas, delivery y LandingSite no son integraciones (§120, §121).
    expect(isIntegrationProvider("landingsite")).toBe(false);
    expect(isIntegrationProvider("reservations")).toBe(false);
  });

  it("RN-INT-02 · OAuth cuando exista, clave solo cuando sea necesaria", () => {
    expect(integrationAuthKind("ga4")).toBe("oauth");
    expect(integrationAuthKind("search_console")).toBe("oauth");
    expect(integrationAuthKind("business_profile")).toBe("oauth");
    expect(integrationAuthKind("clarity")).toBe("api_key");
    expect(integrationAuthKind("pagespeed")).toBe("api_key");
    expect(credentialKindFor("oauth")).toBe("oauth_refresh_token");
    expect(credentialKindFor("api_key")).toBe("api_key");
  });

  it("RN-INT-02 · la comprobación existe para lo que llegó a conectarse, no para lo que nunca lo hizo", () => {
    expect(canRequestCheck("connected")).toBe(true);
    expect(canRequestCheck("error")).toBe(true);
    expect(canRequestCheck("needs_attention")).toBe(true);
    expect(canRequestCheck("not_connected")).toBe(false);
    expect(canRequestCheck("pending_authorization")).toBe(false);
    expect(canRequestCheck("disconnected")).toBe(false);
  });

  it("RN-INT-03 · los siete estados de §117, en su orden, y cada uno con su tono", () => {
    expect([...INTEGRATION_STATES]).toEqual([
      "not_connected",
      "pending_authorization",
      "connected",
      "syncing",
      "needs_attention",
      "error",
      "disconnected",
    ]);
    expect(isIntegrationState("paused")).toBe(false);
    // §21.4: el estado no se expresa solo con color, pero el color tiene
    // que distinguir "reintento solo" (error) de "hace falta una persona".
    expect(integrationTone("error")).toBe("danger");
    expect(integrationTone("needs_attention")).toBe("warning");
    expect(integrationTone("connected")).toBe("success");
  });

  it("RN-INT-03/04 · el estado tras una pasada: correcta conecta, transitorio reintenta, lo demás espera a una persona", () => {
    expect(stateAfterSync("syncing", { ok: true })).toBe("connected");
    expect(stateAfterSync("syncing", { ok: false, failureKind: "transient" })).toBe("error");
    expect(stateAfterSync("syncing", { ok: false, failureKind: "authorization" })).toBe("needs_attention");
    expect(stateAfterSync("syncing", { ok: false, failureKind: "configuration" })).toBe("needs_attention");
    // Desconectada mientras corría: se guarda lo importado y sigue desconectada.
    expect(stateAfterSync("disconnected", { ok: true })).toBe("disconnected");

    expect(retriesAutomatically("transient")).toBe(true);
    expect(retriesAutomatically("authorization")).toBe(false);
    expect(retriesAutomatically("configuration")).toBe(false);
  });

  it("RN-INT-04 · GA4 y Search Console a diario, PageSpeed semanal; las demás a diario (pendiente 13)", () => {
    expect(integrationSyncFrequency("ga4")).toBe("daily");
    expect(integrationSyncFrequency("search_console")).toBe("daily");
    expect(integrationSyncFrequency("pagespeed")).toBe("weekly");
    expect(integrationSyncFrequency("business_profile")).toBe("daily");
    expect(integrationSyncFrequency("clarity")).toBe("daily");

    const fin = new Date("2026-09-14T10:00:00Z");
    expect(nextAttemptAfterSuccess("ga4", fin).getTime()).toBe(fin.getTime() + DIA);
    expect(nextAttemptAfterSuccess("pagespeed", fin).getTime()).toBe(fin.getTime() + 7 * DIA);
  });

  it("RN-INT-04 · reintenta con espera creciente: 1 h, 4 h, 16 h y 24 h como máximo", () => {
    expect(retryDelayHours(1)).toBe(1);
    expect(retryDelayHours(2)).toBe(4);
    expect(retryDelayHours(3)).toBe(16);
    expect(retryDelayHours(4)).toBe(24);
    expect(retryDelayHours(9)).toBe(24);
    // Cero o menos fallos no existe como cuenta: se trata como el primero.
    expect(retryDelayHours(0)).toBe(1);

    const ahora = new Date("2026-09-14T10:00:00Z");
    expect(nextAttemptAfterFailure(2, ahora).getTime()).toBe(ahora.getTime() + 4 * HORA);
  });

  it("RN-INT-04 · a quién se avisa: al equipo una vez por racha; al restaurante solo para volver a autorizar", () => {
    // Primer fallo transitorio: aviso. Segundo de la misma racha: silencio.
    expect(failureNotification("transient", 1)).toBe("integration_sync_failed");
    expect(failureNotification("transient", 2)).toBeNull();
    expect(failureNotification("transient", 7)).toBeNull();
    // Autorización caducada: siempre, y es el único que cruza al restaurante.
    expect(failureNotification("authorization", 3)).toBe("integration_reauthorization_required");
    expect(failureNotifiesClientOwners("integration_reauthorization_required")).toBe(true);
    expect(failureNotifiesClientOwners("integration_sync_failed")).toBe(false);
    // Una propiedad que ya no existe: aviso al equipo, que es quien la arregla.
    expect(failureNotification("configuration", 1)).toBe("integration_sync_failed");
  });

  it("RN-INT-05 · quién conecta, quién guarda una clave, quién solo mira", () => {
    const owner = { kind: "staff", role: "owner" } as const;
    const admin = { kind: "staff", role: "admin" } as const;
    const worker = { kind: "staff", role: "worker" } as const;
    const local = { kind: "client", role: "local_owner" } as const;
    const global = { kind: "client", role: "global_owner" } as const;
    const editor = { kind: "client", role: "editor" } as const;
    const consulta = { kind: "client", role: "consulta" } as const;

    // Gestionar conexiones: propietario y administradores; el restaurante,
    // sus propietarios. Un trabajador consulta y no toca.
    expect(canManageConnections(owner)).toBe(true);
    expect(canManageConnections(admin)).toBe(true);
    expect(canManageConnections(worker)).toBe(false);
    expect(canManageConnections(local)).toBe(true);
    expect(canManageConnections(global)).toBe(true);
    expect(canManageConnections(editor)).toBe(false);
    expect(canManageConnections(consulta)).toBe(false);

    // Una clave API la introduce solo el propietario del espacio (§126).
    expect(canProvideCredential(owner, "api_key")).toBe(true);
    expect(canProvideCredential(admin, "api_key")).toBe(false);
    expect(canProvideCredential(local, "api_key")).toBe(false);
    // Una autorización OAuth: el propietario del espacio o el del restaurante.
    expect(canProvideCredential(owner, "oauth")).toBe(true);
    expect(canProvideCredential(local, "oauth")).toBe(true);
    expect(canProvideCredential(global, "oauth")).toBe(true);
    expect(canProvideCredential(admin, "oauth")).toBe(false);
    expect(canProvideCredential(editor, "oauth")).toBe(false);

    // §119: los trabajadores nunca ven credenciales; el restaurante tampoco.
    expect(canSeeCredentialMetadata(owner)).toBe(true);
    expect(canSeeCredentialMetadata(admin)).toBe(false);
    expect(canSeeCredentialMetadata(worker)).toBe(false);
    expect(canSeeCredentialMetadata(local)).toBe(false);
  });

  it("una autorización a medias se cancela; una conectada se desconecta; lo que no está, ni una cosa ni otra", () => {
    expect(canCancelConnection("pending_authorization")).toBe(true);
    expect(canCancelConnection("connected")).toBe(false);
    expect(canDisconnect("connected")).toBe(true);
    expect(canDisconnect("error")).toBe(true);
    expect(canDisconnect("not_connected")).toBe(false);
    expect(canDisconnect("disconnected")).toBe(false);
    expect(canDisconnect("pending_authorization")).toBe(false);
  });

  it("RN-INT-07 · desactualizado es no tener una pasada correcta en el doble de la frecuencia; sin ninguna, no hay dato", () => {
    const ahora = new Date("2026-09-14T10:00:00Z");
    expect(dataFreshness("ga4", null, ahora)).toBe("never");
    expect(dataFreshness("ga4", new Date(ahora.getTime() - 47 * HORA), ahora)).toBe("fresh");
    expect(dataFreshness("ga4", new Date(ahora.getTime() - 49 * HORA), ahora)).toBe("stale");
    // Semanal: el doble son catorce días.
    expect(dataFreshness("pagespeed", new Date(ahora.getTime() - 13 * DIA), ahora)).toBe("fresh");
    expect(dataFreshness("pagespeed", new Date(ahora.getTime() - 15 * DIA), ahora)).toBe("stale");
  });

  it("RN-INT-07 / §178 · el motivo de no tener dato, en el orden en que se decide", () => {
    const ahora = new Date("2026-09-14T10:00:00Z");
    const reciente = new Date(ahora.getTime() - 2 * HORA);
    const viejo = new Date(ahora.getTime() - 5 * DIA);

    expect(noDataReason("ga4", "not_connected", null, ahora)).toBe("not_connected");
    expect(noDataReason("ga4", "pending_authorization", null, ahora)).toBe("not_connected");
    expect(noDataReason("ga4", "connected", null, ahora)).toBe("no_data_yet");
    expect(noDataReason("ga4", "error", null, ahora)).toBe("error");
    expect(noDataReason("ga4", "error", reciente, ahora)).toBe("error");
    expect(noDataReason("ga4", "connected", viejo, ahora)).toBe("stale");
    // Hay dato y es actual: ningún motivo que dar.
    expect(noDataReason("ga4", "connected", reciente, ahora)).toBeNull();
  });

  it("RN-INT-08 · el error se guarda sin secretos y recortado", () => {
    const sucio =
      'Request failed: Authorization: Bearer ya29.a0AfH6SMC-secreto-largo and ' +
      '{"refresh_token":"1//0gabcDEF-xyz","access_token":"ya29.otro"} ' +
      "url=https://x?key=AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ012345&token=abc";
    const limpio = sanitizeSyncError(sucio);

    expect(limpio).not.toContain("ya29.");
    expect(limpio).not.toContain("1//0g");
    expect(limpio).not.toContain("AIzaSy");
    expect(limpio).not.toContain("token=abc");
    expect(limpio).toContain("[oculto]");
    // Y lo que no es secreto se queda, para que el error siga diciendo algo.
    expect(limpio).toContain("Request failed");

    expect(sanitizeSyncError("x".repeat(2000)).length).toBe(SYNC_ERROR_MAX_LENGTH);
  });

  it("RN-INT-09 · la ventana: hasta ayer, con tres días de solape, y 90 hacia atrás la primera vez", () => {
    expect(INITIAL_BACKFILL_DAYS).toBe(90);
    expect(RESYNC_OVERLAP_DAYS).toBe(3);
    expect(syncWindow("2026-09-14", null)).toEqual({ from: "2026-06-16", to: "2026-09-13" });
    expect(syncWindow("2026-09-14", "2026-09-10")).toEqual({ from: "2026-09-07", to: "2026-09-13" });
    // Un último éxito muy antiguo no manda más atrás que el suelo de 90 días.
    expect(syncWindow("2026-09-14", "2026-01-01")).toEqual({ from: "2026-06-16", to: "2026-09-13" });
  });

  it("§92 · las métricas nombradas para GA4 y Search Console, y ninguna inventada para las otras tres", () => {
    expect(METRICS_BY_PROVIDER.ga4).toContain("sessions");
    expect(METRICS_BY_PROVIDER.search_console).toContain("clicks");
    expect(METRICS_BY_PROVIDER.business_profile).toBeUndefined();
    expect(METRICS_BY_PROVIDER.clarity).toBeUndefined();
    expect(METRICS_BY_PROVIDER.pagespeed).toBeUndefined();
  });
});
