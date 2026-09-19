import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";
import type { SheetData } from "./Sheet";
import { EstablishmentSheet } from "./Sheet";
import { MANAGEMENT_BLOCKS, SHEET_TABS } from "./tabs";

import { sheetFixture } from "./sheet-fixture";

/**
 * §40.1, RN-PAN-09 a 13 · el panel del restaurante como algo que se crea
 * (página 56 del diseño definitivo móvil).
 *
 * Lo que esta suite vigila es el **estado**, que es donde está la trampa:
 *
 *   · "Panel creado" se DERIVA de los accesos vivos (RN-PAN-09). No hay
 *     bandera, así que no puede quedarse diciendo "creado" cuando ya no
 *     entra nadie.
 *   · **"No se ha podido mirar" no es "no creado"** (CLAUDE.md). Son lo
 *     contrario para quien va a decidir si crea el panel: uno le dice que
 *     pulse y el otro que espere.
 *   · El formulario **no se le ofrece** a quien no gestiona clientes; y
 *     esconderlo no es el control, que está en el servidor (RN-PAN-10).
 */
afterEach(cleanup);

vi.mock("./UploadFileForm", () => ({
  UploadFileForm: () => <div data-testid="subir-archivo">subir</div>,
}));
vi.mock("./ShareFileButton", () => ({
  ShareFileButton: () => <div data-testid="compartir">compartir</div>,
}));

const t = es.establishmentSheet;
const GESTION = SHEET_TABS.find((tab) => tab.key === "management")!;
const BLOQUE_USUARIOS = MANAGEMENT_BLOCKS.find((block) => block.key === "users")!;

const unUsuario: SheetData["users"]["rows"][number] = {
  userId: "u-1",
  displayName: "Cliente Magariños",
  email: "cliente@magarinos.es",
  source: "establishment",
  role: "local_owner",
  canEditData: true,
  canViewBilling: true,
  grantedAt: "2026-09-10T10:00:00.000Z",
};

function pintar(users: SheetData["users"], canManageClients = true) {
  return render(
    <EstablishmentSheet
      base="/espacios/demo/restaurantes/est-1"
      slug="demo"
      tab={GESTION}
      block={BLOQUE_USUARIOS}
      data={{ ...sheetFixture(), users, canManageClients }}
    />,
  );
}

describe("RN-PAN-09 · el estado del panel se deriva de los accesos", () => {
  it("sin nadie dentro dice «No creado» y ofrece crearlo", () => {
    pintar({ rows: [], failed: false });
    expect(screen.getByRole("heading", { name: t.panelTitle })).toBeInTheDocument();
    expect(screen.getByText(t.panelNotCreated)).toBeInTheDocument();
    expect(screen.getByText(t.panelCreateTitle)).toBeInTheDocument();
  });

  it("con alguien dentro dice «Creado» y cuántos entran, sin ofrecer crearlo otra vez", () => {
    pintar({ rows: [unUsuario], failed: false });
    expect(screen.getByText(t.panelCreatedTitle)).toBeInTheDocument();
    expect(screen.getByText(t.panelCreatedHint(1))).toBeInTheDocument();
    expect(screen.queryByText(t.panelCreateTitle)).toBeNull();
  });

  it("RN-PAN-13 · quitar el último acceso lo devuelve a «No creado»", () => {
    // Es la consecuencia de derivarlo, y parece un fallo cuando pasa. Es
    // la única lectura que no miente: sin accesos no hay panel al que
    // entrar.
    pintar({ rows: [], failed: false });
    expect(screen.getByText(t.panelNotCreated)).toBeInTheDocument();
  });

  it("no haber podido mirar NO se dice como «No creado»", () => {
    // Uno le dice a quien mira que pulse el botón; el otro, que vuelva más
    // tarde. Confundirlos hace que alguien cree un panel que ya existía.
    pintar({ rows: [], failed: true });
    expect(screen.getByText(t.panelUnknownTitle)).toBeInTheDocument();
    expect(screen.queryByText(t.panelNotCreated)).toBeNull();
    expect(screen.queryByText(t.panelCreateTitle)).toBeNull();
  });
});

describe("RN-PAN-10/11 · el formulario de crear el panel", () => {
  it("dice lo que crear el panel NO hace, antes de crearlo", () => {
    pintar({ rows: [], failed: false });
    expect(screen.getByText(t.panelBelongsTitle)).toBeInTheDocument();
    expect(screen.getByText(t.panelBelongsHint)).toBeInTheDocument();
  });

  it("el propietario es obligatorio: no hay panel vacío", () => {
    pintar({ rows: [], failed: false });
    const campo = screen.getByLabelText(new RegExp(t.panelOwnerLabel));
    expect(campo).toBeRequired();
  });

  it("manda el rol de propietario local y el alcance de este restaurante", () => {
    // Van ocultos y el servidor los vuelve a leer: quien mande el
    // formulario a mano puede cambiarlos, y lo que pase será lo que
    // `grant_establishment_access()` permita (CLAUDE.md).
    const { container } = pintar({ rows: [], failed: false });
    expect(container.querySelector('input[name="role"]')).toHaveValue("local_owner");
    expect(container.querySelector('input[name="scope"]')).toHaveValue("this");
  });

  it("a quien no gestiona clientes no se le ofrece, pero sí se le dice el estado", () => {
    pintar({ rows: [], failed: false }, false);
    expect(screen.getByText(t.panelNotCreated)).toBeInTheDocument();
    expect(screen.queryByText(t.panelCreateTitle)).toBeNull();
  });
});
