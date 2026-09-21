import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import { EstablishmentSheet } from "./Sheet";
import { sheetFixture } from "./sheet-fixture";
import { MANAGEMENT_BLOCKS, SHEET_TABS } from "./tabs";
import type { SheetData } from "./Sheet";

/**
 * Página 24 · "Próxima publicación de menú" en el Resumen de la ficha.
 *
 * Hasta hoy este bloque era un marcador que decía que Menú Diario llegaba
 * con la Fase 2. Llegó en el Hito 11, y el marcador se quedó: enseñaba
 * "no existe todavía" en restaurantes que llevaban meses publicando.
 *
 * Lo que vigila:
 *
 *   · Que **sin el servicio contratado** y **con el servicio y sin nada
 *     programado** digan cosas distintas. Lo primero se arregla
 *     contratando Menú Diario; lo segundo, preparando un menú. Un mismo
 *     texto para los dos manda a la mitad de la gente al sitio
 *     equivocado (CA-20).
 *   · Que se escriba el **estado**, que es lo que decide si alguien tiene
 *     que hacer algo: la misma fecha se lee igual esté lista para
 *     publicar o pendiente de asignar, y no son lo mismo.
 *   · Que los nombres de tipo y estado salgan de `naming`, el único sitio
 *     donde una cosa tiene nombre (CA-21).
 */
const t = es.establishmentSheet;
const RESUMEN = SHEET_TABS.find((tab) => tab.key === "summary")!;

function pintar(nextMenu: SheetData["nextMenu"]) {
  return render(
    <EstablishmentSheet
      base="/espacios/restavor/restaurantes/est-1"
      slug="restavor"
      tab={RESUMEN}
      block={MANAGEMENT_BLOCKS[0]}
      data={{ ...sheetFixture(), nextMenu }}
    />,
  );
}

afterEach(cleanup);

describe("página 24 · Próxima publicación de menú", () => {
  it("sin el servicio contratado lo dice, y no ofrece gestionarlo", () => {
    pintar({ kind: "no_service" });

    expect(screen.getByText(t.nextMenuNoServiceTitle)).toBeInTheDocument();
    // No hay menú que gestionar: el enlace llevaría a una pantalla que
    // solo sabe decir que no hay servicio.
    expect(screen.queryByText(t.nextMenuLink)).not.toBeInTheDocument();
  });

  it("contratado y sin nada programado dice OTRA cosa, no lo mismo", () => {
    pintar({ kind: "none" });

    expect(screen.getByText(t.nextMenuNoneTitle)).toBeInTheDocument();
    expect(screen.queryByText(t.nextMenuNoServiceTitle)).not.toBeInTheDocument();
    // Y aquí sí hay a dónde ir: a preparar uno.
    expect(screen.getByText(t.nextMenuLink)).toBeInTheDocument();
  });

  it("con una publicación por delante dice cuándo, cuál y en qué estado", () => {
    pintar({
      kind: "menu",
      id: "m1",
      name: "Menú semanal",
      menuKind: "daily",
      targetDate: "2026-10-07",
      state: "ready_to_publish",
    });

    expect(screen.getByText(/Menú semanal/)).toBeInTheDocument();
    expect(screen.getByText(/Diario/)).toBeInTheDocument();
    expect(screen.getByText(es.naming.states.menu.ready_to_publish)).toBeInTheDocument();
  });

  it("el estado distingue dos publicaciones que la fecha no distingue", () => {
    pintar({
      kind: "menu",
      id: "m1",
      name: "Menú semanal",
      menuKind: "daily",
      targetDate: "2026-10-07",
      state: "pending_assignment",
    });

    expect(screen.getByText(es.naming.states.menu.pending_assignment)).toBeInTheDocument();
    expect(screen.queryByText(es.naming.states.menu.ready_to_publish)).not.toBeInTheDocument();
  });

  it("ya no queda rastro del marcador de «Fase 2»", () => {
    pintar({ kind: "no_service" });

    expect(screen.queryByText(/Fase 2/)).not.toBeInTheDocument();
  });
});
