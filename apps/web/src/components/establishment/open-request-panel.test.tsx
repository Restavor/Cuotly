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
 *   · Que las subtareas y las evidencias se enseñen **en solo lectura**
 *     (RN-REQ-07): sin una sola casilla que marcar, y diciendo dónde se
 *     marcan. Hasta la decisión 64 no se enseñaban; lo que no ha cambiado
 *     es que se operan en el trabajo.
 *   · Que "todavía no hay trabajo" y "el trabajo no está desglosado" NO se
 *     digan igual, porque no son lo mismo (CA-20).
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
      created_by_team: false,
      on_behalf_reason: null,
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
    jobTasks: [],
    evidence: [],
    quote: null,
    canManage: true,
    ...over,
  } satisfies NonNullable<SheetData["requestDetail"]>;
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

  it("con trabajo enlaza a él, que es donde se marcan las subtareas", () => {
    pintar(detalle({ job: { id: "j-9", code: "TRA-0009", state: "in_progress" } }));

    expect(screen.getByRole("link", { name: "TRA-0009" })).toHaveAttribute(
      "href",
      "/espacios/demo/trabajos/j-9",
    );
  });

  it("RN-REQ-07 · las subtareas se ven, y NO se pueden marcar desde aquí", () => {
    /*
      Hasta la decisión 64 esta prueba decía que las subtareas "no se
      inventan". Ya se enseñan, así que lo que vigila ahora es la otra
      mitad de la regla y la que de verdad importa: **ni una casilla**. Una
      que se pudiera marcar en dos sitios acabaría marcada en uno y no en
      el otro.
    */
    const { container } = pintar(
      detalle({
        job: { id: "j-9", code: "TRA-0009", state: "in_progress" },
        jobTasks: [
          {
            id: "t-1",
            title: "Recortar las fotos",
            description: null,
            state: "completed",
            weight: "light" as const,
            estimatedMinutes: 30,
            plannedDate: null,
            createdAt: "2026-09-18T10:00:00.000Z",
            assigneeId: "u-1",
            assigneeName: "Ana Rivas",
            hasPendingReassignment: false,
          },
          {
            id: "t-2",
            title: "Subirlas a la web",
            description: null,
            state: "pending",
            weight: "normal" as const,
            estimatedMinutes: 45,
            plannedDate: null,
            createdAt: "2026-09-18T10:05:00.000Z",
            assigneeId: null,
            assigneeName: null,
            hasPendingReassignment: false,
          },
        ],
      }),
    );

    expect(screen.getByText("Recortar las fotos")).toBeInTheDocument();
    expect(screen.getByText("Subirlas a la web")).toBeInTheDocument();
    // "1 de 2", contado por `taskProgress()`.
    expect(screen.getByText(t.subtasksTitleWithCount(1, 2))).toBeInTheDocument();
    // Ni una casilla, ni un botón dentro del bloque.
    expect(container.querySelector("input[type='checkbox']")).toBeNull();
    expect(screen.getByText(t.subtasksReadOnly)).toBeInTheDocument();
    // Y sin responsable se dice, en vez de dejar el hueco mudo (CA-20).
    expect(screen.getByText(new RegExp(t.subtasksUnassigned))).toBeInTheDocument();
  });

  it("RN-REQ-07 · sin trabajo NO se pinta una lista vacía: se dice por qué", () => {
    pintar(detalle());

    expect(screen.getByText(t.subtasksNoJob)).toBeInTheDocument();
    expect(screen.getByText(t.evidenceNoJob)).toBeInTheDocument();
    // Y no se dice lo otro, que significaría que el trabajo existe y nadie
    // lo ha desglosado.
    expect(screen.queryByText(t.subtasksEmpty)).not.toBeInTheDocument();
  });

  it("RN-REQ-07 · con trabajo sin desglosar dice ESO, no que no haya trabajo", () => {
    pintar(detalle({ job: { id: "j-9", code: "TRA-0009", state: "in_progress" } }));

    expect(screen.getByText(t.subtasksEmpty)).toBeInTheDocument();
    expect(screen.getByText(t.evidenceEmpty)).toBeInTheDocument();
    expect(screen.queryByText(t.subtasksNoJob)).not.toBeInTheDocument();
  });

  it("RN-REQ-07 · la evidencia se puede descargar, y nada más", () => {
    const { container } = pintar(
      detalle({
        job: { id: "j-9", code: "TRA-0009", state: "published" },
        evidence: [
          {
            id: "f-1",
            name: "terraza.jpg",
            sizeBytes: 2 * 1024 * 1024,
            mimeType: "image/jpeg",
            attachedAt: "2026-09-19T08:00:00.000Z",
          },
        ],
      }),
    );

    // La descarga va por la ruta que comprueba `can_read_file()` y
    // contesta 404 a quien no puede: un 403 confirmaría que existe.
    expect(screen.getByRole("link", { name: "terraza.jpg" })).toHaveAttribute(
      "href",
      "/api/archivos/f-1",
    );
    // Ni campo de subida ni botón de adjuntar: se adjuntan en el trabajo.
    expect(container.querySelector("input[type='file']")).toBeNull();
    expect(screen.getByText(t.evidenceReadOnly)).toBeInTheDocument();
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
