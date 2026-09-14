import { describe, expect, it } from "vitest";

import { es } from "@/i18n/es";

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
  HEADLINE_METRICS,
  SUMMARY_WINDOW_DAYS,
  coveredDays,
  headlineValue,
  isMetricOf,
  minimumCoveredDays,
  summaryReason,
  summaryWindow,
  DATA_SECTIONS,
  DATA_SECTION_PROVIDERS,
  dailySeries,
  latestByDimension,
  percentChange,
  previousWindow,
  topDimensions,
  type MetricPoint,
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

  it("RN-INT-04 · GA4 y Search Console a diario, PageSpeed semanal; las demás a diario (decisión 24)", () => {
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

  it("§92 · las métricas nombradas para GA4 y Search Console, y el catálogo de las otras tres fijado con su adaptador (Hito 14)", () => {
    expect(METRICS_BY_PROVIDER.ga4).toEqual([
      "users",
      "sessions",
      "page_views_by_page",
      "sessions_by_source",
      "sessions_by_device",
      "sessions_by_location",
      "conversions_by_event",
    ]);
    expect(METRICS_BY_PROVIDER.search_console).toEqual([
      "clicks",
      "impressions",
      "ctr",
      "position",
      "clicks_by_query",
      "clicks_by_page",
    ]);
    for (const provider of INTEGRATION_PROVIDERS) {
      expect(METRICS_BY_PROVIDER[provider].length).toBeGreaterThan(0);
      // Sin repetidas y con nombre: cada métrica es una clave natural.
      expect(new Set(METRICS_BY_PROVIDER[provider]).size).toBe(METRICS_BY_PROVIDER[provider].length);
    }
    // Toda métrica del catálogo tiene nombre en español: la pantalla no
    // enseña `dead_clicks` a nadie (CLAUDE.md, i18n).
    for (const provider of INTEGRATION_PROVIDERS) {
      for (const metric of METRICS_BY_PROVIDER[provider]) {
        expect(es.integrations.metrics, `${provider}.${metric} sin nombre`).toHaveProperty(metric);
      }
    }
    expect(isMetricOf("ga4", "sessions")).toBe(true);
    expect(isMetricOf("ga4", "clicks")).toBe(false);
    // Lo que el resumen enseña de cada fuente está en su catálogo.
    for (const provider of INTEGRATION_PROVIDERS) {
      for (const headline of HEADLINE_METRICS[provider]) {
        expect(isMetricOf(provider, headline.metric)).toBe(true);
      }
    }
  });

  describe("§178 / RN-INT-07 · el resumen de «Informes y datos»", () => {
    const punto = (metric: string, day: string, value: number, dimension = ""): MetricPoint => ({
      metric,
      dimension,
      period_start: day,
      period_end: day,
      value,
      unit: null,
    });

    it("la ventana son los 28 últimos días completos, hasta ayer", () => {
      expect(SUMMARY_WINDOW_DAYS).toBe(28);
      expect(summaryWindow("2026-09-14")).toEqual({ from: "2026-08-17", to: "2026-09-13" });
    });

    it("una suma suma los totales de la ventana, una media promedia, y lo de fuera de la ventana no cuenta", () => {
      const window = summaryWindow("2026-09-14");
      const points = [
        punto("sessions", "2026-09-12", 10),
        punto("sessions", "2026-09-13", 20),
        punto("sessions", "2026-09-14", 999), // hoy: fuera
        punto("sessions", "2026-08-01", 999), // viejo: fuera
        punto("sessions", "2026-09-13", 500, "google"), // un desglose no entra en el total
        punto("position", "2026-09-12", 8),
        punto("position", "2026-09-13", 10),
      ];
      expect(headlineValue(points, { metric: "sessions", aggregate: "sum" }, window)).toEqual({
        metric: "sessions",
        aggregate: "sum",
        value: 30,
        byDimension: [],
        coveredDays: 2,
        lastPeriodEnd: "2026-09-13",
      });
      expect(headlineValue(points, { metric: "position", aggregate: "mean" }, window).value).toBe(9);
      expect(headlineValue(points, { metric: "clicks", aggregate: "sum" }, window)).toMatchObject({ value: null, coveredDays: 0, lastPeriodEnd: null });
      expect(coveredDays(points, "sessions", window)).toBe(2);
    });

    it("«latest» es la última medición de cada desglose: la puntuación de PageSpeed por estrategia", () => {
      const window = summaryWindow("2026-09-14");
      const points = [
        punto("performance_score_by_strategy", "2026-09-01", 70, "mobile"),
        punto("performance_score_by_strategy", "2026-09-08", 82, "mobile"),
        punto("performance_score_by_strategy", "2026-09-08", 95, "desktop"),
      ];
      const value = headlineValue(points, { metric: "performance_score_by_strategy", aggregate: "latest" }, window);
      expect(value.byDimension).toEqual([
        { dimension: "desktop", value: 95 },
        { dimension: "mobile", value: 82 },
      ]);
      expect(value.coveredDays).toBe(2);
    });

    it("«periodo insuficiente» es una semana para una fuente diaria y una medición para una semanal (decisión 25a)", () => {
      expect(minimumCoveredDays("ga4")).toBe(7);
      expect(minimumCoveredDays("clarity")).toBe(7);
      expect(minimumCoveredDays("pagespeed")).toBe(1);
    });

    it("los cinco motivos de §178, en su orden: no conectada, sin datos, error, desactualizado, periodo insuficiente; y con dato bastante, ninguno", () => {
      const now = new Date("2026-09-14T09:00:00Z");
      const reciente = new Date("2026-09-14T03:00:00Z");
      const viejo = new Date("2026-09-01T03:00:00Z");
      expect(summaryReason("ga4", "not_connected", null, now, 0)).toBe("not_connected");
      expect(summaryReason("ga4", "connected", null, now, 0)).toBe("no_data_yet");
      expect(summaryReason("ga4", "error", reciente, now, 20)).toBe("error");
      expect(summaryReason("ga4", "connected", viejo, now, 20)).toBe("stale");
      expect(summaryReason("ga4", "connected", reciente, now, 3)).toBe("insufficient_period");
      expect(summaryReason("ga4", "connected", reciente, now, 7)).toBeNull();
      expect(summaryReason("pagespeed", "connected", reciente, now, 1)).toBeNull();
    });
  });

  describe("las secciones de «Informes y datos» (maquetas 09 a 12 y vistas sin datos)", () => {
    const punto = (metric: string, day: string, value: number, dimension = ""): MetricPoint => ({
      metric,
      dimension,
      period_start: day,
      period_end: day,
      value,
      unit: null,
    });
    const window = summaryWindow("2026-09-14");

    it("son seis, en el orden del diseño, y entre todas cubren las cinco fuentes exactamente una vez", () => {
      expect(DATA_SECTIONS).toEqual(["summary", "analytics", "search", "behavior", "performance", "opportunities"]);
      const sinResumen = DATA_SECTIONS.filter((s) => s !== "summary").flatMap((s) => DATA_SECTION_PROVIDERS[s]);
      expect([...sinResumen].sort()).toEqual([...INTEGRATION_PROVIDERS].sort());
      expect(DATA_SECTION_PROVIDERS.summary).toEqual(INTEGRATION_PROVIDERS);
      // Hito 15: no hay fuente porque no hay reglas (CLAUDE.md).
      expect(DATA_SECTION_PROVIDERS.opportunities).toEqual([]);
    });

    it("la ventana anterior mide lo mismo y termina el día antes", () => {
      expect(previousWindow(window)).toEqual({ from: "2026-07-20", to: "2026-08-16" });
      expect(previousWindow({ from: "2026-09-01", to: "2026-09-01" })).toEqual({ from: "2026-08-31", to: "2026-08-31" });
    });

    it("RN-INT-07 · la variación se calcula solo con dos cifras reales; sin anterior (o a cero) no se inventa", () => {
      expect(percentChange(120, 100)).toBe(20);
      expect(percentChange(80, 100)).toBe(-20);
      expect(percentChange(100, null)).toBeNull();
      expect(percentChange(null, 100)).toBeNull();
      expect(percentChange(5, 0)).toBeNull();
    });

    it("la serie diaria son los totales de la ventana en orden, y un día sin dato es un hueco, no un cero", () => {
      const points = [
        punto("sessions", "2026-09-13", 20),
        punto("sessions", "2026-09-11", 10),
        punto("sessions", "2026-09-12", 500, "google"),
        punto("sessions", "2026-09-14", 999),
      ];
      expect(dailySeries(points, "sessions", window)).toEqual([
        { day: "2026-09-11", value: 10 },
        { day: "2026-09-13", value: 20 },
      ]);
    });

    it("los desgloses mayores suman cada valor a lo largo de los días y se recortan (decisión 25f)", () => {
      const points = [
        punto("page_views_by_page", "2026-09-12", 30, "/carta"),
        punto("page_views_by_page", "2026-09-13", 40, "/carta"),
        punto("page_views_by_page", "2026-09-13", 50, "/"),
        punto("page_views_by_page", "2026-09-13", 1, "/contacto"),
        punto("page_views_by_page", "2026-08-01", 999, "/vieja"),
        punto("page_views_by_page", "2026-09-13", 999),
      ];
      expect(topDimensions(points, "page_views_by_page", window, 2)).toEqual([
        { dimension: "/carta", value: 70 },
        { dimension: "/", value: 50 },
      ]);
      expect(topDimensions(points, "position_by_query", window, 5)).toEqual([]);
    });

    it("la última medición de cada desglose lleva su día: PageSpeed dice de cuándo es el análisis", () => {
      const points = [
        punto("lcp_ms_by_strategy", "2026-09-01", 3000, "mobile"),
        punto("lcp_ms_by_strategy", "2026-09-08", 2800, "mobile"),
        punto("lcp_ms_by_strategy", "2026-09-08", 1400, "desktop"),
      ];
      expect(latestByDimension(points, "lcp_ms_by_strategy", window)).toEqual([
        { dimension: "desktop", value: 1400, day: "2026-09-08" },
        { dimension: "mobile", value: 2800, day: "2026-09-08" },
      ]);
    });
  });
});
