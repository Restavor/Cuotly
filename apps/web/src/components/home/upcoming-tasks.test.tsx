import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import { UpcomingTasks, type UpcomingTask } from "./UpcomingTasks";

/**
 * Página 22 · "Próximas tareas", pintadas.
 *
 * Lo que vigila:
 *
 *   · Que **"Hoy" sea el hoy del espacio** y no el de quien mira. El día
 *     llega calculado por el servidor en la zona del restaurante; si esta
 *     lista lo recalculara, alguien que abriera Cuotly desde otro huso
 *     vería "Hoy" en la fila equivocada (CLAUDE.md MUST).
 *   · Que una fila **sin ficha propia no sea un enlace**. Un festivo se
 *     gestiona en el calendario: un enlace ahí llevaría a una pantalla que
 *     no existe.
 *   · Que una fila sin restaurante **diga qué es** en vez de dejar la
 *     línea en blanco (P6, no se rellena con nada).
 *   · Que el nombre del tipo de evento venga de fuera y no de un
 *     diccionario propio: el mismo evento no puede llamarse de dos
 *     maneras según la pantalla.
 */
const t = es.spaceHome.upcoming;

const HOY = "2026-09-21";

const etiqueta = (kind: string) => es.calendar.kinds[kind as keyof typeof es.calendar.kinds] ?? kind;

const tareas: readonly UpcomingTask[] = [
  {
    key: "a",
    day: HOY,
    title: "Publicar menú semanal",
    kind: "menu_publication",
    establishmentName: "Magariños",
    href: "/espacios/restavor/menu-diario/a",
  },
  {
    key: "b",
    day: "2026-09-24",
    title: "Vencimiento de la cuota de septiembre",
    kind: "charge_due",
    establishmentName: "La Encina",
    href: "/espacios/restavor/finanzas",
  },
  {
    key: "c",
    day: "2026-10-12",
    title: "Fiesta Nacional",
    kind: "holiday",
    establishmentName: null,
    href: null,
  },
];

afterEach(cleanup);

describe("página 22 · Próximas tareas", () => {
  it("la tarea de hoy dice «Hoy», y lo decide el servidor", () => {
    render(<UpcomingTasks tasks={tareas} today={HOY} kindLabel={etiqueta} />);

    const filas = screen.getAllByRole("listitem");
    expect(within(filas[0]).getByText(t.today)).toBeInTheDocument();

    // Y solo esa: las otras dos llevan su fecha.
    expect(screen.getAllByText(t.today)).toHaveLength(1);
  });

  it("si el hoy del espacio es otro día, «Hoy» se mueve con él", () => {
    render(<UpcomingTasks tasks={tareas} today="2026-09-24" kindLabel={etiqueta} />);

    const filas = screen.getAllByRole("listitem");
    expect(within(filas[1]).getByText(t.today)).toBeInTheDocument();
    expect(within(filas[0]).queryByText(t.today)).not.toBeInTheDocument();
  });

  it("las demás llevan su día y su mes", () => {
    render(<UpcomingTasks tasks={tareas} today={HOY} kindLabel={etiqueta} />);

    expect(screen.getByText(t.day(24, 9))).toBeInTheDocument();
    expect(screen.getByText(t.day(12, 10))).toBeInTheDocument();
  });

  it("una tarea con ficha es un enlace a ella; una sin ficha NO es un enlace", () => {
    render(<UpcomingTasks tasks={tareas} today={HOY} kindLabel={etiqueta} />);

    const filas = screen.getAllByRole("listitem");
    expect(within(filas[0]).getByRole("link")).toHaveAttribute(
      "href",
      "/espacios/restavor/menu-diario/a",
    );
    // El festivo se gestiona en el calendario: no hay ficha a la que ir.
    expect(within(filas[2]).queryByRole("link")).not.toBeInTheDocument();
    expect(within(filas[2]).getByText("Fiesta Nacional")).toBeInTheDocument();
  });

  it("sin restaurante dice QUÉ es, no deja la línea en blanco", () => {
    render(<UpcomingTasks tasks={tareas} today={HOY} kindLabel={etiqueta} />);

    const festivo = screen.getAllByRole("listitem")[2];
    expect(within(festivo).getByText(es.calendar.kinds.holiday)).toBeInTheDocument();
  });

  it("el nombre del tipo de evento llega de fuera, no de un diccionario propio", () => {
    render(
      <UpcomingTasks tasks={tareas} today={HOY} kindLabel={() => "ETIQUETA DE FUERA"} />,
    );

    expect(screen.getByText("ETIQUETA DE FUERA")).toBeInTheDocument();
  });

  it("con restaurante se escribe el restaurante, que es lo que se busca de un vistazo", () => {
    render(<UpcomingTasks tasks={tareas} today={HOY} kindLabel={etiqueta} />);

    const primera = screen.getAllByRole("listitem")[0];
    expect(within(primera).getByText("Magariños")).toBeInTheDocument();
    expect(within(primera).queryByText(es.calendar.kinds.menu_publication)).not.toBeInTheDocument();
  });

  it("no reordena: las pinta en el orden en que llegan", () => {
    render(<UpcomingTasks tasks={tareas} today={HOY} kindLabel={etiqueta} />);

    const titulos = screen
      .getAllByRole("listitem")
      .map((fila) => fila.textContent ?? "");
    expect(titulos[0]).toContain("Publicar menú semanal");
    expect(titulos[1]).toContain("Vencimiento de la cuota de septiembre");
    expect(titulos[2]).toContain("Fiesta Nacional");
  });
});
