import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";
import { EstablishmentSheet } from "./Sheet";
import { MANAGEMENT_BLOCKS, SHEET_TABS } from "./tabs";

import { sheetFixture } from "./sheet-fixture";

/**
 * RN-ARC-10 · el almacenamiento del restaurante, pintado (página 50 del
 * diseño definitivo móvil).
 *
 * Un número junto al nombre de un restaurante se lee como **su** límite, y
 * aquí no hay límite por restaurante: el almacenamiento incluido es del
 * espacio y no se reparte (RN-SUB-13, decisión 38). Por eso lo que esta
 * suite vigila no es la cifra —la suma la comprueba la suite 53 de SQL—
 * sino las dos maneras de que la pantalla mienta con ella:
 *
 *   · Que se lea como una cuota. La frase de al lado no es relleno.
 *   · Que a quien no puede ver la cifra se le pinte un **cero**. `null` es
 *     "no podemos dártela" y no "no ocupa nada", y son lo contrario
 *     (CLAUDE.md MUST NOT: si no hay dato, se dice el motivo).
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
const BLOQUE_ARCHIVOS = MANAGEMENT_BLOCKS.find((block) => block.key === "files")!;

function pintar(storageBytes: number | null) {
  return render(
    <EstablishmentSheet
      base="/espacios/demo/restaurantes/est-1"
      slug="demo"
      tab={GESTION}
      block={BLOQUE_ARCHIVOS}
      data={{ ...sheetFixture(), storageBytes }}
    />,
  );
}

describe("RN-ARC-10 · cuánto ocupa el restaurante", () => {
  it("dice el tamaño con el nombre del restaurante, como en el diseño", () => {
    pintar(Math.round(6.4 * 1024 ** 3));
    expect(screen.getByRole("heading", { name: t.storageTitle })).toBeInTheDocument();
    expect(screen.getByText(/Magariños: 6,4 GB/)).toBeInTheDocument();
  });

  it("un restaurante pequeño NO aparece como «0 GB»", () => {
    // "0 GB" junto al nombre se lee como "no tiene archivos". Tres megas
    // no es no tener nada.
    pintar(3 * 1024 ** 2);
    expect(screen.getByText(/Magariños: 3,0 MB/)).toBeInTheDocument();
    expect(screen.queryByText(/0 GB/)).toBeNull();
  });

  it("RN-SUB-13 · dice que NO es una cuota suya, y enlaza al total del espacio", () => {
    pintar(1024 ** 3);
    expect(screen.getByText(t.storageNotAQuota)).toBeInTheDocument();
    const enlace = screen.getByRole("link", { name: t.storageSpaceLink });
    expect(enlace).toHaveAttribute("href", "/espacios/demo/ajustes/suscripcion");
  });

  it("no repite el total del espacio: ese número vive en la suscripción", () => {
    // Dos copias del mismo número acaban discrepando, y aquí la copia
    // sería la que alguien mira primero.
    pintar(1024 ** 3);
    expect(screen.queryByText(/20 GB|100 GB/)).toBeNull();
  });

  it("sin permiso para verla NO se pinta un cero: se dice el motivo", () => {
    pintar(null);
    expect(screen.getByText(t.storageHiddenTitle)).toBeInTheDocument();
    expect(screen.getByText(t.storageHiddenReason)).toBeInTheDocument();
    expect(screen.queryByText(/Magariños: /)).toBeNull();
    expect(screen.queryByText(/0 KB|0 GB/)).toBeNull();
  });

  it("cero de verdad SÍ es cero, y se distingue de no poder verlo", () => {
    // Un restaurante recién creado ocupa cero, y eso es un dato cierto que
    // se puede dar. Es justo la distinción que `null` existe para no
    // perder.
    pintar(0);
    expect(screen.getByText(/Magariños: 0 KB/)).toBeInTheDocument();
    expect(screen.queryByText(t.storageHiddenTitle)).toBeNull();
  });
});
