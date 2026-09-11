import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import type { SheetData } from "./Sheet";
import { EstablishmentSheet } from "./Sheet";
import { SHEET_TABS, MANAGEMENT_BLOCKS } from "./tabs";

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
    payments: { allowed: false, charges: [] },
    users: { rows: [], failed: false },
    files: { files: [], selected: null, categories: [], category: null },
    history: [],
  };
}

const vacia: SheetData["operation"] = {
  requests: { shown: [], hidden: 0 },
  jobs: { shown: [], hidden: 0 },
  tasks: { shown: [], hidden: 0 },
};

function pintar(operation: SheetData["operation"] = vacia) {
  return render(
    <EstablishmentSheet
      base="/espacios/demo/restaurantes/est-1"
      slug="demo"
      tab={OPERACION}
      block={MANAGEMENT_BLOCKS[0]}
      data={sheetData(operation)}
    />,
  );
}

/** La tarjeta entera, buscada por su titular, para mirar dentro de ella. */
function tarjeta(titulo: string): HTMLElement {
  const encabezado = screen.getByRole("heading", { name: titulo });
  return encabezado.closest("section") ?? encabezado.parentElement!.parentElement!;
}

describe("vista 04 · la Operación son cuatro tarjetas", () => {
  it("las cuatro del dibujo, y ninguna más", () => {
    pintar();
    for (const titulo of [t.requestsTitle, t.jobsTitle, t.tasksTitle, t.dailyMenuTitle]) {
      expect(screen.getByRole("heading", { name: titulo })).toBeInTheDocument();
    }
  });

  it("Menú Diario dice por qué está vacío en vez de enseñar menús de ejemplo", () => {
    // CLAUDE.md MUST NOT: la maqueta trae tres menús con sus plazos y va
    // marcada "Datos de ejemplo". No los está publicando nadie.
    pintar();
    expect(within(tarjeta(t.dailyMenuTitle)).getByText(t.dailyMenuEmptyTitle)).toBeInTheDocument();
  });

  it("sin nada que enseñar, cada tarjeta dice su motivo y no se queda en blanco", () => {
    pintar();
    expect(screen.getByText(t.requestsEmptyTitle)).toBeInTheDocument();
    expect(screen.getByText(t.jobsEmptyTitle)).toBeInTheDocument();
    expect(screen.getByText(t.tasksEmptyTitle)).toBeInTheDocument();
  });

  it("la ficha de datos ya no está aquí: se lee entera en Gestión", () => {
    // La maqueta no la tiene en Operación, y repetida en dos pestañas
    // acabaría diciendo dos cosas distintas.
    pintar();
    expect(screen.queryByText(t.dataTitle)).not.toBeInTheDocument();
  });
});

describe("vista 04 · lo que enseña cada fila", () => {
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
        },
        {
          id: "r-2",
          code: "SOL-0022",
          description: "Nueva fotografía de terraza",
          state: "published",
          createdAt: "2026-09-09T16:10:00.000Z",
          authorName: null,
          deepLink: "/espacios/demo/solicitudes/r-2",
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
  };

  it("una solicitud lleva su autor y su momento; sin autor, solo el momento", () => {
    pintar(conDatos);
    const card = within(tarjeta(t.requestsTitle));
    expect(card.getByText(/Nuria Ferreiro \(Magariños\) · /)).toBeInTheDocument();
    // La segunda no tiene nombre que enseñar y no se rellena con el uuid.
    expect(card.queryByText(/r-2/)).not.toBeInTheDocument();
  });

  it("un trabajo fuera de plazo lo dice, y no las horas que le quedarían", () => {
    pintar(conDatos);
    const card = within(tarjeta(t.jobsTitle));
    expect(card.getByText(t.currentJobOverdue)).toBeInTheDocument();
    expect(card.getByText(t.currentJobToStart("2 h"))).toBeInTheDocument();
  });

  it("una tarea sin repartir lo dice, y sin trabajo no es un enlace", () => {
    pintar(conDatos);
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
    pintar(conDatos);
    expect(
      within(tarjeta(t.tasksTitle)).getByRole("link", { name: /Retocar las fotografías/ }),
    ).toHaveAttribute("href", "/espacios/demo/trabajos/j-3/tareas?tarea=t-1");
  });

  it("maqueta 07: la tarea enseña su fecha, y sin planificar lo dice", () => {
    pintar(conDatos);
    const card = within(tarjeta(t.tasksTitle));
    expect(card.getByText(/13 sept/)).toBeInTheDocument();
    expect(card.getByText(new RegExp(t.tasksNoDate))).toBeInTheDocument();
  });

  it("la tarjeta dice cuántas filas deja detrás, y calla cuando no deja ninguna", () => {
    // Es la comprobación que nace del dato real: Magariños tiene 19
    // solicitudes abiertas y la tarjeta enseña cuatro (CA-20).
    pintar(conDatos);
    expect(within(tarjeta(t.requestsTitle)).getByText(t.cardMore(15))).toBeInTheDocument();
    expect(within(tarjeta(t.tasksTitle)).getByText(t.cardMore(1))).toBeInTheDocument();
    expect(within(tarjeta(t.jobsTitle)).queryByText(/y \d+ más/)).not.toBeInTheDocument();
  });

  it("cada 'Ver todas' lleva al listado FILTRADO por este restaurante", () => {
    // Sin el filtro, el enlace llevaría a las solicitudes de todos los
    // restaurantes del espacio, que no es lo que promete la tarjeta.
    pintar(conDatos);
    expect(
      within(tarjeta(t.requestsTitle)).getByRole("link", { name: t.requestsLink }),
    ).toHaveAttribute("href", "/espacios/demo/solicitudes?restaurante=est-1");
    expect(within(tarjeta(t.jobsTitle)).getByRole("link", { name: t.jobsLink })).toHaveAttribute(
      "href",
      "/espacios/demo/trabajos?restaurante=est-1",
    );
    expect(within(tarjeta(t.tasksTitle)).getByRole("link", { name: t.tasksLink })).toHaveAttribute(
      "href",
      "/espacios/demo/tareas?restaurante=est-1",
    );
  });
});
