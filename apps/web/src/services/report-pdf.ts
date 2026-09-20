/**
 * `src/services/report-pdf.ts` — el PDF de un informe (§93, RN-REP-06).
 *
 * Dos decisiones que conviene tener a la vista:
 *
 *   · **Se genera desde la versión, y no se guarda.** La versión es el
 *     original (RN-REP-12); el PDF es una representación suya. Guardarlo
 *     sería un segundo original que puede dejar de coincidir con las
 *     cifras — y ya hay un caso de eso en el proyecto: por eso el PNG y el
 *     PDF de Menú Diario son la MISMA imagen y no dos maquetaciones.
 *   · **El texto sale de `src/i18n/es.ts`**, como cualquier otra cosa que
 *     lea una persona (CLAUDE.md). La base guarda claves; las frases se
 *     escriben aquí al pintar.
 *
 * Es texto de verdad y no una imagen: se puede buscar, copiar y leer con
 * un lector de pantalla, que en un informe importa más que en un menú.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import {
  type ReportFigure,
  type ReportSnapshot,
  figureChange,
  orderedSections,
} from "@/core/reports";
import { es } from "@/i18n/es";

export interface ReportPdfMeta {
  readonly name: string;
  readonly establishmentName: string | null;
  readonly generatedAtLabel: string;
  readonly periodLabel: { readonly from: string; readonly to: string };
}

/** A4 en puntos, que es la unidad de pdf-lib. */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const LINE = 16;

const INK = rgb(0.07, 0.15, 0.12);
const SOFT = rgb(0.42, 0.47, 0.45);

type Labels = typeof es.reportsPage;

/** El valor de una cifra, ya en palabras y con su unidad. */
export function figureText(figure: ReportFigure, labels: Labels): string {
  if (figure.value === null) {
    const reason = figure.noDataReason;
    const known = reason && reason in es.emptyReasons ? es.emptyReasons[reason as keyof typeof es.emptyReasons] : null;
    return known ?? labels.pdf.noValue;
  }

  const unit = figure.unit as keyof Labels["units"] | undefined;
  if (unit && unit in labels.units) {
    return labels.units[unit](figure.value);
  }
  return new Intl.NumberFormat("es-ES").format(figure.value);
}

/**
 * RN-REP-17 · la variación de una cifra, ya en palabras. `null` cuando no
 * hay comparación, que la pantalla y el PDF traducen en **no pintar nada**
 * — no en pintar un hueco.
 */
export function changeText(figure: ReportFigure, labels: Labels): string | null {
  const cambio = figureChange(figure);
  switch (cambio.kind) {
    case "none":
      return null;
    case "no_previous":
      return labels.change.noPrevious;
    case "flat":
      return labels.change.flat;
    case "from_zero":
      return labels.change.fromZero;
    case "percent":
      return cambio.percent > 0
        ? labels.change.up(cambio.percent)
        : labels.change.down(Math.abs(cambio.percent));
  }
}

export function figureLabel(figure: ReportFigure, labels: Labels): string {
  const metric = labels.metrics[figure.metric as keyof Labels["metrics"]] ?? figure.metric;
  if (!figure.dimension) return metric;
  const dimension =
    es.naming.categories[figure.dimension as keyof typeof es.naming.categories] ??
    es.integrations.providers[figure.dimension as keyof typeof es.integrations.providers]?.name ??
    figure.dimension;
  return `${metric} · ${dimension}`;
}

export async function renderReportPdf(
  snapshot: ReportSnapshot,
  meta: ReportPdfMeta,
): Promise<Uint8Array> {
  const labels = es.reportsPage;
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const write = (text: string, options: { size?: number; font?: typeof regular; color?: typeof INK } = {}) => {
    const size = options.size ?? 10;
    if (y < MARGIN + LINE) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    page.drawText(sanitize(text), {
      x: MARGIN,
      y,
      size,
      font: options.font ?? regular,
      color: options.color ?? INK,
    });
    y -= size + 6;
  };

  const space = (amount = LINE) => {
    y -= amount;
  };

  // Portada, con las mismas cuatro líneas que la vista previa de 10.04.
  write(`${labels.pdf.brand} · ${labels.pdf.brandSuffix}`, { size: 11, font: bold, color: SOFT });
  space(8);
  write(meta.name, { size: 20, font: bold });
  write(labels.pdf.periodLine(meta.periodLabel.from, meta.periodLabel.to), { size: 11, color: SOFT });
  write(
    meta.establishmentName === null
      ? labels.pdf.consolidated
      : labels.pdf.establishmentLine(meta.establishmentName),
    { size: 11, color: SOFT },
  );
  write(labels.pdf.generatedAt(meta.generatedAtLabel), { size: 10, color: SOFT });
  space();

  const sections = orderedSections(snapshot.sections).filter((section) => section.included);

  write(labels.pdf.contents, { size: 12, font: bold });
  sections.forEach((section, index) => {
    write(`${index + 1}. ${labels.sections[section.key] ?? section.key}`, { size: 10, color: SOFT });
  });
  space();

  for (const section of sections) {
    write(labels.sections[section.key] ?? section.key, { size: 14, font: bold });

    const note = snapshot.notes[section.key];
    if (note) {
      for (const line of wrap(note, 92)) write(line, { size: 10 });
    }

    const figures = snapshot.figures.filter((figure) => figure.section === section.key);
    for (const figure of figures) {
      const at = figure.at ? `  (${figure.at})` : "";
      write(`${figureLabel(figure, labels)}: ${figureText(figure, labels)}${at}`, { size: 10 });
    }

    if (figures.length === 0 && !note) {
      // CA-20 · nunca un hueco mudo: si la sección no trae cifra, se dice.
      write(es.emptyReasons.no_data_yet, { size: 10, color: SOFT });
    }
    space(10);
  }

  const total = pdf.getPageCount();
  pdf.getPages().forEach((p, index) => {
    p.drawText(sanitize(labels.pdf.page(index + 1, total)), {
      x: PAGE_WIDTH - MARGIN - 80,
      y: MARGIN - 20,
      size: 8,
      font: regular,
      color: SOFT,
    });
  });

  return pdf.save();
}

/**
 * Helvetica de pdf-lib escribe en **WinAnsi** (CP1252), y lo que no cabe
 * ahí no lo avisa: **lanza** en el momento de generar el PDF. Comprobado
 * uno a uno: los guiones largos, las comillas tipográficas, los puntos
 * suspensivos, el punto medio, las comillas latinas y el euro sí caben —
 * así que NO se degradan, que sería empeorar el documento por si acaso—;
 * una flecha o un emoji, no.
 *
 * Y un informe lleva texto escrito por una persona (el resumen ejecutivo,
 * las recomendaciones), así que puede llegar cualquier cosa. Lo que no se
 * puede escribir se quita, y el PDF sale: quedarse sin informe por un
 * emoji en una nota sería la peor de las dos opciones.
 */
const WINANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

function sanitize(text: string): string {
  let salida = "";
  for (const caracter of text) {
    const punto = caracter.codePointAt(0) ?? 0;
    // Latin-1 imprimible (sin los controles C1) o uno de los añadidos de
    // CP1252. Todo lo demás se cae.
    if ((punto >= 0x20 && punto <= 0x7e) || (punto >= 0xa0 && punto <= 0xff) || WINANSI_EXTRA.has(punto)) {
      salida += caracter;
    }
  }
  return salida;
}

function wrap(text: string, width: number): readonly string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > width) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}
