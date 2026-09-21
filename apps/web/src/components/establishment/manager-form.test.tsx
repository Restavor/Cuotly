import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";
import { EstablishmentSheet } from "./Sheet";
import { sheetFixture } from "./sheet-fixture";
import { MANAGEMENT_BLOCKS, SHEET_TABS } from "./tabs";
import type { SheetData } from "./Sheet";

/**
 * RN-EST-19 · el responsable del restaurante, en Gestión · Datos.
 *
 * Lo que vigila, y lo primero es lo que más:
 *
 *   · Que **"Sin responsable" sea la primera opción** del desplegable. No
 *     es un detalle de orden: dejarlo sin nadie es una respuesta tan
 *     válida como cualquier otra (decisión 63), y si estuviera la última
 *     —o detrás de un botón de "quitar"— costaría más que las demás y la
 *     pantalla estaría empujando a asignar a alguien.
 *   · Que **solo se ofrezca a quien puede cambiarlo**, y que a los demás
 *     se les enseñe quién lo lleva en vez de nada.
 *   · Que "no lo lleva nadie" y "hay alguien cuyo nombre no puedo leer"
 *     sigan siendo cosas distintas (CA-20).
 *   · Que no se llame **supervisor** en ninguna parte: ese nombre ya
 *     significa otra cosa en Cuotly.
 */
vi.mock("@/app/espacios/[slug]/restaurantes/[id]/actions", () => ({
  setEstablishmentManager: vi.fn(),
}));

const t = es.teamArea.establishments;
const GESTION = SHEET_TABS.find((tab) => tab.key === "management")!;
const DATOS = MANAGEMENT_BLOCKS.find((block) => block.key === "establishmentData")!;

const EQUIPO = [
  { id: "u-1", name: "Ana Rivas" },
  { id: "u-2", name: "Marta Vidal" },
];

function pintar(manager: SheetData["manager"], canManageClients = true) {
  return render(
    <EstablishmentSheet
      base="/espacios/demo/restaurantes/est-1"
      slug="demo"
      tab={GESTION}
      block={DATOS}
      data={{ ...sheetFixture(), canManageClients, manager }}
    />,
  );
}

afterEach(cleanup);

describe("RN-EST-19 · el responsable del restaurante", () => {
  it("«Sin responsable» es la PRIMERA opción, no la última", () => {
    pintar({ currentId: null, currentName: null, team: EQUIPO });

    const opciones = screen
      .getByRole("combobox", { name: new RegExp(t.manager) })
      .querySelectorAll("option");

    expect(opciones[0].textContent).toBe(t.noManager);
    expect(opciones[0]).toHaveValue("");
    expect([...opciones].map((o) => o.textContent)).toEqual([
      t.noManager,
      "Ana Rivas",
      "Marta Vidal",
    ]);
  });

  it("el responsable de ahora sale elegido", () => {
    pintar({ currentId: "u-2", currentName: "Marta Vidal", team: EQUIPO });

    expect(screen.getByRole("combobox", { name: new RegExp(t.manager) })).toHaveValue("u-2");
  });

  it("sin responsable, el desplegable arranca en vacío y no en la primera persona", () => {
    pintar({ currentId: null, currentName: null, team: EQUIPO });

    expect(screen.getByRole("combobox", { name: new RegExp(t.manager) })).toHaveValue("");
  });

  it("quien no puede cambiarlo NO ve el formulario, pero sí quién lo lleva", () => {
    pintar({ currentId: "u-2", currentName: "Marta Vidal", team: EQUIPO }, false);

    expect(screen.queryByRole("combobox", { name: new RegExp(t.manager) })).not.toBeInTheDocument();
    expect(screen.getByText("Marta Vidal")).toBeInTheDocument();
  });

  it("sin permiso y sin responsable, dice que no lo lleva nadie", () => {
    pintar({ currentId: null, currentName: null, team: [] }, false);

    expect(screen.getByText(t.noManager)).toBeInTheDocument();
  });

  it("sin permiso, con responsable y sin nombre legible, NO dice «sin responsable»", () => {
    pintar({ currentId: "u-9", currentName: null, team: [] }, false);

    expect(screen.getByText(t.managerUnknown)).toBeInTheDocument();
    expect(screen.queryByText(t.noManager)).not.toBeInTheDocument();
  });

  it("no se llama «supervisor» en ninguna parte", () => {
    const { container } = pintar({ currentId: null, currentName: null, team: EQUIPO });
    expect(container.textContent).not.toMatch(/supervisor/i);
  });
});
