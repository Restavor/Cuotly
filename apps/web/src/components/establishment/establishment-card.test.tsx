import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import { EstablishmentCard, type EstablishmentCardData } from "./EstablishmentCard";

/**
 * Página 23 · una ficha de la lista de restaurantes, pintada.
 *
 * Lo que vigila:
 *
 *   · Que **no se invente** nada de lo que el diseño dibuja y no existe:
 *     ni foto del local, ni supervisor. Las dos cosas tienen su razón
 *     escrita en el componente; esta prueba las sujeta para que nadie las
 *     reponga "porque el diseño las lleva" (CLAUDE.md MUST NOT).
 *   · Que **un cero se escriba**: "0 solicitudes abiertas" es un dato
 *     bueno, y taparlo lo convertiría en "no se sabe".
 *   · Que sin plan y sin grupo se diga cuál de las dos cosas falta, en
 *     vez de un guion que no distingue (P6).
 *   · Que haya **un solo control por ficha** (§20.1): dos enlaces al
 *     mismo sitio son dos paradas de tabulador para el mismo destino.
 */
const t = es.teamArea.establishments;

const magarinos: EstablishmentCardData = {
  id: "e1",
  name: "Magariños",
  code: "MAG-001",
  city: "A Coruña",
  status: "active",
  groupName: "Grupo Norte",
  planName: "Premium+",
  openRequests: 3,
  attention: [],
};

afterEach(cleanup);

describe("página 23 · la ficha de un restaurante", () => {
  it("enseña nombre, ciudad, plan, estado, grupo y solicitudes abiertas", () => {
    render(<EstablishmentCard row={magarinos} href="/x" />);

    expect(screen.getByText("Magariños")).toBeInTheDocument();
    expect(screen.getByText("A Coruña")).toBeInTheDocument();
    expect(screen.getByText("Premium+")).toBeInTheDocument();
    expect(screen.getByText(es.naming.states.establishment.active)).toBeInTheDocument();
    expect(screen.getByText("Grupo Norte")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("sin ciudad se cae al código, que también identifica al restaurante", () => {
    render(<EstablishmentCard row={{ ...magarinos, city: null }} href="/x" />);

    expect(screen.getByText("MAG-001")).toBeInTheDocument();
  });

  it("cero solicitudes abiertas SE ESCRIBE: es un dato, no una ausencia", () => {
    render(<EstablishmentCard row={{ ...magarinos, openRequests: 0 }} href="/x" />);

    const rotulo = screen.getByText(t.openRequests);
    expect(rotulo.parentElement?.textContent).toBe(`${t.openRequests}0`);
  });

  it("sin plan y sin grupo dice cuál falta, no un guion", () => {
    render(
      <EstablishmentCard row={{ ...magarinos, planName: null, groupName: null }} href="/x" />,
    );

    expect(screen.getByText(t.noPlan)).toBeInTheDocument();
    expect(screen.getByText(t.noGroup)).toBeInTheDocument();
  });

  it("NO inventa la foto del local que dibuja el diseño", () => {
    const { container } = render(<EstablishmentCard row={magarinos} href="/x" />);

    // Ni una imagen, ni un hueco gris esperándola: `establishments` no
    // tiene ninguna columna de imagen y nadie ha subido ninguna.
    expect(container.querySelector("img")).toBeNull();
  });

  it("NO inventa un supervisor, que en Cuotly no es de un restaurante", () => {
    render(<EstablishmentCard row={magarinos} href="/x" />);

    // "Supervisor" es una relación Administrador–Trabajador: `supervisions`
    // enlaza dos personas, no una persona con un local.
    expect(screen.queryByText(/supervisor/i)).not.toBeInTheDocument();
  });

  it("un solo control por ficha, y lleva a la ficha completa (§20.1)", () => {
    render(<EstablishmentCard row={magarinos} href="/espacios/restavor/restaurantes/e1" />);

    const enlaces = screen.getAllByRole("link");
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0]).toHaveAttribute("href", "/espacios/restavor/restaurantes/e1");
  });

  it("un estado largo NO puede comerse el nombre", () => {
    /*
      Esto se vio mirando la lista dibujada: con "Pausado por impago",
      "Puerto Chico" salía como "Pu…". jsdom no mide nada, así que lo que
      se sujeta aquí es la regla de reparto que lo evita —la fila se parte
      y el nombre se lleva un ancho mínimo antes que nadie—, no el píxel.
      El píxel lo vigila el recorrido móvil de `e2e/ca19-recorridos-movil`.
    */
    render(
      <EstablishmentCard
        row={{ ...magarinos, name: "Puerto Chico", status: "paused" }}
        href="/x"
      />,
    );

    const nombre = screen.getByText("Puerto Chico");
    const bloque = nombre.parentElement!;
    expect(bloque.className).toContain("basis-40");
    expect(bloque.className).toContain("flex-1");

    // Y la fila que los reparte se parte en vez de apretar.
    expect(bloque.parentElement!.className).toContain("flex-wrap");
  });

  it("cuando no hay nada pendiente lo dice, y no deja el hueco vacío", () => {
    render(<EstablishmentCard row={magarinos} href="/x" />);

    const bloque = screen.getByText(t.attentionColumn).parentElement!;
    expect(within(bloque).getByText(t.noAttention)).toBeInTheDocument();
  });

  it("cada estado lleva su tono, y el archivado no se pinta como activo", () => {
    const { container } = render(
      <EstablishmentCard row={{ ...magarinos, status: "archived" }} href="/x" />,
    );

    expect(screen.getByText(es.naming.states.establishment.archived)).toBeInTheDocument();
    // El nombre del estado va escrito, nunca solo el color (§21.4).
    expect(container.textContent).toContain(es.naming.states.establishment.archived);
  });
});
