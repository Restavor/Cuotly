import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";
import type { SheetData } from "./Sheet";
import { EstablishmentSheet } from "./Sheet";
import { MANAGEMENT_BLOCKS, SHEET_TABS } from "./tabs";

/**
 * Vista 15 · "Gestión — Usuarios y accesos", pintada.
 *
 * Lo que esta suite vigila:
 *
 *   · Que el **botón de retirar** exista y mande al sitio correcto. Es lo
 *     que faltaba: `revoke_establishment_access()` y `revoke_group_access()`
 *     estaban escritas desde la revisión de Fase 1 y no las llamaba ninguna
 *     pantalla. Un propietario global no cuelga del restaurante sino de su
 *     grupo, y mandarlo a la función equivocada no fallaría ruidosamente —
 *     es idempotente y diría "no había nada que retirar" mientras esa
 *     persona sigue entrando.
 *   · Que el botón **no se pinte** a quien no puede (no autoriza nada, pero
 *     enseñar un botón que el servidor va a rechazar es mentir).
 *   · Que el **personal del equipo** salga con su especialidad y sin
 *     teléfono inventado: `profiles` no tiene esa columna.
 */
const t = es.establishmentSheet;

afterEach(cleanup);

vi.mock("./GrantAccessForm", () => ({
  GrantAccessForm: ({ establishmentId, groupId }: { establishmentId: string; groupId: string }) => (
    <div data-testid="dar-acceso" data-est={establishmentId} data-group={groupId}>
      dar acceso
    </div>
  ),
}));

vi.mock("./RevokeAccessButton", () => ({
  RevokeAccessButton: ({
    userId,
    source,
    establishmentId,
    groupId,
  }: {
    userId: string;
    source: string;
    establishmentId: string;
    groupId: string;
  }) => (
    <div data-testid={`retirar-${userId}`} data-source={source} data-est={establishmentId} data-group={groupId}>
      retirar
    </div>
  ),
}));

const GESTION = SHEET_TABS.find((tab) => tab.key === "management")!;
const BLOQUE_USUARIOS = MANAGEMENT_BLOCKS.find((block) => block.key === "users")!;

const propietariaLocal = {
  userId: "u-1",
  displayName: "Ana García",
  email: "ana@example.com",
  source: "establishment" as const,
  role: "local_owner",
  canEditData: true,
  canViewBilling: true,
  grantedAt: "2026-07-01T00:00:00.000Z",
};

const propietarioGlobal = {
  userId: "u-2",
  displayName: "Carlos Martínez",
  email: "carlos@example.com",
  source: "group" as const,
  role: "global_owner",
  canEditData: true,
  canViewBilling: true,
  grantedAt: "2026-06-01T00:00:00.000Z",
};

const consulta = {
  userId: "u-3",
  displayName: "Lucía Fernández",
  email: "lucia@example.com",
  source: "establishment" as const,
  role: "consulta",
  canEditData: false,
  canViewBilling: false,
  grantedAt: "2026-08-01T00:00:00.000Z",
};

function sheetData(
  users: SheetData["users"],
  canManageClients: boolean,
  staff: SheetData["staff"],
): SheetData {
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
    canManageClients,
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
    users,
    staff,
    files: { files: [], selected: null, categories: [], folders: [], total: 0, category: null },
    audit: {
      rows: [],
      actors: [],
      filters: { from: null, to: null, family: null, actorId: null, page: 1 },
      hasMore: false,
    },
  };
}

function pintar(
  users: SheetData["users"],
  canManageClients = true,
  staff: SheetData["staff"] = [],
) {
  return render(
    <EstablishmentSheet
      base="/espacios/demo/restaurantes/est-1"
      slug="demo"
      tab={GESTION}
      block={BLOQUE_USUARIOS}
      data={sheetData(users, canManageClients, staff)}
    />,
  );
}

function tarjeta(titulo: string): HTMLElement {
  const encabezado = screen.getByRole("heading", { name: titulo });
  return encabezado.closest("section") ?? encabezado.parentElement!.parentElement!;
}

describe("vista 15 · los usuarios del restaurante", () => {
  it("cada rol enseña su alcance de acceso (PRD §14)", () => {
    pintar({ rows: [propietariaLocal, propietarioGlobal, consulta], failed: false });
    expect(screen.getAllByText(t.accessScopes.full)).toHaveLength(2);
    expect(screen.getByText(t.accessScopes.read_only)).toBeInTheDocument();
  });

  it("el acceso de un propietario GLOBAL se retira por su grupo, no por el restaurante", () => {
    // Mandarlo a `revoke_establishment_access()` no fallaría: es
    // idempotente y devolvería "no había nada que retirar" mientras esa
    // persona sigue entrando por el grupo.
    pintar({ rows: [propietariaLocal, propietarioGlobal], failed: false });
    expect(screen.getByTestId("retirar-u-2")).toHaveAttribute("data-source", "group");
    expect(screen.getByTestId("retirar-u-2")).toHaveAttribute("data-group", "grupo-1");
    expect(screen.getByTestId("retirar-u-1")).toHaveAttribute("data-source", "establishment");
    expect(screen.getByTestId("retirar-u-1")).toHaveAttribute("data-est", "est-1");
  });

  it("a quien no puede gestionar clientes no se le pinta el botón", () => {
    pintar({ rows: [propietariaLocal], failed: false }, false);
    expect(screen.queryByTestId("retirar-u-1")).not.toBeInTheDocument();
  });

  it("una consulta fallida NO se enseña como 'no hay nadie'", () => {
    pintar({ rows: [], failed: true });
    expect(screen.getByText(t.usersFailedReason)).toBeInTheDocument();
    expect(screen.queryByText(t.usersEmptyReason)).not.toBeInTheDocument();
  });
});

describe("vista 15 · el personal operativo asignado", () => {
  const trabajador = {
    userId: "w-1",
    displayName: "Javier Ruiz",
    email: "javier@cuotly.test",
    specialties: ["web", "seo"],
    membershipStatus: "active",
    assignedAt: "2026-05-01T00:00:00.000Z",
  };

  it("enseña nombre y especialidades, y NO un teléfono que no existe", () => {
    // `profiles` no tiene columna de teléfono, en ninguna migración. La
    // maqueta enseña una: inventarse un número sería dato de relleno.
    pintar({ rows: [], failed: false }, true, [trabajador]);
    const card = within(tarjeta(t.staffTitle));
    expect(card.getByText("Javier Ruiz")).toBeInTheDocument();
    expect(card.getByText(/Web · SEO/)).toBeInTheDocument();
    expect(card.queryByText(/\d{3} \d{3} \d{3}/)).not.toBeInTheDocument();
  });

  it("sin especialidad declarada lo dice, no deja el hueco", () => {
    pintar({ rows: [], failed: false }, true, [{ ...trabajador, specialties: [] }]);
    expect(screen.getByText(t.specialtyNone)).toBeInTheDocument();
  });

  it("sin nadie asignado dice lo que eso significa: sus trabajos se quedan sin asignar", () => {
    pintar({ rows: [], failed: false }, true, []);
    expect(screen.getByText(t.staffEmptyReason)).toBeInTheDocument();
  });
});

describe("vista 15 · dar acceso (RN-EST-04)", () => {
  it("se le ofrece a quien gestiona clientes, con el grupo del restaurante", () => {
    pintar({ rows: [propietariaLocal], failed: false }, true);
    const form = screen.getByTestId("dar-acceso");
    expect(form).toHaveAttribute("data-est", "est-1");
    // El grupo hace falta para "todos los actuales" de RN-EST-04.
    expect(form).toHaveAttribute("data-group", "grupo-1");
  });

  it("a quien no puede gestionarlos, ni se le pinta", () => {
    // No autoriza nada —la función lo comprueba— pero ofrecer un
    // formulario que el servidor va a rechazar es mentir.
    pintar({ rows: [propietariaLocal], failed: false }, false);
    expect(screen.queryByTestId("dar-acceso")).not.toBeInTheDocument();
  });
});
