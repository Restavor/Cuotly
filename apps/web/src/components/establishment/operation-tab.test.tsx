import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import type { SheetData } from "./Sheet";
import { EstablishmentSheet } from "./Sheet";
import { SHEET_TABS, MANAGEMENT_BLOCKS, OPERATION_SECTION_TABS } from "./tabs";

/**
 * Vista 04 · la Operación de la ficha, pintada.
 *
 * Por qué esta pantalla estrena las pruebas de componente del proyecto (el
 * entorno estaba montado —jsdom y `@testing-library/jest-dom` en
 * `vitest.setup.ts`— y no lo usaba nadie): lo que la vista 04 pide no es
 * un cálculo, es una composición —cuatro tarjetas, qué fila va primero,
 * qué se dice cuando no hay nada— y eso las pruebas de `src/core` no lo
 * ven. La alternativa era un recorrido de Playwright, y este contenedor no
 * puede: la salida de red hacia el proyecto de Supabase está denegada.
 *
 * Lo que NO comprueba: que se vea bonito. Comprueba lo que se puede
 * afirmar sin ojos —qué texto sale, en qué orden y qué enlaza a dónde—,
 * que es justo donde se cuelan los fallos de "enseña uno de seis y calla
 * los cinco".
 */
const t = es.establishmentSheet;

/**
 * La limpieza va escrita a mano a propósito. Testing Library la hace sola
 * cuando Vitest corre con `globals: true`, y este proyecto no los usa
 * (`vitest.config.ts`): sin esta línea, cada `render()` deja la pantalla
 * anterior colgando del documento y el segundo test se encuentra dos
 * tarjetas "Solicitudes" y falla con "Found multiple elements". Se
 * descubrió así, en el primer test de componente del proyecto.
 */
afterEach(cleanup);

const OPERACION = SHEET_TABS.find((tab) => tab.key === "operation")!;

function sheetData(operation: SheetData["operation"]): SheetData {
  return {
    header: {
      id: "est-1",
      name: "Magariños",
      code: "EST-0003",
      status: "active",
      groupId: "g-1",
      groupName: "Grupo Magariños",
      planId: "p-1",
      planName: "Premium",
      planPriceCents: 59900,
      services: [],
      commitmentEndsAt: null,
      commitmentStartedAt: null,
      planSubscriptionId: "sub-1",
      planTerms: null,
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
    transfer: null,
    backups: [],
    notes: { canRead: false, canRestrict: false, notes: [] },
    storageBytes: null,
    canProposeTransfer: false,
    integrations: null,
    digital: null,
    opportunities: null,
    opportunityViewer: "approver",
    reports: [],
    summary: {
      bags: [],
      attention: [],
      pendingValidation: [],
      openRequests: 0,
      currentJob: null,
      liveJobs: 0,
      payment: { allowed: false, outstandingCents: 0, overdueCount: 0 },
    },
    operation,
    counts: { requestsByState: [], jobsByState: [], files: 0 },
    today: "2026-09-11",
    payments: { allowed: false, charges: [], payments: [], quotes: [] },
    users: { rows: [], failed: false },
    invitations: { rows: [], failed: false },
    canManageClients: false,
    staff: [],
    files: { files: [], selected: null, categories: [], folders: [], total: 0, category: null },
    timeZone: "Europe/Madrid",
    audit: {
      rows: [],
      actors: [],
      filters: { from: null, to: null, family: null, actorId: null, page: 1 },
      hasMore: false,
    },
    recentActivity: [],
    nextMenu: { kind: "no_service" },
    requestDetail: null,
    manager: { currentId: null, currentName: null, team: [] },
    photoUrl: null,
  };
}

const vacia: SheetData["operation"] = {
  requests: { shown: [], hidden: 0 },
  jobs: { shown: [], hidden: 0 },
  tasks: { shown: [], hidden: 0 },
  menus: null,
};

/*
  Página 25 · la Operación enseña **una sección cada vez**, no las cuatro
  tarjetas a la vez. Por eso `pintar()` recibe cuál, y por defecto la
  primera, que es la que sale al entrar.
*/
function pintar(
  operation: SheetData["operation"] = vacia,
  seccion = OPERATION_SECTION_TABS[0],
  extra: Partial<SheetData> = {},
) {
  return render(
    <EstablishmentSheet
      base="/espacios/demo/restaurantes/est-1"
      slug="demo"
      tab={OPERACION}
      block={MANAGEMENT_BLOCKS[0]}
      operationSection={seccion}
      data={{ ...sheetData(operation), ...extra }}
    />,
  );
}

/** Una de las cuatro secciones, por su clave. */
function seccion(key: (typeof OPERATION_SECTION_TABS)[number]["key"]) {
  return OPERATION_SECTION_TABS.find((s) => s.key === key)!;
}

/** La tarjeta entera, buscada por su titular, para mirar dentro de ella. */
function tarjeta(titulo: string): HTMLElement {
  const encabezado = screen.getByRole("heading", { name: titulo });
  return encabezado.closest("section") ?? encabezado.parentElement!.parentElement!;
}

describe("página 25 · la Operación son cuatro secciones, una cada vez", () => {
  it("las cuatro del dibujo están en la subnavegación, y ninguna más", () => {
    pintar();
    const nav = screen.getByRole("navigation", { name: t.operationSectionsLabel });
    const nombres = within(nav)
      .getAllByRole("link")
      .map((enlace) => enlace.textContent);
    expect(nombres).toEqual([
      t.operationSections.requests,
      t.operationSections.jobs,
      t.operationSections.tasks,
      t.operationSections.dailyMenu,
    ]);
  });

  it("solo se enseña la sección elegida, no las cuatro a la vez", () => {
    pintar(vacia, seccion("jobs"));

    expect(screen.getByRole("heading", { name: t.jobsTitle })).toBeInTheDocument();
    for (const titulo of [t.requestsTitle, t.tasksTitle, t.dailyMenuTitle]) {
      expect(screen.queryByRole("heading", { name: titulo })).not.toBeInTheDocument();
    }
  });

  it("al entrar sale Solicitudes, que es la primera", () => {
    pintar();
    expect(screen.getByRole("heading", { name: t.requestsTitle })).toBeInTheDocument();
  });

  it("la sección elegida se marca como la página actual", () => {
    pintar(vacia, seccion("tasks"));
    const nav = screen.getByRole("navigation", { name: t.operationSectionsLabel });
    const actual = within(nav).getByRole("link", { current: "page" });
    expect(actual).toHaveTextContent(t.operationSections.tasks);
  });

  it("son ENLACES con la sección en la dirección, no botones (CA-22)", () => {
    pintar();
    const nav = screen.getByRole("navigation", { name: t.operationSectionsLabel });
    expect(within(nav).queryByRole("button")).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: t.operationSections.tasks })).toHaveAttribute(
      "href",
      "/espacios/demo/restaurantes/est-1?vista=operacion&seccion=tareas",
    );
  });

  it("Menú Diario ya NO dice que llega con la Fase 2: llegó en el Hito 11", () => {
    pintar(vacia, seccion("dailyMenu"));

    // Sin el servicio contratado dice eso, que es lo cierto, en vez del
    // marcador que anunciaba un servicio que ya existe.
    expect(screen.getByText(t.nextMenuNoServiceTitle)).toBeInTheDocument();
    expect(screen.queryByText(/Fase 2/)).not.toBeInTheDocument();
  });

  it("sin nada que enseñar, cada sección dice su motivo y no se queda en blanco", () => {
    for (const [clave, motivo] of [
      ["requests", t.requestsEmptyTitle],
      ["jobs", t.jobsEmptyTitle],
      ["tasks", t.tasksEmptyTitle],
    ] as const) {
      cleanup();
      pintar(vacia, seccion(clave));
      expect(screen.getByText(motivo)).toBeInTheDocument();
    }
  });

  it("la ficha de datos ya no está aquí: se lee entera en Gestión", () => {
    // La maqueta no la tiene en Operación, y repetida en dos pestañas
    // acabaría diciendo dos cosas distintas.
    for (const clave of ["requests", "jobs", "tasks", "dailyMenu"] as const) {
      cleanup();
      pintar(vacia, seccion(clave));
      expect(screen.queryByText(t.dataTitle)).not.toBeInTheDocument();
    }
  });
});

const conDatos: SheetData["operation"] = {
  requests: {
    hidden: 15,
    shown: [
      {
        id: "r-1",
        code: "SOL-0023",
        description: "Actualizar la carta de verano",
        state: "pending_internal_validation",
        createdAt: "2026-09-10T08:24:00.000Z",
        authorName: "Nuria Ferreiro (Magariños)",
        deepLink: "/espacios/demo/solicitudes/r-1",
        category: { key: "small", proposed: true },
        job: null,
      },
      {
        id: "r-2",
        code: "SOL-0022",
        description: "Nueva fotografía de terraza",
        state: "published",
        createdAt: "2026-09-09T16:10:00.000Z",
        authorName: null,
        deepLink: "/espacios/demo/solicitudes/r-2",
        category: { key: "medium", proposed: false },
        job: { id: "j-9", code: "TRB-0009" },
      },
    ],
  },
  jobs: {
    hidden: 0,
    shown: [
      {
        id: "j-1",
        code: "TRB-0015",
        title: "Cambiar el horario del sábado",
        state: "assigned",
        deepLink: "/espacios/demo/trabajos/j-1",
        counter: "t2",
        remainingMinutes: 120,
        overdue: false,
        assigneeId: "u-1",
        assigneeName: "Marta Rey",
        evidence: 2,
      },
      {
        id: "j-2",
        code: "TRB-0011",
        title: "Actualizar la fotografía del equipo",
        state: "in_progress",
        deepLink: "/espacios/demo/trabajos/j-2",
        counter: "t3",
        remainingMinutes: null,
        overdue: true,
        assigneeId: null,
        assigneeName: null,
        evidence: null,
      },
    ],
  },
  tasks: {
    hidden: 1,
    shown: [
      {
        id: "t-1",
        title: "Retocar las fotografías seleccionadas",
        state: "in_progress",
        weight: "high",
        estimatedMinutes: 120,
        assigneeName: "Diego Sanz",
        jobCode: "TRB-0014",
        plannedDate: "2026-09-13",
        deepLink: "/espacios/demo/trabajos/j-3/tareas?tarea=t-1",
      },
      {
        id: "t-2",
        title: "Revisar el crédito del fotógrafo",
        state: "pending",
        weight: "light",
        estimatedMinutes: 15,
        assigneeName: null,
        jobCode: null,
        plannedDate: null,
        deepLink: null,
      },
    ],
  },
  menus: {
    consumed: 12,
    included: 30,
    usedPercent: 40,
    cycleStart: "2026-09-14T07:00:00.000Z",
    cycleEnd: "2026-10-14T07:00:00.000Z",
    rows: {
      hidden: 3,
      shown: [
        {
          id: "m-1",
          name: "Menú del domingo",
          kind: "daily",
          targetDate: "2026-09-20",
          state: "publication_requested",
          templateName: "Plantilla clásica",
          deepLink: "/espacios/demo/menu-diario/m-1",
        },
        {
          id: "m-2",
          name: "Menú del sábado",
          kind: "daily",
          targetDate: "2026-09-19",
          state: "published",
          templateName: null,
          deepLink: "/espacios/demo/menu-diario/m-2",
        },
      ],
    },
  },
};

describe("vista 04 · lo que enseña cada fila", () => {

  it("una solicitud lleva su autor y su momento; sin autor, solo el momento", () => {
    pintar(conDatos, seccion("requests"));
    const card = within(tarjeta(t.requestsTitle));
    expect(card.getByText(/Nuria Ferreiro \(Magariños\) · /)).toBeInTheDocument();
    // La segunda no tiene nombre que enseñar y no se rellena con el uuid.
    expect(card.queryByText(/r-2/)).not.toBeInTheDocument();
  });

  it("un trabajo fuera de plazo lo dice, y no las horas que le quedarían", () => {
    pintar(conDatos, seccion("jobs"));
    const card = within(tarjeta(t.jobsTitle));
    expect(card.getByText(t.currentJobOverdue)).toBeInTheDocument();
    expect(card.getByText(t.currentJobToStart("2 h"))).toBeInTheDocument();
  });

  it("una tarea sin repartir lo dice, y sin trabajo no es un enlace", () => {
    pintar(conDatos, seccion("tasks"));
    const card = within(tarjeta(t.tasksTitle));
    expect(card.getByText(new RegExp(t.tasksUnassigned))).toBeInTheDocument();
    // La que no cuelga de ningún trabajo no puede ser un enlace: no hay
    // pantalla donde abrirla.
    expect(card.queryByRole("link", { name: /crédito del fotógrafo/ })).not.toBeInTheDocument();
    expect(card.getByRole("link", { name: /Retocar las fotografías/ })).toBeInTheDocument();
  });

  it("maqueta 07: la fila lleva a LA TAREA, no al trabajo entero", () => {
    // Antes llevaba a `/trabajos/j-3` porque no había detalle de tarea.
    // Ahora lo hay y la tarea elegida viaja en la dirección, así que
    // pulsar una fila abre esa tarea y no obliga a buscarla entre las
    // demás del trabajo.
    pintar(conDatos, seccion("tasks"));
    expect(
      within(tarjeta(t.tasksTitle)).getByRole("link", { name: /Retocar las fotografías/ }),
    ).toHaveAttribute("href", "/espacios/demo/trabajos/j-3/tareas?tarea=t-1");
  });

  it("maqueta 07: la tarea enseña su fecha, y sin planificar lo dice", () => {
    pintar(conDatos, seccion("tasks"));
    const card = within(tarjeta(t.tasksTitle));
    expect(card.getByText(/13 sept/)).toBeInTheDocument();
    expect(card.getByText(new RegExp(t.tasksNoDate))).toBeInTheDocument();
  });

  it("la tarjeta dice cuántas filas deja detrás, y calla cuando no deja ninguna", () => {
    // Es la comprobación que nace del dato real: Magariños tiene 19
    // solicitudes abiertas y la tarjeta enseña cuatro (CA-20).
    pintar(conDatos, seccion("requests"));
    expect(within(tarjeta(t.requestsTitle)).getByText(t.cardMore(15))).toBeInTheDocument();

    cleanup();
    pintar(conDatos, seccion("tasks"));
    expect(within(tarjeta(t.tasksTitle)).getByText(t.cardMore(1))).toBeInTheDocument();

    // Los tres trabajos caben enteros: no hay ninguno detrás que anunciar.
    cleanup();
    pintar(conDatos, seccion("jobs"));
    expect(within(tarjeta(t.jobsTitle)).queryByText(/y \d+ más/)).not.toBeInTheDocument();
  });

  it("cada 'Ver todas' lleva al listado FILTRADO por este restaurante", () => {
    // Sin el filtro, el enlace llevaría a las solicitudes de todos los
    // restaurantes del espacio, que no es lo que promete la tarjeta.
    for (const [clave, titulo, enlace, destino] of [
      ["requests", t.requestsTitle, t.requestsLink, "/espacios/demo/solicitudes?restaurante=est-1"],
      ["jobs", t.jobsTitle, t.jobsLink, "/espacios/demo/trabajos?restaurante=est-1"],
      ["tasks", t.tasksTitle, t.tasksLink, "/espacios/demo/tareas?restaurante=est-1"],
    ] as const) {
      cleanup();
      pintar(conDatos, seccion(clave));
      expect(within(tarjeta(titulo)).getByRole("link", { name: enlace })).toHaveAttribute(
        "href",
        destino,
      );
    }
  });
});

describe("M25, M27 y M31 · las columnas del diseño definitivo", () => {
  it("M25 · la solicitud enseña su categoría —marcada si es propuesta— y su trabajo", () => {
    pintar(conDatos, seccion("requests"));
    const card = within(tarjeta(t.requestsTitle));
    // RN-CLS-04 · la propuesta del clasificador no se lee como decidida.
    expect(card.getByText(es.naming.categories.small)).toBeInTheDocument();
    expect(card.getByText(t.categoryProposed)).toBeInTheDocument();
    // La validada sale sin la marca: solo hay una "propuesta" en la tabla.
    expect(card.getByText(es.naming.categories.medium)).toBeInTheDocument();
    expect(card.getAllByText(t.categoryProposed)).toHaveLength(1);
    // El trabajo que nació al aceptarla, enlazado; sin trabajo, se dice.
    expect(card.getByRole("link", { name: "TRB-0009" })).toHaveAttribute(
      "href",
      "/espacios/demo/trabajos/j-9",
    );
    expect(card.getByText(t.requestNoJob)).toBeInTheDocument();
  });

  it("M27 · el trabajo enseña quién lo lleva y sus evidencias; lo no contado no es un cero", () => {
    pintar(conDatos, seccion("jobs"));
    const card = within(tarjeta(t.jobsTitle));
    expect(card.getByText("Marta Rey")).toBeInTheDocument();
    expect(card.getByText(t.jobUnassigned)).toBeInTheDocument();
    expect(card.getByText("2")).toBeInTheDocument();
    expect(card.getByText(t.evidenceUnknown)).toBeInTheDocument();
  });

  it("M31 · la cuota del ciclo es la del servidor y la tabla lleva a cada menú", () => {
    pintar(conDatos, seccion("dailyMenu"));
    const card = within(tarjeta(t.dailyMenuTitle));
    expect(card.getByText(t.dailyMenuQuota(12, 30))).toBeInTheDocument();
    expect(card.getByRole("link", { name: "Menú del domingo" })).toHaveAttribute(
      "href",
      "/espacios/demo/menu-diario/m-1",
    );
    expect(card.getByText("Plantilla clásica")).toBeInTheDocument();
    expect(card.getByText(t.menuNoTemplate)).toBeInTheDocument();
    expect(card.getByText(es.naming.states.menu.publication_requested)).toBeInTheDocument();
    // Los que quedan detrás se anuncian (CA-20).
    expect(card.getByText(t.cardMore(3))).toBeInTheDocument();
  });

  it("M31 · con el servicio y sin menús, lo dice en vez de una tabla vacía", () => {
    pintar(
      {
        ...vacia,
        menus: {
          consumed: 0,
          included: 30,
          usedPercent: 0,
          cycleStart: "2026-09-14T07:00:00.000Z",
          cycleEnd: "2026-10-14T07:00:00.000Z",
          rows: { shown: [], hidden: 0 },
        },
      },
      seccion("dailyMenu"),
    );
    expect(screen.getByText(t.dailyMenuEmptyTitle)).toBeInTheDocument();
    expect(screen.getByText(t.dailyMenuQuota(0, 30))).toBeInTheDocument();
  });

  it("M31 · si el saldo no se pudo leer lo dice: no es 'sin Menú Diario' (CA-20)", () => {
    pintar({ ...vacia, menus: "failed" }, seccion("dailyMenu"));
    expect(screen.getByText(es.states.errorTitle)).toBeInTheDocument();
    expect(screen.queryByText(t.nextMenuNoServiceTitle)).not.toBeInTheDocument();
  });
});
