import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import { EstablishmentSheet } from "./Sheet";
import { sheetFixture } from "./sheet-fixture";
import { MANAGEMENT_BLOCKS, OPERATION_SECTION_TABS, SHEET_TABS } from "./tabs";
import type { SheetData } from "./Sheet";

/**
 * Página 25 · la solicitud **abierta dentro de la ficha**, debajo de la
 * lista de Solicitudes.
 *
 * Lo que vigila:
 *
 *   · Que la fila abra el panel **aquí**, no que se vaya a otra pantalla:
 *     es lo que permite recorrer la lista sin perderla.
 *   · Que una categoría todavía **propuesta** se diga que lo es
 *     (RN-CLS-04). Enseñar la propuesta del clasificador como si
 *     estuviera decidida es el camino corto a validar sin mirar.
 *   · Que el reloj de primera atención sea **el mismo componente** que la
 *     pantalla de la solicitud, con sus cinco maneras de estar parado.
 *   · Que "no se pudieron leer los adjuntos" y "no lleva ninguno" sigan
 *     siendo cosas distintas (CA-20).
 *   · Que **no se inventen** las subtareas ni las evidencias que el
 *     diseño dibuja aquí: cuelgan del trabajo, que nace al aceptar.
 */
const t = es.establishmentSheet;
/** El reloj lo pinta `CounterBox`, que vive en otro diccionario. */
const reloj = es.teamArea.requests;
const OPERACION = SHEET_TABS.find((tab) => tab.key === "operation")!;
const SOLICITUDES = OPERATION_SECTION_TABS[0];

const BASE = "/espacios/demo/restaurantes/est-1";

function detalle(over: Partial<SheetData["requestDetail"] & object> = {}) {
  return {
    request: {
      id: "r-1",
      code: "SOL-0023",
      description: "Sustituir las fotos de la terraza",
      context: null,
      priority: null,
      priority_reason: null,
      state: "pending_internal_validation",
      created_at: "2026-09-18T09:00:00.000Z",
      validated_category: null,
      validated_summary: null,
      validated_at: null,
      accepted_at: null,
      rejected_at: null,
      rejected_reason: null,
      accepted_start_sla_hours: null,
      establishment_id: "est-1",
      space_id: "sp-1",
    },
    establishment: { id: "est-1", name: "Magariños", code: "EST-0003" },
    proposal: {
      category: "photo" as const,
      summary: "Cambio fotográfico",
      source: "rules",
      fallbackReason: null,
      createdAt: "2026-09-18T09:00:05.000Z",
    },
    attachments: [],
    attachmentsFailed: false,
    history: [],
    counter: { status: null, running: false, acceleratedSla: false },
    estimate: null,
    job: null,
    quote: null,
    canManage: true,
    ...over,
  } as NonNullable<SheetData["requestDetail"]>;
}

function pintar(requestDetail: SheetData["requestDetail"], extra: Partial<SheetData> = {}) {
  return render(
    <EstablishmentSheet
      base={BASE}
      slug="demo"
      tab={OPERACION}
      block={MANAGEMENT_BLOCKS[0]}
      operationSection={SOLICITUDES}
      data={{ ...sheetFixture(), requestDetail, ...extra }}
    />,
  );
}

afterEach(cleanup);

describe("página 25 · la solicitud abierta dentro de la ficha", () => {
  it("sin ninguna abierta, no hay panel", () => {
    pintar(null);
    expect(screen.queryByText(t.openRequestOpenFull)).not.toBeInTheDocument();
  });

  it("la fila de la lista ABRE el panel aquí, no se va a otra pantalla", () => {
    pintar(null, {
      operation: {
        requests: {
          hidden: 0,
          shown: [
            {
              id: "r-1",
              code: "SOL-0023",
              description: "Sustituir las fotos de la terraza",
              state: "pending_internal_validation",
              createdAt: "2026-09-18T09:00:00.000Z",
              authorName: null,
              deepLink: "/espacios/demo/solicitudes/r-1",
            },
          ],
        },
        jobs: { shown: [], hidden: 0 },
        tasks: { shown: [], hidden: 0 },
      },
    });

    expect(
      screen.getByRole("link", { name: /Sustituir las fotos de la terraza/ }),
    ).toHaveAttribute("href", `${BASE}?vista=operacion&seccion=solicitudes&solicitud=r-1`);
  });

  it("enseña el código, la descripción y cuándo se pidió", () => {
    pintar(detalle());

    expect(screen.getByRole("heading", { name: "SOL-0023" })).toBeInTheDocument();
    expect(screen.getByText("Sustituir las fotos de la terraza")).toBeInTheDocument();
    expect(screen.getByText(t.openRequestCreatedAt)).toBeInTheDocument();
  });

  it("una categoría todavía propuesta SE DICE que lo es (RN-CLS-04)", () => {
    pintar(detalle());

    const tipo = screen.getByText(t.openRequestCategory).parentElement!;
    expect(within(tipo).getByText(new RegExp(t.openRequestCategoryProposed))).toBeInTheDocument();
    expect(within(tipo).getByText(new RegExp(es.naming.categories.photo))).toBeInTheDocument();
  });

  it("una categoría ya validada manda, y entonces no se dice «propuesto»", () => {
    pintar(detalle({ request: { ...detalle().request, validated_category: "medium" } }));

    const tipo = screen.getByText(t.openRequestCategory).parentElement!;
    expect(within(tipo).getByText(es.naming.categories.medium)).toBeInTheDocument();
    expect(
      within(tipo).queryByText(new RegExp(t.openRequestCategoryProposed)),
    ).not.toBeInTheDocument();
  });

  it("el reloj sin arrancar NO dice «quedan 0»", () => {
    pintar(detalle());
    /*
      `t.t1NotStarted` no existe en este diccionario: el primer intento lo
      escribió así y `new RegExp(undefined)` casa con TODO, de modo que la
      prueba pasaba sin comprobar nada. Lo delató "Found multiple
      elements". El texto es del diccionario de solicitudes.
    */
    expect(screen.getByText(new RegExp(reloj.t1NotStarted))).toBeInTheDocument();
  });

  it("«no se pudieron leer» y «no lleva ninguno» son cosas distintas", () => {
    pintar(detalle({ attachmentsFailed: true }));
    expect(screen.getByText(t.openRequestAttachmentsFailed)).toBeInTheDocument();
    expect(screen.queryByText(t.openRequestNoAttachments)).not.toBeInTheDocument();

    cleanup();
    pintar(detalle());
    expect(screen.getByText(t.openRequestNoAttachments)).toBeInTheDocument();
  });

  it("sin trabajo dice cuándo nacerá, en vez de un hueco", () => {
    pintar(detalle());
    expect(screen.getByText(t.openRequestNoJob)).toBeInTheDocument();
  });

  it("con trabajo enlaza a él, que es donde están las subtareas y las evidencias", () => {
    pintar(detalle({ job: { id: "j-9", code: "TRA-0009", state: "in_progress" } }));

    expect(screen.getByRole("link", { name: "TRA-0009" })).toHaveAttribute(
      "href",
      "/espacios/demo/trabajos/j-9",
    );
    expect(screen.getByText(t.openRequestJobHint)).toBeInTheDocument();
  });

  it("NO inventa las subtareas ni las evidencias que dibuja el diseño", () => {
    // Las dos cuelgan del trabajo, no de la solicitud: pintarlas bajo una
    // solicitud sin aceptar sería enseñar algo que todavía no existe.
    const { container } = pintar(detalle());

    expect(container.querySelector("input[type='checkbox']")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("se puede cerrar, y cerrar quita la solicitud de la dirección", () => {
    pintar(detalle());

    expect(screen.getByRole("link", { name: t.openRequestClose })).toHaveAttribute(
      "href",
      `${BASE}?vista=operacion&seccion=solicitudes`,
    );
  });

  it("la pantalla completa sigue a un clic", () => {
    pintar(detalle());

    expect(screen.getByRole("link", { name: t.openRequestOpenFull })).toHaveAttribute(
      "href",
      "/espacios/demo/solicitudes/r-1",
    );
  });
});
