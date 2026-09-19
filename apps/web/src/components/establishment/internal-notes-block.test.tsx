import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";
import type { SheetData } from "./Sheet";
import { EstablishmentSheet } from "./Sheet";
import { MANAGEMENT_BLOCKS, SHEET_TABS } from "./tabs";

import { sheetFixture } from "./sheet-fixture";

/**
 * RN-EST-14 · las notas internas como bloque de Gestión.
 *
 * El diseño definitivo las mueve aquí desde la conversación, y **mover una
 * pantalla de sitio es justo cuando se pierde una regla**: la de aquí es
 * RN-EST-13, que dice que los clientes no ven las notas internas nunca, y
 * RN-MSG-04, que llama fallo grave a mezclar lo interno con lo que ve el
 * cliente.
 *
 * Por eso esta suite no comprueba que el bloque se pinte: comprueba que
 * **cuando quien mira no tiene nada que ver con las notas, no se pinta ni
 * el título**. Una caja vacía titulada "Notas internas" ya le cuenta al
 * cliente que existen, y eso es la mitad de la fuga.
 *
 * Quién puede leerlas lo decide `can_read_establishment_notes()` en el
 * servidor; `canRead` es su respuesta, no un permiso que calcule esta
 * pantalla (CLAUDE.md: el cliente nunca es la autoridad).
 */
afterEach(cleanup);

vi.mock("./UploadFileForm", () => ({
  UploadFileForm: () => <div data-testid="subir-archivo">subir</div>,
}));
vi.mock("./ShareFileButton", () => ({
  ShareFileButton: () => <div data-testid="compartir">compartir</div>,
}));

const GESTION = SHEET_TABS.find((tab) => tab.key === "management")!;
const BLOQUE_NOTAS = MANAGEMENT_BLOCKS.find((block) => block.key === "internalNotes")!;
const BLOQUE_ESTADO = MANAGEMENT_BLOCKS.find((block) => block.key === "serviceStatus")!;
const BLOQUE_COPIAS = MANAGEMENT_BLOCKS.find((block) => block.key === "backups")!;

function pintar(notes: SheetData["notes"], block = BLOQUE_NOTAS) {
  return render(
    <EstablishmentSheet
      base="/espacios/demo/restaurantes/est-1"
      slug="demo"
      tab={GESTION}
      block={block}
      data={{ ...sheetFixture(), notes }}
    />,
  );
}

const unaNota: SheetData["notes"] = {
  canRead: true,
  canRestrict: true,
  notes: [
    {
      id: "n-1",
      body: "El dueño prefiere que le llamemos por la tarde.",
      operational: true,
      authorName: "Pelayo",
      createdAt: "2026-09-10T10:00:00.000Z",
      mine: false,
    },
  ],
};

describe("RN-EST-14 · las notas internas en Gestión", () => {
  it("quien puede leerlas las ve, con su insignia de «solo equipo»", () => {
    pintar(unaNota);
    expect(screen.getByRole("heading", { name: es.notes.title })).toBeInTheDocument();
    expect(screen.getByText(es.notes.teamOnly)).toBeInTheDocument();
    expect(screen.getByText(/le llamemos por la tarde/)).toBeInTheDocument();
  });

  it("RN-EST-13 · quien no tiene nada que ver con ellas NO ve ni el título", () => {
    // Ni siquiera vacío: una caja titulada "Notas internas" diciendo "no
    // hay ninguna" ya le cuenta al cliente que existen.
    pintar({ canRead: false, canRestrict: false, notes: [] });
    expect(screen.queryByRole("heading", { name: es.notes.title })).toBeNull();
    expect(screen.queryByText(es.notes.teamOnly)).toBeNull();
    expect(screen.queryByText(es.notes.emptyTitle)).toBeNull();
  });

  it("sin notas que enseñar, quien SÍ puede leerlas ve el motivo, no un hueco", () => {
    pintar({ canRead: true, canRestrict: false, notes: [] });
    expect(screen.getByText(es.notes.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(es.notes.emptyReason)).toBeInTheDocument();
  });

  it("no se cuelan en otro bloque de Gestión", () => {
    // Estaban en la conversación y las copias estaban con el estado del
    // servicio. Cada una tiene ahora su bloque, y solo el suyo: si una se
    // quedara pintada de más, el enlace «?bloque=estado» seguiría
    // enseñándola y nadie se enteraría.
    pintar(unaNota, BLOQUE_ESTADO);
    expect(screen.queryByRole("heading", { name: es.notes.title })).toBeNull();
    cleanup();

    pintar(unaNota, BLOQUE_COPIAS);
    expect(screen.queryByRole("heading", { name: es.notes.title })).toBeNull();
    expect(
      screen.getByRole("heading", { name: es.establishmentSheet.backupsTitle }),
    ).toBeInTheDocument();
  });
});
