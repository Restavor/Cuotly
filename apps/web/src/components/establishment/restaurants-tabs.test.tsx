import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import { RestaurantsTabs } from "./RestaurantsTabs";

/**
 * M82 y M84 · las tres pestañas de Restaurantes. Son enlaces a tres
 * direcciones (CA-22), y Archivados cuenta los suyos cuando los hay.
 */
const t = es.teamArea.establishments.tabs;

afterEach(cleanup);

describe("M82 y M84 · las pestañas de Restaurantes", () => {
  it("son tres enlaces, en el orden del dibujo, cada uno a su dirección", () => {
    render(<RestaurantsTabs slug="demo" active="list" archivedCount={0} />);
    const nav = within(screen.getByRole("navigation", { name: t.label }));
    const enlaces = nav.getAllByRole("link");
    expect(enlaces.map((enlace) => enlace.getAttribute("href"))).toEqual([
      "/espacios/demo/restaurantes",
      "/espacios/demo/restaurantes/grupos",
      "/espacios/demo/restaurantes/archivados",
    ]);
    expect(nav.getByRole("link", { current: "page" })).toHaveTextContent(t.list);
  });

  it("Archivados lleva su número; sin archivados o sin contar, no", () => {
    render(<RestaurantsTabs slug="demo" active="archived" archivedCount={3} />);
    expect(screen.getByRole("link", { name: /Archivados/ })).toHaveTextContent("3");

    cleanup();
    render(<RestaurantsTabs slug="demo" active="groups" archivedCount={null} />);
    expect(screen.getByRole("link", { name: t.archived })).toHaveTextContent(/^Archivados$/);
  });
});
