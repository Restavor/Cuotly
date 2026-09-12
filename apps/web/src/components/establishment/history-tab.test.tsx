import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import type { SheetData } from "./Sheet";
import { EstablishmentSheet } from "./Sheet";
import { MANAGEMENT_BLOCKS, SHEET_TABS } from "./tabs";

/**
 * Vista 19 · "Historial — Actividad y auditoría", pintada.
 *
 * Lo que vigila:
 *
 *   · Que un apunte **sin actor** diga "Sistema" y no un guion. Los
 *     barridos y las emisiones automáticas no los hace nadie, y eso es un
 *     dato, no un hueco.
 *   · Que los **cambios** sean solo los campos que de verdad cambiaron: una
 *     lista con diez campos idénticos y uno distinto esconde el que importa.
 *   · Que el botón **Exportar** no exista, con su motivo — el PRD §24.1
 *     deja la exportación masiva fuera de la Fase 1.
 *   · Que los filtros viajen **en la dirección** (CA-22).
 */
const t = es.establishmentSheet;

afterEach(cleanup);

const HISTORIAL = SHEET_TABS.find((tab) => tab.key === "history")!;

const apunteDePersona = {
  id: "a-1",
  createdAt: "2026-09-15T10:24:00.000Z",
  action: "establishment.data_changed",
  entityType: "establishment",
  entityId: "est-1",
  actorId: "u-1",
  actorName: "Ana García",
  changes: [{ field: "phone_primary", before: "600 000 000", after: "600 111 111" }],
  reason: null,
};

const apunteDelSistema = {
  id: "a-2",
  createdAt: "2026-09-10T03:12:00.000Z",
  action: "charge.issued",
  entityType: "charge",
  entityId: "c-1",
  actorId: null,
  actorName: null,
  changes: [],
  reason: null,
};

function sheetData(audit: SheetData["audit"]): SheetData {
  return {
    header: {
      id: "est-1",
      name: "Magariños",
      code: "EST-0048",
      status: "active",
      groupId: "grupo-1",
      groupName: "Grupo Magariños",
      planId: "p-1",
      planName: "Premium",
      planPriceCents: 59900,
      services: [],
      commitmentEndsAt: null,
      commitmentStartedAt: null,
      planSubscriptionId: "sub-1",
      planTerms: null,
      cycleStart: null,
      cycleEnd: null,
      identity: {
        legalName: null,
        taxId: null,
        address: null,
        postalCode: null,
        city: null,
        contactName: null,
        contactEmail: null,
        phonePrimary: null,
        phoneSecondary: null,
        websiteUrl: null,
        instagram: null,
        facebookUrl: null,
        domain: null,
        openingHours: null,
        webPlatform: null,
      },
    },
    canEditData: false,
    statusReason: null,
    canManageClients: false,
    summary: {
      bags: [],
      attention: [],
      pendingValidation: [],
      openRequests: 0,
      currentJob: null,
      liveJobs: 0,
      payment: { allowed: false, outstandingCents: 0, overdueCount: 0 },
    },
    operation: {
      requests: { shown: [], hidden: 0 },
      jobs: { shown: [], hidden: 0 },
      tasks: { shown: [], hidden: 0 },
    },
    counts: { requestsByState: [], jobsByState: [], files: 0 },
    payments: { allowed: false, charges: [], payments: [] },
    today: "2026-09-11",
    users: { rows: [], failed: false },
    staff: [],
    files: { files: [], selected: null, categories: [], folders: [], total: 0, category: null },
    audit,
  };
}

const sinFiltros = { from: null, to: null, family: null, actorId: null, page: 1 };

function pintar(audit: SheetData["audit"]) {
  return render(
    <EstablishmentSheet
      base="/espacios/demo/restaurantes/est-1"
      slug="demo"
      tab={HISTORIAL}
      block={MANAGEMENT_BLOCKS[0]}
      data={sheetData(audit)}
    />,
  );
}

describe("vista 19 · la tabla de actividad", () => {
  it("un apunte sin actor dice 'Sistema', no un guion", () => {
    pintar({
      rows: [apunteDePersona, apunteDelSistema],
      actors: [{ id: "u-1", name: "Ana García" }],
      filters: sinFiltros,
      hasMore: false,
    });
    const tabla = within(screen.getByRole("table"));
    expect(tabla.getByText("Ana García")).toBeInTheDocument();
    expect(tabla.getByText(t.auditSystemActor)).toBeInTheDocument();
  });

  it("los cambios enseñan el antes y el después del campo que cambió", () => {
    pintar({ rows: [apunteDePersona], actors: [], filters: sinFiltros, hasMore: false });
    expect(screen.getByText(/600 000 000 → 600 111 111/)).toBeInTheDocument();
  });

  it("traduce la acción al nombre en español del catálogo", () => {
    pintar({ rows: [apunteDePersona], actors: [], filters: sinFiltros, hasMore: false });
    const nombres = es.settings.auditActions as Readonly<Record<string, string>>;
    expect(screen.getByText(nombres["establishment.data_changed"])).toBeInTheDocument();
  });

  it("sin actividad Y con filtros puestos, el motivo es OTRO", () => {
    // "No hay nada todavía" y "no hay nada que encaje con estos filtros"
    // son dos cosas distintas, y confundirlas manda a alguien a buscar un
    // fallo donde solo hay un filtro (CA-20).
    pintar({ rows: [], actors: [], filters: sinFiltros, hasMore: false });
    expect(screen.getByText(t.historyEmptyReason)).toBeInTheDocument();

    cleanup();
    pintar({
      rows: [],
      actors: [],
      filters: { ...sinFiltros, family: "request" },
      hasMore: false,
    });
    expect(screen.getByText(t.historyFilteredEmptyReason)).toBeInTheDocument();
  });
});

describe("vista 19 · los filtros y el paginador", () => {
  it("el desplegable de personas ofrece solo a quien aparece en el historial", () => {
    pintar({
      rows: [apunteDePersona],
      actors: [{ id: "u-1", name: "Ana García" }],
      filters: sinFiltros,
      hasMore: false,
    });
    const select = screen.getByLabelText(t.auditActorLabel);
    expect(within(select).getByRole("option", { name: "Ana García" })).toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: "Bosco" })).not.toBeInTheDocument();
  });

  it("el paginador lleva los filtros puestos en la dirección (CA-22)", () => {
    pintar({
      rows: [apunteDePersona],
      actors: [],
      filters: { from: "2026-09-01", to: null, family: "establishment", actorId: null, page: 1 },
      hasMore: true,
    });
    expect(screen.getByRole("link", { name: t.auditNext })).toHaveAttribute(
      "href",
      "/espacios/demo/restaurantes/est-1?vista=historial&desde=2026-09-01&familia=establishment&pagina=2",
    );
  });

  it("sin página siguiente ni anterior, no se pinta paginador", () => {
    pintar({ rows: [apunteDePersona], actors: [], filters: sinFiltros, hasMore: false });
    expect(screen.queryByRole("link", { name: t.auditNext })).not.toBeInTheDocument();
  });
});

describe("vista 19 · exportar", () => {
  it("NO hay botón de exportar, y se dice por qué (PRD §24.1)", () => {
    pintar({ rows: [apunteDePersona], actors: [], filters: sinFiltros, hasMore: false });
    expect(screen.getByText(t.auditExportPending)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /exportar/i })).not.toBeInTheDocument();
  });
});

describe("vista 19 · quién hizo cada cosa", () => {
  it("un actor cuyo nombre no se puede resolver NO es 'Sistema'", () => {
    // Pasó con datos reales: los cambios del restaurante salían como
    // "Sistema" porque el equipo no puede leer el perfil de un cliente
    // —no comparten espacio—. Decir que lo hizo el sistema cuando lo hizo
    // una persona es mentir justo en la pantalla que existe para saber
    // quién hizo qué.
    pintar({
      rows: [{ ...apunteDePersona, actorId: "u-9", actorName: null }],
      actors: [],
      filters: sinFiltros,
      hasMore: false,
    });
    const tabla = within(screen.getByRole("table"));
    expect(tabla.getByText(t.auditUnknownActor)).toBeInTheDocument();
    expect(tabla.queryByText(t.auditSystemActor)).not.toBeInTheDocument();
  });
});
