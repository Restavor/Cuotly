import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { INTEGRATION_PROVIDERS, summaryWindow, type IntegrationActor } from "@/core/integrations";
import { es } from "@/i18n/es";

import { DigitalSummary } from "./DigitalSummary";
import { IntegrationsBlock } from "./IntegrationsBlock";
import type { DigitalSummaryView, IntegrationRow, IntegrationsView } from "./integrations-load";

/**
 * Maqueta 17 · "Gestión — Integraciones", y el resumen de "Informes y
 * datos" (§178). Lo que se vigila no es el aspecto: es qué se afirma y qué
 * se ofrece. Cinco filas siempre (RN-INT-03: la que no tiene fila está
 * "No conectada"); los botones según quién mira (RN-INT-05), y ninguno
 * que diga "Sincronizar ahora" (RN-INT-03); los cinco motivos de §178 con
 * su nombre, y nunca una cifra vieja como actual (RN-INT-07).
 */
vi.mock("@/app/espacios/[slug]/restaurantes/[id]/integraciones/actions", () => ({
  startOAuthConnection: vi.fn(),
  saveApiKey: vi.fn(),
  requestIntegrationCheck: vi.fn(),
  cancelIntegrationConnection: vi.fn(),
  disconnectIntegration: vi.fn(),
}));

const t = es.integrations;

afterEach(cleanup);

function fila(overrides: Partial<IntegrationRow> & { provider: IntegrationRow["provider"] }): IntegrationRow {
  return {
    integrationId: null,
    status: "not_connected",
    authKind: overrides.provider === "clarity" || overrides.provider === "pagespeed" ? "api_key" : "oauth",
    accountLabel: null,
    externalPropertyId: null,
    lastSyncAt: null,
    lastSuccessAt: null,
    nextAttemptAt: null,
    lastError: null,
    lastFailureKind: null,
    isStale: false,
    checkPending: false,
    externalRevocationPending: false,
    credentials: [],
    ...overrides,
  };
}

function vista(actor: IntegrationActor, rows: Partial<Record<IntegrationRow["provider"], Partial<IntegrationRow>>> = {}, extra: Partial<IntegrationsView> = {}): IntegrationsView {
  return {
    rows: INTEGRATION_PROVIDERS.map((provider) => fila({ provider, ...rows[provider] })),
    actor,
    vaultConfigured: true,
    oauthConfigured: true,
    establishmentArchived: false,
    websiteUrl: "https://magarinos.es/",
    webPlatform: "LandingSite",
    timezone: "Europe/Madrid",
    flash: null,
    ...extra,
  };
}

function pintar(view: IntegrationsView) {
  return render(
    <IntegrationsBlock
      view={view}
      establishmentId="est-1"
      slug="restavor"
      returnTo="/espacios/restavor/restaurantes/est-1?vista=gestion&bloque=integraciones"
      title={es.establishmentSheet.integrationsTitle}
      hint={es.establishmentSheet.integrationsHint}
    />,
  );
}

const OWNER: IntegrationActor = { kind: "staff", role: "owner" };
const ADMIN: IntegrationActor = { kind: "staff", role: "admin" };
const WORKER: IntegrationActor = { kind: "staff", role: "worker" };
const LOCAL_OWNER: IntegrationActor = { kind: "client", role: "local_owner" };
const EDITOR: IntegrationActor = { kind: "client", role: "editor" };

describe("Maqueta 17 · Gestión — Integraciones", () => {
  it("RN-INT-03 · las cinco fuentes de §115, cada una con su estado, y nunca «Sincronizar ahora»", () => {
    pintar(
      vista(OWNER, {
        ga4: { integrationId: "i-ga4", status: "connected", accountLabel: "magarinos@restavor.com", lastSyncAt: "2026-09-15T08:24:00Z" },
        search_console: { integrationId: "i-sc", status: "connected", accountLabel: "magarinos@restavor.com" },
        business_profile: { integrationId: "i-bp", status: "pending_authorization" },
        clarity: { integrationId: "i-cl", status: "disconnected" },
        pagespeed: { integrationId: "i-ps", status: "needs_attention", accountLabel: "magarinos.es", lastError: "HTTP 400 URL inválida", lastFailureKind: "configuration" },
      }),
    );

    for (const provider of INTEGRATION_PROVIDERS) {
      const row = screen.getByTestId(`integration-${provider}`);
      expect(within(row).getByText(t.providers[provider].name)).toBeInTheDocument();
    }
    expect(within(screen.getByTestId("integration-ga4")).getByText(t.states.connected)).toBeInTheDocument();
    expect(within(screen.getByTestId("integration-ga4")).getByText("magarinos@restavor.com")).toBeInTheDocument();
    expect(within(screen.getByTestId("integration-business_profile")).getByText(t.states.pending_authorization)).toBeInTheDocument();
    expect(within(screen.getByTestId("integration-clarity")).getByText(t.states.disconnected)).toBeInTheDocument();
    const ps = screen.getByTestId("integration-pagespeed");
    expect(within(ps).getByText(t.states.needs_attention)).toBeInTheDocument();
    expect(within(ps).getByText(/HTTP 400 URL inválida/)).toBeInTheDocument();
    expect(within(ps).getByText(t.failureKinds.configuration)).toBeInTheDocument();
    expect(within(ps).getByText(t.nextAttemptWaitingPerson)).toBeInTheDocument();

    // Ningún botón lo dice: la única mención es la nota que explica por qué no existe.
    expect(screen.queryByRole("button", { name: /sincronizar ahora/i })).toBeNull();
    expect(screen.getByText(t.noSyncNowNote)).toBeInTheDocument();
  });

  it("RN-INT-05 · el propietario del espacio conecta todo: Google por OAuth y Clarity y PageSpeed con su clave", () => {
    pintar(vista(OWNER));

    expect(within(screen.getByTestId("integration-ga4")).getByRole("button", { name: t.connectOAuth })).toBeInTheDocument();
    expect(within(screen.getByTestId("integration-search_console")).getByRole("button", { name: t.connectOAuth })).toBeInTheDocument();
    expect(within(screen.getByTestId("integration-clarity")).getByRole("button", { name: t.saveApiKey })).toBeInTheDocument();
    const ps = screen.getByTestId("integration-pagespeed");
    expect(within(ps).getByRole("button", { name: t.saveApiKey })).toBeInTheDocument();
    // La URL de PageSpeed se propone desde la web del restaurante.
    expect(within(ps).getByLabelText(t.propertyField.pagespeed)).toHaveValue("https://magarinos.es/");
    // Una clave se escribe a ciegas.
    expect(within(ps).getByLabelText(t.apiKeyField.pagespeed)).toHaveAttribute("type", "password");
  });

  it("§126 / RN-INT-05 · un administrador comprueba, cancela y desconecta, pero no aporta credenciales: se le dice por qué", () => {
    pintar(vista(ADMIN, { ga4: { integrationId: "i-ga4", status: "connected" } }));

    const ga4 = screen.getByTestId("integration-ga4");
    expect(within(ga4).getByRole("button", { name: t.check })).toBeInTheDocument();
    expect(within(ga4).getByRole("button", { name: t.disconnect })).toBeInTheDocument();
    const sc = screen.getByTestId("integration-search_console");
    expect(within(sc).queryByRole("button", { name: t.connectOAuth })).toBeNull();
    expect(within(sc).getByText(t.onlyOwnersAuthorize)).toBeInTheDocument();
    const clarity = screen.getByTestId("integration-clarity");
    expect(within(clarity).queryByRole("button", { name: t.saveApiKey })).toBeNull();
    expect(within(clarity).getByText(t.onlySpaceOwnerKeys)).toBeInTheDocument();
  });

  it("RN-INT-05 · un trabajador consulta y no toca; el Editor del restaurante tampoco", () => {
    pintar(vista(WORKER, { ga4: { integrationId: "i-ga4", status: "connected" } }));
    expect(screen.getByText(t.workerReadOnly)).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    cleanup();

    pintar(vista(EDITOR, { ga4: { integrationId: "i-ga4", status: "error" } }));
    expect(screen.getByText(t.clientReadOnly)).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("RN-INT-05 · el propietario del restaurante autoriza su cuenta de Google, pero no mete claves", () => {
    pintar(vista(LOCAL_OWNER));

    expect(screen.getByText(t.clientOwnerHint)).toBeInTheDocument();
    expect(within(screen.getByTestId("integration-ga4")).getByRole("button", { name: t.connectOAuth })).toBeInTheDocument();
    expect(within(screen.getByTestId("integration-clarity")).queryByRole("button")).toBeNull();
  });

  it("RN-INT-02 · comprobar existe para lo conectado o fallido; cancelar para lo pendiente; desconectar para lo conectado", () => {
    pintar(
      vista(OWNER, {
        ga4: { integrationId: "i-ga4", status: "connected" },
        search_console: { integrationId: "i-sc", status: "pending_authorization" },
        business_profile: { integrationId: "i-bp", status: "error", lastError: "HTTP 503", lastFailureKind: "transient", nextAttemptAt: "2026-09-16T10:00:00Z" },
      }),
    );

    const ga4 = screen.getByTestId("integration-ga4");
    expect(within(ga4).getByRole("button", { name: t.check })).toBeInTheDocument();
    expect(within(ga4).getByRole("button", { name: t.disconnect })).toBeInTheDocument();
    expect(within(ga4).queryByRole("button", { name: t.cancel })).toBeNull();

    const sc = screen.getByTestId("integration-search_console");
    expect(within(sc).getByRole("button", { name: t.cancel })).toBeInTheDocument();
    expect(within(sc).queryByRole("button", { name: t.check })).toBeNull();
    // Y se puede volver a intentar la autorización.
    expect(within(sc).getByRole("button", { name: t.connectOAuth })).toBeInTheDocument();

    const bp = screen.getByTestId("integration-business_profile");
    expect(within(bp).getByRole("button", { name: t.check })).toBeInTheDocument();
    expect(within(bp).getByText(t.failureKinds.transient)).toBeInTheDocument();
    expect(within(bp).getByText(/16 sept 2026/)).toBeInTheDocument();
  });

  it("§117 · «Requiere atención» por autorización ofrece volver a autorizar; una comprobación en cola desactiva el botón", () => {
    pintar(
      vista(OWNER, {
        ga4: { integrationId: "i-ga4", status: "needs_attention", lastFailureKind: "authorization", lastError: "invalid_grant", checkPending: true },
      }),
    );
    const ga4 = screen.getByTestId("integration-ga4");
    expect(within(ga4).getByRole("button", { name: t.reauthorize })).toBeInTheDocument();
    expect(within(ga4).getByRole("button", { name: t.check })).toBeDisabled();
    expect(within(ga4).getByText(t.checkPendingBadge)).toBeInTheDocument();
  });

  it("RN-INT-07 · el dato viejo se marca; la revocación pendiente se dice; el propietario ve que la credencial existe, no su valor", () => {
    pintar(
      vista(OWNER, {
        ga4: {
          integrationId: "i-ga4",
          status: "connected",
          isStale: true,
          credentials: [{ kind: "oauth_refresh_token", keyVersion: 1, expiresAt: null, createdAt: "2026-09-01T10:00:00Z", status: "active" }],
        },
        search_console: { integrationId: "i-sc", status: "disconnected", externalRevocationPending: true },
      }),
    );
    const ga4 = screen.getByTestId("integration-ga4");
    expect(within(ga4).getByText(t.staleBadge)).toBeInTheDocument();
    expect(within(ga4).getByText(/Autorización de Google/)).toBeInTheDocument();
    expect(within(ga4).getByText(/Cifrada con la clave v1/)).toBeInTheDocument();
    expect(within(screen.getByTestId("integration-search_console")).getByText(t.revocationPendingNote)).toBeInTheDocument();
  });

  it("§178 · sin bóveda o sin cliente OAuth no hay botón que fallaría: se dice el motivo", () => {
    pintar(vista(OWNER, {}, { vaultConfigured: false }));
    expect(screen.getByRole("alert")).toHaveTextContent(t.vaultNotConfigured);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    cleanup();

    pintar(vista(OWNER, {}, { oauthConfigured: false }));
    expect(screen.getByText(t.oauthNotConfigured)).toBeInTheDocument();
    expect(within(screen.getByTestId("integration-ga4")).queryByRole("button")).toBeNull();
    expect(within(screen.getByTestId("integration-clarity")).getByRole("button", { name: t.saveApiKey })).toBeInTheDocument();
  });

  it("RN-INT-06 · un restaurante archivado no conecta nada", () => {
    pintar(vista(OWNER, { ga4: { integrationId: "i-ga4", status: "disconnected" } }, { establishmentArchived: true }));
    expect(screen.getByText(t.archivedNote)).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("la vuelta de Google se cuenta con sus palabras, y las plataformas externas se dice que no son integraciones (§120)", () => {
    pintar(vista(OWNER, {}, { flash: "denied" }));
    expect(screen.getByTestId("integration-flash")).toHaveTextContent(t.flash.denied);
    expect(screen.getByText(t.platformsHint)).toBeInTheDocument();
    expect(screen.getByText("LandingSite")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(t.openSite) })).toHaveAttribute("href", "https://magarinos.es/");
    expect(screen.getByText(t.reservationsNone)).toBeInTheDocument();
  });
});

describe("§178 · Informes y datos › Analítica digital", () => {
  const window = summaryWindow("2026-09-14");

  function resumen(overrides: Partial<DigitalSummaryView["providers"][number]> & { provider: IntegrationRow["provider"] }): DigitalSummaryView["providers"][number] {
    return {
      status: "connected",
      reason: null,
      lastSuccessAt: "2026-09-14T03:00:00Z",
      lastSyncAt: "2026-09-14T03:00:00Z",
      lastError: null,
      coveredDays: 28,
      values: [],
      ...overrides,
    };
  }

  function pintarResumen(providers: DigitalSummaryView["providers"]) {
    return render(
      <DigitalSummary
        view={{ window, timezone: "Europe/Madrid", providers }}
        title={es.establishmentSheet.digitalTitle}
        hint={es.establishmentSheet.digitalHint}
      />,
    );
  }

  it("los cinco motivos de §178, cada uno con su nombre, y ninguna cifra de relleno", () => {
    pintarResumen([
      resumen({ provider: "ga4", status: "not_connected", reason: "not_connected", lastSuccessAt: null }),
      resumen({ provider: "search_console", reason: "no_data_yet", lastSuccessAt: null }),
      resumen({ provider: "business_profile", status: "error", reason: "error", lastError: "HTTP 503" }),
      resumen({ provider: "clarity", reason: "stale", lastSuccessAt: "2026-09-01T03:00:00Z" }),
      resumen({ provider: "pagespeed", reason: "insufficient_period", coveredDays: 0 }),
    ]);

    expect(screen.getByTestId("digital-ga4")).toHaveAttribute("data-reason", "not_connected");
    expect(within(screen.getByTestId("digital-ga4")).getByText(es.emptyReasons.not_connected)).toBeInTheDocument();
    expect(within(screen.getByTestId("digital-search_console")).getByText(es.emptyReasons.no_data_yet)).toBeInTheDocument();
    const bp = screen.getByTestId("digital-business_profile");
    expect(within(bp).getByText(es.emptyReasons.error)).toBeInTheDocument();
    expect(within(bp).getByText("HTTP 503")).toBeInTheDocument();
    const clarity = screen.getByTestId("digital-clarity");
    expect(within(clarity).getByText(es.emptyReasons.stale)).toBeInTheDocument();
    // El dato viejo lleva su fecha, no una cifra.
    expect(within(clarity).getByText(/Sincronizado el 1 sept 2026/)).toBeInTheDocument();
    expect(within(clarity).queryByText(/^\d+$/)).toBeNull();
    expect(within(screen.getByTestId("digital-pagespeed")).getByText(es.emptyReasons.insufficient_period)).toBeInTheDocument();
  });

  it("con dato actual, las cifras de la ventana con «datos hasta» y «sincronizado el»", () => {
    pintarResumen([
      resumen({
        provider: "ga4",
        coveredDays: 28,
        values: [
          { metric: "users", aggregate: "sum", value: 1234, byDimension: [], coveredDays: 28, lastPeriodEnd: "2026-09-13" },
          { metric: "sessions", aggregate: "sum", value: 2345.4, byDimension: [], coveredDays: 28, lastPeriodEnd: "2026-09-13" },
        ],
      }),
      resumen({
        provider: "pagespeed",
        coveredDays: 1,
        values: [
          {
            metric: "performance_score_by_strategy",
            aggregate: "latest",
            value: 62,
            byDimension: [
              { dimension: "desktop", value: 91 },
              { dimension: "mobile", value: 62 },
            ],
            coveredDays: 1,
            lastPeriodEnd: "2026-09-10",
          },
        ],
      }),
    ]);

    const ga4 = screen.getByTestId("digital-ga4");
    expect(ga4).toHaveAttribute("data-reason", "ok");
    expect(within(ga4).getByText(t.metrics.users)).toBeInTheDocument();
    expect(within(ga4).getByText("1234")).toBeInTheDocument();
    expect(within(ga4).getByText("2345")).toBeInTheDocument();
    expect(within(ga4).getByText(/Datos hasta 13 sept 2026/)).toBeInTheDocument();
    expect(within(ga4).getByText(/28 de 28 días con dato/)).toBeInTheDocument();
    expect(within(ga4).getByText(/Sincronizado el 14 sept 2026/)).toBeInTheDocument();

    const ps = screen.getByTestId("digital-pagespeed");
    expect(within(ps).getByText(/Escritorio/)).toBeInTheDocument();
    expect(within(ps).getByText("91")).toBeInTheDocument();
    expect(within(ps).getByText("62")).toBeInTheDocument();
  });
});
