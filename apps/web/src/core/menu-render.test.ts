import { describe, expect, it } from "vitest";

import {
  MENU_LAYOUTS,
  buildMenuDocument,
  formatMenuDate,
  formatPriceCents,
  isMenuLayout,
  menuFileName,
  type MenuRenderInput,
} from "./menu-render";

const base: MenuRenderInput = {
  establishmentName: "Magariños",
  menuName: "Menú del día",
  targetDate: "2026-07-15",
  version: 3,
  content: {
    starters: ["Ensalada mixta", " Sopa de pescado "],
    mains: ["Merluza a la gallega"],
    desserts: [],
    drink: "Vino o agua",
    priceCents: 1450,
    note: "Pan incluido",
  },
  design: {
    layout: "classic",
    backgroundColor: "#FFFFFF",
    textColor: "#1F2937",
    accentColor: "#145C4E",
    headingText: null,
    footerText: "IVA incluido",
    showPrices: true,
  },
};

describe("RN-MEN-02 · el documento del menú (§58)", () => {
  it("tres secciones con los nombres de §58, y una vacía no se pinta", () => {
    const doc = buildMenuDocument(base);
    expect(doc.sections.map((s) => s.title)).toEqual(["Primeros", "Segundos"]);
    expect(doc.sections[0].items).toEqual(["Ensalada mixta", "Sopa de pescado"]);
  });

  it("la cabecera es la de la plantilla, o el nombre del restaurante", () => {
    expect(buildMenuDocument(base).heading).toBe("Magariños");
    expect(
      buildMenuDocument({ ...base, design: { ...base.design, headingText: "Casa Magariños" } }).heading,
    ).toBe("Casa Magariños");
  });

  it("el precio sale con coma y símbolo, y no sale si la plantilla no enseña precios", () => {
    expect(buildMenuDocument(base).price).toBe("14,50 €");
    expect(
      buildMenuDocument({ ...base, design: { ...base.design, showPrices: false } }).price,
    ).toBeNull();
    expect(
      buildMenuDocument({ ...base, content: { ...base.content, priceCents: null } }).price,
    ).toBeNull();
  });

  it("bebida, nota, pie y versión viajan tal cual, y el vacío es null", () => {
    const doc = buildMenuDocument(base);
    expect(doc.drink).toBe("Vino o agua");
    expect(doc.note).toBe("Pan incluido");
    expect(doc.footer).toBe("IVA incluido");
    expect(doc.versionLabel).toBe("v3");
    expect(buildMenuDocument({ ...base, content: { ...base.content, drink: "  " } }).drink).toBeNull();
  });

  it("los colores son los de la plantilla: la marca es del restaurante", () => {
    expect(buildMenuDocument(base).colors).toEqual({
      background: "#FFFFFF",
      text: "#1F2937",
      accent: "#145C4E",
    });
  });
});

describe("formatos", () => {
  it("céntimos → euros con coma", () => {
    expect(formatPriceCents(1450)).toBe("14,50 €");
    expect(formatPriceCents(900)).toBe("9,00 €");
    expect(formatPriceCents(123405)).toBe("1234,05 €");
  });

  it("la fecha objetivo se escribe entera en español, sin depender de la zona del servidor", () => {
    expect(formatMenuDate("2026-07-15")).toBe("miércoles, 15 de julio de 2026");
    expect(formatMenuDate("2026-12-25")).toBe("viernes, 25 de diciembre de 2026");
    expect(() => formatMenuDate("15/07/2026")).toThrow();
  });

  it("el nombre del archivo lleva fecha y versión y no lleva acentos ni espacios", () => {
    expect(menuFileName({ menuName: "Menú del día", targetDate: "2026-07-15", version: 3 }, "pdf")).toBe(
      "menu-menu-del-dia-2026-07-15-v3.pdf",
    );
    expect(menuFileName({ menuName: "¡¡!!", targetDate: "2026-07-15", version: 1 }, "png")).toBe(
      "menu-menu-2026-07-15-v1.png",
    );
  });

  it("las tres disposiciones de la migración 78", () => {
    expect(MENU_LAYOUTS).toEqual(["classic", "board", "elegant"]);
    expect(isMenuLayout("board")).toBe(true);
    expect(isMenuLayout("pizarra")).toBe(false);
  });
});
