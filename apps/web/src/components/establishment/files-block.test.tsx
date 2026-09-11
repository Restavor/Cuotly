import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";
import type { SheetData } from "./Sheet";
import { EstablishmentSheet } from "./Sheet";
import { MANAGEMENT_BLOCKS, SHEET_TABS } from "./tabs";

/**
 * Vista 16 · "Gestión — Archivos y copias web", pintada.
 *
 * Lo que vigila:
 *
 *   · Las **carpetas con su recuento**, contadas sobre el catálogo entero
 *     y no sobre lo filtrado: si se contaran después de filtrar, elegir
 *     "Menús" dejaría las demás a cero y parecería que los archivos han
 *     desaparecido.
 *   · Que **Tipo** salga del `mime_type` guardado y no de la extensión del
 *     nombre. Es la columna que existe para no tener que abrir el archivo:
 *     si miente, no sirve.
 *   · Que la tarjeta de copias **no afirme** que hay una copia restaurable
 *     (§5.5 de la especificación maestra).
 */
const t = es.establishmentSheet;

afterEach(cleanup);

vi.mock("./UploadFileForm", () => ({
  UploadFileForm: () => <div data-testid="subir-archivo">subir</div>,
}));
vi.mock("./ShareFileButton", () => ({
  ShareFileButton: () => <div data-testid="compartir">compartir</div>,
}));

const GESTION = SHEET_TABS.find((tab) => tab.key === "management")!;
const BLOQUE_ARCHIVOS = MANAGEMENT_BLOCKS.find((block) => block.key === "files")!;

const logo = {
  id: "f-1",
  name: "logo-magarinos.png",
  category: "logos",
  visibility: "shared_with_client",
  archivedAt: null,
  lastVersion: 1,
  sizeBytes: 250_880,
  mimeType: "image/png",
  createdAt: "2026-09-10T09:00:00.000Z",
};

const factura = {
  id: "f-2",
  // El nombre dice ".pdf" y el tipo guardado dice PDF: aquí coinciden. La
  // prueba de que manda el tipo guardado está en el tercer archivo.
  name: "factura-restaurante.pdf",
  category: "billing",
  visibility: "internal",
  archivedAt: null,
  lastVersion: 2,
  sizeBytes: 2_202_009,
  mimeType: "application/pdf",
  createdAt: "2026-09-05T09:00:00.000Z",
};

const disfrazado = {
  id: "f-3",
  // Se llama .jpg y por dentro es un PDF. La columna "Tipo" tiene que
  // decir PDF: es el dato guardado al registrar la versión.
  name: "carta-otono.jpg",
  category: "menus",
  visibility: "shared_with_client",
  archivedAt: null,
  lastVersion: 1,
  sizeBytes: 1_258_291,
  mimeType: "application/pdf",
  createdAt: "2026-09-08T09:00:00.000Z",
};

function sheetData(files: SheetData["files"]): SheetData {
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
    files,
    audit: {
      rows: [],
      actors: [],
      filters: { from: null, to: null, family: null, actorId: null, page: 1 },
      hasMore: false,
    },
  };
}

function pintar(files: SheetData["files"]) {
  return render(
    <EstablishmentSheet
      base="/espacios/demo/restaurantes/est-1"
      slug="demo"
      tab={GESTION}
      block={BLOQUE_ARCHIVOS}
      data={sheetData(files)}
    />,
  );
}

const catalogo: SheetData["files"] = {
  files: [logo, disfrazado, factura],
  selected: null,
  categories: ["billing", "logos", "menus"],
  folders: [
    { category: "billing", count: 2 },
    { category: "logos", count: 4 },
    { category: "menus", count: 6 },
  ],
  total: 12,
  category: null,
};

function tarjeta(titulo: string): HTMLElement {
  const encabezado = screen.getByRole("heading", { name: titulo });
  return encabezado.closest("section") ?? encabezado.parentElement!.parentElement!;
}

describe("vista 16 · las carpetas", () => {
  it("cada carpeta enseña cuántos archivos tiene, y el total", () => {
    pintar(catalogo);
    const rail = within(tarjeta(t.foldersTitle));
    expect(rail.getByRole("link", { name: /Todos los archivos/ })).toHaveTextContent("12");
    expect(rail.getByRole("link", { name: /Logos/ })).toHaveTextContent("4");
    expect(rail.getByRole("link", { name: /Menús/ })).toHaveTextContent("6");
  });

  it("filtrar por una carpeta NO pone las demás a cero", () => {
    // Los recuentos se cuentan sobre el catálogo entero. Si salieran de lo
    // ya filtrado, entrar en "Menús" dejaría Logos en 0 y parecería que
    // los archivos se han perdido.
    pintar({ ...catalogo, files: [disfrazado], category: "menus" });
    const rail = within(tarjeta(t.foldersTitle));
    expect(rail.getByRole("link", { name: /Logos/ })).toHaveTextContent("4");
    expect(rail.getByRole("link", { name: /Menús/ })).toHaveAttribute("aria-current", "true");
  });

  it("las carpetas son enlaces con el filtro en la dirección (CA-22)", () => {
    pintar(catalogo);
    expect(
      within(tarjeta(t.foldersTitle)).getByRole("link", { name: /Menús/ }),
    ).toHaveAttribute(
      "href",
      "/espacios/demo/restaurantes/est-1?vista=gestion&bloque=archivos&tipo=menus",
    );
  });
});

describe("vista 16 · la tabla de archivos", () => {
  it("el Tipo sale del tipo GUARDADO, no de la extensión del nombre", () => {
    // `carta-otono.jpg` es en realidad un PDF. Decir "JPG" sería mentira
    // justo en la columna que existe para no tener que abrirlo.
    pintar(catalogo);
    const tabla = within(screen.getByRole("table"));
    const fila = tabla.getByRole("link", { name: "carta-otono.jpg" }).closest("tr")!;
    expect(within(fila).getByText("PDF")).toBeInTheDocument();
    expect(within(fila).queryByText("JPG")).not.toBeInTheDocument();
  });

  it("enseña el tamaño de la versión vigente", () => {
    pintar(catalogo);
    const fila = within(screen.getByRole("table"))
      .getByRole("link", { name: "logo-magarinos.png" })
      .closest("tr")!;
    expect(within(fila).getByText(t.fileSize("0,2"))).toBeInTheDocument();
  });

  it("un archivo sin versión registrada dice 'no consta', no '0 MB'", () => {
    // Un "0 MB" se lee como un archivo vacío, que es otra cosa.
    pintar({
      ...catalogo,
      files: [{ ...logo, sizeBytes: null, mimeType: null }],
    });
    const tabla = within(screen.getByRole("table"));
    expect(tabla.getAllByText(t.fileSizeUnknown).length).toBeGreaterThan(0);
  });

  it("dice el límite de 25 MB antes de elegir el archivo (RN-ARC-06)", () => {
    pintar(catalogo);
    expect(screen.getByText(t.filesMaxSize("25,0"))).toBeInTheDocument();
  });
});

describe("vista 16 · las copias de seguridad de la web", () => {
  it("no inventa una última copia: dice que no hay integración", () => {
    pintar(catalogo);
    const card = within(tarjeta(t.backupTitle));
    expect(card.getByText(t.backupEmptyReason)).toBeInTheDocument();
  });

  it("advierte que NUNCA habrá copia completa restaurable (§5.5)", () => {
    // Es la frase que la especificación maestra obliga a decir, y la
    // maqueta también la escribe: solo se respalda lo que la plataforma
    // externa deje exportar.
    pintar(catalogo);
    expect(within(tarjeta(t.backupTitle)).getByText(t.backupLimitation)).toBeInTheDocument();
  });

  it("la tarjeta NO se llama 'backup': §5.5 reserva esa palabra", () => {
    pintar(catalogo);
    expect(t.backupTitle).not.toMatch(/backup/i);
  });
});
