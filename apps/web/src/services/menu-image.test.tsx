// @vitest-environment node
import { describe, expect, it } from "vitest";

import { PDFDocument } from "pdf-lib";

import { buildMenuDocument } from "@/core/menu-render";

import { MENU_IMAGE_HEIGHT, MENU_IMAGE_WIDTH, renderMenuPdf, renderMenuPng } from "./menu-image";

/**
 * RN-MEN-04 · "Puede descargar PNG o PDF". Este test pinta de verdad con el
 * motor que usa la ruta, para que "se genera un PNG" no sea una promesa:
 * si la fuente incorporada dejara de cargar o un estilo no fuera de los
 * que el motor entiende, esto explota aquí y no en la descarga de un
 * restaurante.
 */
const doc = buildMenuDocument({
  establishmentName: "Magariños",
  menuName: "Menú del día",
  targetDate: "2026-07-15",
  version: 1,
  content: {
    starters: ["Ensalada mixta", "Sopa de pescado"],
    mains: ["Merluza a la gallega", "Pollo asado"],
    desserts: ["Flan casero"],
    drink: "Vino o agua",
    priceCents: 1450,
    note: "Pan incluido",
  },
  design: {
    layout: "board",
    backgroundColor: "#0B2F2A",
    textColor: "#FFFFFF",
    accentColor: "#D89524",
    headingText: null,
    footerText: "IVA incluido",
    showPrices: true,
  },
});

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe("RN-MEN-04 · el PNG y el PDF se generan de verdad", () => {
  it("el PNG tiene firma PNG y el tamaño de un A4 a 150 ppp", async () => {
    const png = await renderMenuPng(doc);
    expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(pngSize(png)).toEqual({ width: MENU_IMAGE_WIDTH, height: MENU_IMAGE_HEIGHT });
  }, 60_000);

  it("el PDF es un PDF de una página con el PNG dentro", async () => {
    const png = await renderMenuPng(doc);
    const pdf = await renderMenuPdf(png, "Menú del día");
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    // Se vuelve a abrir con la misma librería: una página, tamaño A4 en
    // puntos, y el título que se le puso.
    const abierto = await PDFDocument.load(pdf);
    expect(abierto.getPageCount()).toBe(1);
    const { width, height } = abierto.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
    expect(abierto.getTitle()).toBe("Menú del día");
  }, 60_000);

  it("las tres disposiciones pintan", async () => {
    for (const layout of ["classic", "elegant"] as const) {
      const png = await renderMenuPng({ ...doc, layout });
      expect(pngSize(png).width).toBe(MENU_IMAGE_WIDTH);
    }
  }, 90_000);
});
