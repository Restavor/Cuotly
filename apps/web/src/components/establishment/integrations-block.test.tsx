import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { INTEGRATION_PROVIDERS, type IntegrationActor } from "@/core/integrations";
import { es } from "@/i18n/es";

import { IntegrationsBlock } from "./IntegrationsBlock";
import type { IntegrationRow, IntegrationsView } from "./integrations-load";

/**
 * Vista 17 · "Gestión — Integraciones". Lo que se vigila no es el
 * aspecto: es qué se afirma y qué se ofrece. Cinco filas siempre
 * (RN-INT-03: la que no tiene fila está "No conectada"); los botones según
 * quién mira (RN-INT-05), y ninguno que diga "Sincronizar ahora"
 * (RN-INT-03); y las tres tarjetas de abajo diciendo lo que hay y lo que
 * falta (§120, §121). Las secciones de "Informes y datos" tienen su propio
 * test (`digital-sections.test.tsx`).
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
    domain: "magarinos.es",
    lastWebPublication: { kind: "published", at: "2026-09-05T12:32:00Z" },
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

  it("la vuelta de Google se cuenta con sus palabras, y las tres tarjetas de plataformas dicen lo que hay y lo que falta (§120, §121)", () => {
    pintar(vista(OWNER, {}, { flash: "denied" }));
    expect(screen.getByTestId("integration-flash")).toHaveTextContent(t.flash.denied);
    expect(screen.getByText(t.platformsHint)).toBeInTheDocument();
    // LandingSite: proyecto, última publicación (la de Menú Diario) y "Ver sitio".
    expect(screen.getByText("LandingSite")).toBeInTheDocument();
    expect(screen.getByText("magarinos.es")).toBeInTheDocument();
    expect(screen.getByText(/5 sept 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: new RegExp(t.openSite) })).toHaveAttribute("href", "https://magarinos.es/");
    // Reservas y Delivery: dos tarjetas, y ninguna con "Abrir enlace" hacia la nada.
    expect(screen.getByText(t.reservationsTitle)).toBeInTheDocument();
    expect(screen.getByText(t.deliveryTitle)).toBeInTheDocument();
    expect(screen.getAllByText(t.externalPlatformNone)).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /abrir enlace/i })).toBeNull();
    cleanup();

    // Sin publicación ni dominio se dice, no se deja el hueco.
    pintar(vista(OWNER, {}, { domain: null, websiteUrl: null, lastWebPublication: { kind: "none" } }));
    expect(screen.getByText(t.webPlatformLastPublicationNone)).toBeInTheDocument();
    expect(screen.getByText(t.webPlatformNone)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: new RegExp(t.openSite) })).toBeNull();
    cleanup();

    // Y si la lectura falló, se dice el motivo: "sin publicaciones" sería
    // una afirmación que en ese momento nadie puede hacer (CA-20).
    pintar(vista(OWNER, {}, { lastWebPublication: { kind: "unavailable" } }));
    expect(screen.getByText(es.emptyReasons.error)).toBeInTheDocument();
    expect(screen.queryByText(t.webPlatformLastPublicationNone)).toBeNull();
  });
});
