import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { buildMenuDocument } from "@/core/menu-render";
import { MENU_IMAGE_HEIGHT, MENU_IMAGE_WIDTH } from "@/services/menu-image";

import { MenuPreview } from "./MenuPreview";

const doc = buildMenuDocument({
  establishmentName: "Magariños",
  menuName: "Menú del día",
  targetDate: "2026-07-15",
  version: 1,
  content: {
    starters: ["Ensalada mixta"],
    mains: ["Merluza a la gallega"],
    desserts: ["Flan casero"],
    drink: null,
    priceCents: 1450,
    note: null,
  },
  design: {
    layout: "board",
    backgroundColor: "#0B2F2A",
    textColor: "#FFFFFF",
    accentColor: "#D89524",
    headingText: null,
    footerText: null,
    showPrices: true,
  },
});

const alto = (ancho: number) => `${Math.round(MENU_IMAGE_HEIGHT * (ancho / MENU_IMAGE_WIDTH))}px`;

afterEach(cleanup);

describe("MenuPreview en el teléfono (PDF móvil, pp. 126 y 127)", () => {
  it("sin ancho de teléfono pinta una sola vista, al ancho pedido", () => {
    render(<MenuPreview doc={doc} width={300} label="Menú" />);
    const vistas = screen.getAllByRole("img", { name: "Menú" });
    expect(vistas).toHaveLength(1);
    expect(vistas[0]).toHaveStyle({ width: "300px", height: alto(300) });
  });

  it("con ancho de teléfono pinta las dos, cada una en su punto de corte", () => {
    const { container } = render(<MenuPreview doc={doc} width={520} mobileWidth={300} label="Menú" />);
    const movil = container.querySelector(".sm\\:hidden [role=img]");
    const ancha = container.querySelector(".hidden.sm\\:block [role=img]");
    expect(movil).toHaveStyle({ width: "300px", height: alto(300) });
    expect(ancha).toHaveStyle({ width: "520px", height: alto(520) });
  });

  it("si los dos anchos coinciden no duplica nada", () => {
    render(<MenuPreview doc={doc} width={300} mobileWidth={300} label="Menú" />);
    expect(screen.getAllByRole("img", { name: "Menú" })).toHaveLength(1);
  });
});
