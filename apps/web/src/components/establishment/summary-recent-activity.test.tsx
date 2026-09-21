import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import { EstablishmentSheet } from "./Sheet";
import { sheetFixture } from "./sheet-fixture";
import { MANAGEMENT_BLOCKS, SHEET_TABS } from "./tabs";
import type { SheetData } from "./Sheet";

/**
 * Página 24 · "Actividad reciente" en el Resumen de la ficha.
 *
 * Lo que vigila:
 *
 *   · Que salga de `recentActivity` y **no** de `audit`. Los filtros de la
 *     pestaña Historial viven en la dirección y siguen puestos al volver
 *     al Resumen: si este bloque recortara `audit`, enseñaría lo último
 *     *de lo filtrado* haciéndolo pasar por lo último (CA-20).
 *   · Que "sin actor" y "con actor y sin nombre" sigan siendo **cosas
 *     distintas**. Sin actor es el sistema —un barrido, una emisión
 *     automática—; con actor y sin nombre es que quien mira no puede
 *     resolver ese perfil, y llamarlo "Sistema" sería mentir justo en el
 *     dato que dice quién hizo qué.
 *   · Que sin actividad se diga qué llegaría a aparecer, no un hueco.
 */
const t = es.establishmentSheet;

function fila(over: Partial<SheetData["audit"]["rows"][number]> = {}) {
  return {
    id: "a1",
    createdAt: "2026-09-20T10:00:00.000Z",
    action: "establishment.data_updated",
    entityType: "establishment",
    entityId: "est-1",
    actorId: "u1",
    actorName: "Marta",
    changes: [],
    reason: null,
    ...over,
  };
}

const RESUMEN = SHEET_TABS.find((tab) => tab.key === "summary")!;

function pintar(data: Partial<SheetData>) {
  return render(
    <EstablishmentSheet
      base="/espacios/restavor/restaurantes/est-1"
      slug="restavor"
      tab={RESUMEN}
      block={MANAGEMENT_BLOCKS[0]}
      data={{ ...sheetFixture(), ...data }}
    />,
  );
}

afterEach(cleanup);

describe("página 24 · Actividad reciente en el Resumen", () => {
  it("enseña quién hizo qué, con su nombre", () => {
    pintar({ recentActivity: [fila()] });

    // El título del bloque y, dentro de la misma tarjeta, la línea de
    // quién lo hizo. Se sube hasta la tarjeta por su borde redondeado,
    // que es lo que la delimita.
    const tarjeta = screen.getByText(t.recentActivityTitle).closest("[class*='rounded-']")!;
    expect(within(tarjeta as HTMLElement).getByText(/Marta/)).toBeInTheDocument();
  });

  it("sale de `recentActivity`, NO de las filas filtradas de Historial", () => {
    pintar({
      recentActivity: [fila({ id: "sin-filtrar", actorName: "Marta" })],
      audit: {
        rows: [fila({ id: "filtrada", actorName: "SOLO EN HISTORIAL" })],
        actors: [],
        filters: { from: "2026-01-01", to: null, family: null, actorId: null, page: 1 },
        hasMore: false,
      },
    });

    expect(screen.getByText(/Marta/)).toBeInTheDocument();
    expect(screen.queryByText(/SOLO EN HISTORIAL/)).not.toBeInTheDocument();
  });

  it("sin actor es el sistema, que es la verdad y no un hueco", () => {
    pintar({ recentActivity: [fila({ actorId: null, actorName: null })] });

    expect(screen.getByText(new RegExp(t.auditSystemActor))).toBeInTheDocument();
  });

  it("con actor y sin nombre NO se llama «Sistema»", () => {
    // Pasa cuando quien mira no puede resolver ese perfil. Decir
    // "Sistema" sería mentir en el dato que dice quién hizo qué.
    pintar({ recentActivity: [fila({ actorId: "u9", actorName: null })] });

    expect(screen.getByText(new RegExp(t.auditUnknownActor))).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(t.auditSystemActor))).not.toBeInTheDocument();
  });

  it("sin actividad dice qué llegaría a aparecer", () => {
    pintar({ recentActivity: [] });

    expect(screen.getByText(t.recentActivityEmptyTitle)).toBeInTheDocument();
    expect(screen.getByText(t.recentActivityEmptyReason)).toBeInTheDocument();
  });

  it("no enseña más de cinco: el resto está en Historial", () => {
    pintar({
      recentActivity: Array.from({ length: 9 }, (_, i) =>
        fila({ id: `a${i}`, actorName: `Persona ${i}` }),
      ),
    });

    for (const i of [0, 4]) {
      expect(screen.getByText(new RegExp(`Persona ${i}`))).toBeInTheDocument();
    }
    for (const i of [5, 8]) {
      expect(screen.queryByText(new RegExp(`Persona ${i}`))).not.toBeInTheDocument();
    }
  });
});
