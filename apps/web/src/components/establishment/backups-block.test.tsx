import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";

vi.mock("./service-status-actions", () => ({
  createEstablishmentBackup: vi.fn(),
}));

import { BackupsBlock, type BackupRow } from "./BackupsBlock";

/**
 * M83 · las copias de seguridad en tabla, con el detalle de la elegida.
 *
 * Lo que vigila:
 *
 *   · RN-BCK-02 · la copia del barrido diario se llama "Copia diaria", no
 *     se le pone el nombre de nadie.
 *   · RN-BCK-05 · la descarga va por la ruta que comprueba el permiso.
 *   · RN-BCK-09 · el detalle dice que lleva el listado de los archivos, no
 *     los archivos.
 *   · RN-BCK-08 · sin copias, se dice por qué, no una tabla vacía.
 */
const t = es.establishmentSheet;

afterEach(cleanup);

const COPIAS: readonly BackupRow[] = [
  {
    id: "b-2",
    takenAt: "2026-09-18T08:24:00Z",
    sizeBytes: 2048,
    counts: { requests: 3, menus: 2, files: 5, conversations: 1 },
    automatic: false,
    authorName: "Ana",
  },
  {
    id: "b-1",
    takenAt: "2026-09-11T06:15:00Z",
    sizeBytes: 1024,
    counts: { requests: 1, menus: 0, files: 0, conversations: 0 },
    automatic: true,
    authorName: null,
  },
];

function pintar(selectedId: string | null = null, backups: readonly BackupRow[] = COPIAS) {
  render(
    <BackupsBlock
      establishmentId="e-1"
      backups={backups}
      timezone="Europe/Madrid"
      canManage={false}
      blockHref="/espacios/restavor/restaurantes/e-1?vista=gestion&bloque=copias"
      selectedId={selectedId}
    />,
  );
}

describe("M83 · copias de seguridad", () => {
  it("RN-BCK-02 · la copia del barrido es la «Copia diaria» y la otra lleva su autor", () => {
    pintar();
    const filas = screen.getAllByRole("row");
    expect(within(filas[1]!).getByText("Ana")).toBeInTheDocument();
    expect(within(filas[2]!).getByText(t.backupsAutomatic)).toBeInTheDocument();
  });

  it("RN-BCK-05 · sin elegir, el detalle es la más reciente y se descarga por la ruta con permiso", () => {
    pintar();
    const detalle = screen.getByRole("complementary", { name: t.backupsDetailTitle });
    expect(within(detalle).getByRole("link", { name: t.backupsDownloadSelected })).toHaveAttribute(
      "href",
      "/api/copias/b-2",
    );
  });

  it("RN-BCK-09 · el detalle de la elegida dice que lleva el listado, no los archivos", () => {
    pintar("b-1");
    const detalle = screen.getByRole("complementary", { name: t.backupsDetailTitle });
    expect(within(detalle).getByText(/Listado de 0 archivos/)).toBeInTheDocument();
    expect(within(detalle).getByRole("link", { name: t.backupsDownloadSelected })).toHaveAttribute(
      "href",
      "/api/copias/b-1",
    );
    const enlace = screen.getAllByRole("link").find((a) => a.getAttribute("aria-current") === "true");
    expect(enlace).toHaveAttribute(
      "href",
      "/espacios/restavor/restaurantes/e-1?vista=gestion&bloque=copias&copia=b-1",
    );
  });

  it("RN-BCK-08 · sin copias se dice por qué", () => {
    pintar(null, []);
    expect(screen.getByText(t.backupsEmptyTitle)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
