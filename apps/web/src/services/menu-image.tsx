import { ImageResponse } from "next/og";
import { PDFDocument } from "pdf-lib";

import type { MenuDocument, MenuSection } from "@/core/menu-render";

/**
 * De un `MenuDocument` (src/core/menu-render.ts) al PNG y al PDF que se
 * descargan (RN-MEN-04, §59, §61 paso 4).
 *
 * El PNG lo pinta el `ImageResponse` de Next —el mismo motor de las
 * imágenes Open Graph: JSX → SVG → PNG, con su fuente incorporada—, así
 * que no hay ningún navegador ni ninguna dependencia nativa que instalar
 * en Vercel. El PDF es una página A4 con ESE PNG dentro (pdf-lib): lo que
 * el trabajador sube a LandingSite y lo que el restaurante imprime son la
 * misma imagen, pixel a pixel, y no dos maquetaciones que se pueden
 * desfasar.
 *
 * Las tres disposiciones (`classic`, `board`, `elegant`) son las de la
 * migración 78: implementación del Hito 10, no regla de producto. Los
 * colores son los de la plantilla del restaurante: es su marca, no la de
 * Cuotly, y por eso aquí hay hexadecimales y no tokens de Emerald Control.
 */

/** A4 a 150 ppp, en vertical. Cabe en la caja del motor y se imprime nítido. */
export const MENU_IMAGE_WIDTH = 1240;
export const MENU_IMAGE_HEIGHT = 1754;

function Section({ section, accent, layout }: { section: MenuSection; accent: string; layout: MenuDocument["layout"] }) {
  const titleStyle =
    layout === "board"
      ? { fontSize: 44, letterSpacing: 6, textTransform: "uppercase" as const, color: accent }
      : layout === "elegant"
        ? { fontSize: 40, fontStyle: "italic" as const, color: accent }
        : { fontSize: 44, color: accent };
  return (
    <div style={{ display: "flex", flexDirection: "column", marginTop: 44, alignItems: layout === "classic" ? "flex-start" : "center" }}>
      <div style={{ display: "flex", ...titleStyle }}>{section.title}</div>
      {layout !== "board" ? (
        <div style={{ display: "flex", width: layout === "classic" ? 120 : 200, height: 4, backgroundColor: accent, marginTop: 10, marginBottom: 18 }} />
      ) : (
        <div style={{ display: "flex", height: 18 }} />
      )}
      {section.items.map((item, index) => (
        <div key={`${section.title}-${index}`} style={{ display: "flex", fontSize: 36, lineHeight: 1.5, textAlign: layout === "classic" ? "left" : "center" }}>
          {item}
        </div>
      ))}
    </div>
  );
}

/** El cuerpo del menú en JSX. Solo lo que el motor entiende: flex, texto y cajas. */
export function MenuImage({ doc }: { doc: MenuDocument }) {
  const { background, text, accent } = doc.colors;
  const centered = doc.layout !== "classic";
  const padding = doc.layout === "board" ? 72 : 96;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: background,
        color: text,
        padding,
        fontFamily: "Geist, sans-serif",
        // Sin clave `border` cuando no hay borde: el motor recorta el valor
        // como texto y con `undefined` explota.
        ...(doc.layout === "board" ? { border: `10px solid ${accent}` } : {}),
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: centered ? "center" : "flex-start" }}>
        <div
          style={{
            display: "flex",
            fontSize: doc.layout === "board" ? 72 : 64,
            letterSpacing: doc.layout === "board" ? 8 : 0,
            textTransform: doc.layout === "board" ? "uppercase" : "none",
            color: doc.layout === "elegant" ? accent : text,
            textAlign: centered ? "center" : "left",
          }}
        >
          {doc.heading}
        </div>
        <div style={{ display: "flex", fontSize: 40, marginTop: 12, color: doc.layout === "elegant" ? text : accent }}>
          {doc.subheading}
        </div>
        <div style={{ display: "flex", fontSize: 30, marginTop: 8, opacity: 0.8 }}>{doc.dateLabel}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
        {doc.sections.map((section) => (
          <Section key={section.title} section={section} accent={accent} layout={doc.layout} />
        ))}
        {doc.drink ? (
          <div style={{ display: "flex", fontSize: 32, marginTop: 40, justifyContent: centered ? "center" : "flex-start" }}>
            {doc.drink}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: centered ? "center" : "flex-start", marginTop: 32 }}>
        {doc.price ? (
          <div
            style={{
              display: "flex",
              fontSize: 56,
              color: doc.layout === "board" ? background : accent,
              backgroundColor: doc.layout === "board" ? accent : "transparent",
              padding: doc.layout === "board" ? "8px 32px" : 0,
              borderRadius: doc.layout === "board" ? 16 : 0,
            }}
          >
            {doc.price}
          </div>
        ) : null}
        {doc.note ? <div style={{ display: "flex", fontSize: 28, marginTop: 16, opacity: 0.85 }}>{doc.note}</div> : null}
        {doc.footer ? <div style={{ display: "flex", fontSize: 24, marginTop: 24, opacity: 0.7 }}>{doc.footer}</div> : null}
      </div>
    </div>
  );
}

export async function renderMenuPng(doc: MenuDocument): Promise<Uint8Array> {
  const response = new ImageResponse(<MenuImage doc={doc} />, {
    width: MENU_IMAGE_WIDTH,
    height: MENU_IMAGE_HEIGHT,
  });
  return new Uint8Array(await response.arrayBuffer());
}

/** A4 (595 × 842 pt) con el PNG a página completa: el mismo dibujo, para imprimir. */
export async function renderMenuPdf(png: Uint8Array, title: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setProducer("Cuotly");
  const image = await pdf.embedPng(png);
  const page = pdf.addPage([595.28, 841.89]);
  page.drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
  return pdf.save();
}
