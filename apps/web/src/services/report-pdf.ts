/**
 * `src/services/report-pdf.ts` — el PDF de un informe (§93, RN-REP-06,
 * RN-REP-19).
 *
 * Tres decisiones que conviene tener a la vista:
 *
 *   · **Se genera desde la versión, y no se guarda.** La versión es el
 *     original (RN-REP-12); el PDF es una representación suya. Guardarlo
 *     sería un segundo original que puede dejar de coincidir con las
 *     cifras — y ya hay un caso de eso en el proyecto: por eso el PNG y el
 *     PDF de Menú Diario son la MISMA imagen y no dos maquetaciones.
 *   · **El texto sale de `src/i18n/es.ts`**, como cualquier otra cosa que
 *     lea una persona (CLAUDE.md). La base guarda claves; las frases se
 *     escriben aquí al pintar.
 *   · **El orden de la maqueta no es decorativo** (RN-REP-19, aprobada por
 *     Bosco el 20/09/2026): portada, "Lo esencial" —*"si solo lees una
 *     página, es esta"*—, resumen ejecutivo, índice, una página por
 *     sección y anexos. Lo importante va delante porque un informe mensual
 *     se abre, se mira medio minuto y se cierra.
 *
 * Es texto de verdad y no una imagen: se puede buscar, copiar y leer con
 * un lector de pantalla, que en un informe importa más que en un menú.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import {
  type ChangeAllowanceLine,
  type MonthActivityEntry,
  type MonthChange,
  type ReportFigure,
  type ReportOpportunity,
  type ReportSectionKey,
  type ReportSnapshot,
  changeStatus,
  figureChange,
  figuresOfSection,
  headlineFigures,
  orderedActivity,
  orderedSections,
} from "@/core/reports";
import { fechaCorta } from "@/i18n/dates";
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

/**
 * Los colores del sistema Emerald Control, **traducidos** de
 * `src/styles/tokens.css`. pdf-lib no entiende CSS, así que este es el
 * único sitio del proyecto donde un token se escribe como número — y se
 * escribe con su nombre delante para que se pueda comparar con el archivo
 * de tokens de un vistazo. CLAUDE.md prohíbe el hexadecimal suelto en un
 * componente; esto no es un componente y no hay ninguno suelto: cada línea
 * dice de qué token viene.
 */
function token(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const INK = token("#17211f"); // --color-text
const SOFT = token("#66736e"); // --color-text-secondary
const GREEN = token("#145c4e"); // --color-primary
const RED = token("#c84c4c"); // --color-danger
const RULE = token("#dde5e1"); // --color-border
const FILL = token("#eaf0ec"); // --color-soft-surface

type Labels = typeof es.reportsPage;

/**
 * El valor de una cifra, ya en palabras y con su unidad.
 *
 * `short` es para una **celda de tabla o una tarjeta**: ahí el motivo
 * largo de §178 no cabe, y truncarlo dejaría "Sin datos todavía.
 * Aparecerán en cuanto…", que se lee peor que decirlo corto. Donde hay
 * sitio se sigue diciendo entero.
 */
export function figureText(figure: ReportFigure, labels: Labels, short = false): string {
  if (figure.value === null) {
    const reason = figure.noDataReason;
    const tabla = short ? es.emptyReasonsShort : es.emptyReasons;
    const known = reason && reason in tabla ? tabla[reason as keyof typeof tabla] : null;
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
export function changeText(figure: ReportFigure, labels: Labels, short = false): string | null {
  const cambio = figureChange(figure);
  switch (cambio.kind) {
    case "none":
      return null;
    case "no_previous":
      return labels.change.noPrevious;
    case "flat":
      return short ? labels.change.flatShort : labels.change.flat;
    case "from_zero":
      return short ? labels.change.fromZeroShort : labels.change.fromZero;
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

/**
 * RN-REP-18 · una entrada del relato del mes, en una línea: qué pasó y de
 * qué. **Nunca quién** (P7): la versión no trae identidad del equipo
 * dentro y aquí tampoco habría de dónde sacarla.
 */
export function activitySubject(entry: MonthActivityEntry): string | null {
  if (!entry.subject) return null;
  // El sujeto de un menú es el DÍA del menú, y la base lo entrega en ISO.
  // "2026-08-18" en medio de una frase es ruido: el restaurante reconoce
  // "18 ago". Los demás sujetos son texto suyo y se dejan como están.
  return /^\d{4}-\d{2}-\d{2}$/.test(entry.subject) ? fechaCorta(entry.subject) : entry.subject;
}

export function activityText(entry: MonthActivityEntry, labels: Labels): string {
  const que = labels.activity.kinds[entry.kind];
  const sujeto = activitySubject(entry);
  return sujeto === null ? que : `${que} · ${sujeto}`;
}

/**
 * RN-REP-18 · el tipo de cambio de una ficha. Tres respuestas y no una:
 * presupuestado aparte —que no gastó bolsa (RN-CON-03)—, la categoría que
 * consumió, o **sin clasificar todavía**, que es lo que se dice de un
 * cambio recién pedido en vez de adivinarle una.
 */
export function changeCategoryText(change: MonthChange, labels: Labels): string {
  if (change.budgeted) return labels.changeCard.budgeted;
  if (change.category === null) return labels.changeCard.unclassified;
  return es.naming.categories[change.category];
}

/**
 * RN-REP-18 · la línea de fechas de una ficha: "Empezado el 4 ago ·
 * Entregado el 6 ago", y donde no hay fecha de fin, **lo que pasa de
 * verdad**. Bosco, 20/09/2026: *"en vez de poner fecha de finalización
 * pondrías en proceso"*.
 */
export function changeDatesText(change: MonthChange, labels: Labels): string {
  const estado = changeStatus(change);
  const partes: string[] = [];

  if (change.startedAt !== null) {
    partes.push(labels.changeCard.startedOn(fechaCorta(change.startedAt)));
  } else {
    // Sin empezar no hay "empezado el": se dice cuándo lo pidió, que es la
    // fecha que el restaurante tiene en la cabeza.
    partes.push(labels.changeCard.requestedOn(fechaCorta(change.requestedAt)));
  }

  switch (estado) {
    case "delivered":
      partes.push(labels.changeCard.deliveredOn(fechaCorta(change.completedAt ?? change.requestedAt)));
      break;
    case "in_progress":
      partes.push(labels.changeCard.inProgress);
      break;
    case "pending_start":
      partes.push(labels.changeCard.pendingStart);
      break;
    case "under_review":
      partes.push(labels.changeCard.underReview);
      break;
    case "rejected":
      partes.push(labels.changeCard.rejectedOn(fechaCorta(change.rejectedAt ?? change.requestedAt)));
      break;
    case "cancelled":
      partes.push(labels.changeCard.cancelledOn(fechaCorta(change.cancelledAt ?? change.requestedAt)));
      break;
  }

  if (change.corrections > 0) partes.push(labels.changeCard.corrections(change.corrections));
  return partes.join(" · ");
}

/**
 * RN-REP-20 · una línea de la bolsa: "2 de 5 incluidos", y la coletilla
 * del presupuestado cuando la hay. Sin ella, "1 de 0" se lee como que el
 * restaurante se ha pasado de su plan, y lo que hizo fue comprar aparte.
 */
export function allowanceText(line: ChangeAllowanceLine, labels: Labels): string {
  const base =
    line.included === null
      ? labels.allowance.noPlan(line.consumed)
      : // `photo` es la única categoría femenina de las cuatro.
        labels.allowance.line(line.consumed, line.included, line.category === "photo");
  return line.budgeted > 0 ? `${base} · ${labels.allowance.budgeted(line.budgeted)}` : base;
}

/**
 * §96 · el título de una oportunidad, escrito aquí desde `es.ts` a partir
 * de la regla y el sujeto que guardó la versión. Así una aprobada hace dos
 * meses no sigue diciendo una frase que se corrigió después.
 */
export function opportunityTitle(opportunity: ReportOpportunity): string {
  const rule = opportunity.rule as keyof typeof es.opportunities.ruleTitles | null;
  if (rule !== null && rule in es.opportunities.ruleTitles) {
    return es.opportunities.ruleTitles[rule](opportunity.subject);
  }
  return opportunity.title ?? es.opportunities.title;
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

  /** Deja sitio para `alto` puntos, abriendo página si no cabe. */
  const room = (alto: number) => {
    if (y - alto < MARGIN + LINE) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const at = (
    text: string,
    x: number,
    baseline: number,
    options: { size?: number; font?: typeof regular; color?: typeof INK } = {},
  ) => {
    page.drawText(sanitize(text), {
      x,
      y: baseline,
      size: options.size ?? 10,
      font: options.font ?? regular,
      color: options.color ?? INK,
    });
  };

  /**
   * Recorta un texto al ancho de su columna. Sin esto, un nombre largo se
   * mete encima de la columna siguiente o se sale de la hoja: pdf-lib no
   * avisa, dibuja. El recorte termina en puntos suspensivos, que sí caben
   * en WinAnsi.
   */
  const fit = (text: string, maxWidth: number, size: number, font: typeof regular): string => {
    const limpio = sanitize(text);
    if (font.widthOfTextAtSize(limpio, size) <= maxWidth) return limpio;
    let corto = limpio;
    while (corto.length > 1 && font.widthOfTextAtSize(`${corto}…`, size) > maxWidth) {
      corto = corto.slice(0, -1);
    }
    return `${corto.trimEnd()}…`;
  };

  const write = (
    text: string,
    options: { size?: number; font?: typeof regular; color?: typeof INK; gap?: number } = {},
  ) => {
    const size = options.size ?? 10;
    room(size + 6);
    at(text, MARGIN, y, options);
    y -= size + (options.gap ?? 6);
  };

  const rule = (gap = 10) => {
    room(gap + 2);
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.7,
      color: RULE,
    });
    y -= gap;
  };

  const space = (amount = LINE) => {
    y -= amount;
  };

  const paragraph = (text: string, options: { size?: number; color?: typeof INK } = {}) => {
    for (const linea of wrap(text, 96)) write(linea, { ...options, gap: 4 });
  };

  // ------------------------------------------------------------------
  // 1 · Portada
  // ------------------------------------------------------------------
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 150, width: PAGE_WIDTH, height: 150, color: FILL });
  at(`${labels.pdf.brand} · ${labels.pdf.brandSuffix}`, MARGIN, PAGE_HEIGHT - 46, {
    size: 10,
    font: bold,
    color: GREEN,
  });
  at(meta.name, MARGIN, PAGE_HEIGHT - 84, { size: 24, font: bold });
  at(
    meta.establishmentName === null
      ? labels.pdf.consolidated
      : labels.pdf.establishmentLine(meta.establishmentName),
    MARGIN,
    PAGE_HEIGHT - 106,
    { size: 12, color: SOFT },
  );
  at(labels.pdf.periodLine(meta.periodLabel.from, meta.periodLabel.to), MARGIN, PAGE_HEIGHT - 124, {
    size: 10,
    color: SOFT,
  });
  at(labels.pdf.generatedAt(meta.generatedAtLabel), MARGIN, PAGE_HEIGHT - 140, {
    size: 9,
    color: SOFT,
  });
  y = PAGE_HEIGHT - 182;

  const sections = orderedSections(snapshot.sections).filter((section) => section.included);

  // ------------------------------------------------------------------
  // 2 · "Lo esencial" — si solo lees una página, es esta
  // ------------------------------------------------------------------
  //
  // Como mucho tres tarjetas, y **las que no hay no se dibujan**: una
  // tarjeta vacía en portada es peor que una portada con dos (CLAUDE.md,
  // §178). Por eso el bloque entero desaparece si no hay ninguna.
  const esenciales = headlineFigures(snapshot);
  if (esenciales.length > 0) {
    write(labels.pdf.headline, { size: 15, font: bold });
    write(labels.pdf.headlineHint, { size: 9, color: SOFT, gap: 12 });

    const ancho = (PAGE_WIDTH - MARGIN * 2 - 24) / 3;
    esenciales.forEach((figure, index) => {
      const x = MARGIN + index * (ancho + 12);
      page.drawRectangle({ x, y: y - 62, width: ancho, height: 62, color: FILL });
      at(fit(figureLabel(figure, labels).toUpperCase(), ancho - 24, 7.5, regular), x + 12, y - 20, {
        size: 7.5,
        color: SOFT,
      });
      at(fit(figureText(figure, labels, true), ancho - 24, 18, bold), x + 12, y - 42, {
        size: 18,
        font: bold,
      });
      const variacion = changeText(figure, labels, true);
      if (variacion !== null) {
        const cambio = figureChange(figure);
        at(variacion, x + 12, y - 54, {
          size: 8,
          font: bold,
          // RN-REP-17 · el color dice la DIRECCIÓN, no si está bien: que
          // suban las incidencias es malo y que suban las visitas es
          // bueno, y decidirlo cifra a cifra sería una lista de juicios
          // inventada. Lo que está bien lo escribe una persona en el
          // resumen ejecutivo.
          color: cambio.kind === "percent" && cambio.percent < 0 ? RED : GREEN,
        });
      }
    });
    y -= 78;
  }

  // ------------------------------------------------------------------
  // 3 · Resumen ejecutivo, con la línea que dice quién lo escribió
  // ------------------------------------------------------------------
  const resumen = snapshot.notes.executive_summary;
  if (sections.some((section) => section.key === "executive_summary") && resumen) {
    write(labels.sections.executive_summary, { size: 11, font: bold });
    paragraph(resumen);
    write(labels.pdf.writtenByAPerson, { size: 8, color: SOFT, gap: 10 });
    space(6);
    rule();
  }

  // ------------------------------------------------------------------
  // 4 · Índice de lo que trae ESTE informe
  // ------------------------------------------------------------------
  //
  // Se numeran solo las secciones de cuerpo: el resumen ejecutivo ya va
  // arriba y anunciarlo aquí sería mandar al lector a una página que ya
  // ha leído.
  const cuerpo = sections.filter((section) => section.key !== "executive_summary");
  if (cuerpo.length > 0) {
    write(labels.pdf.contentsTitle, { size: 11, font: bold });
    cuerpo.forEach((section, index) => {
      write(`${index + 1}. ${labels.sections[section.key] ?? section.key}`, {
        size: 9,
        color: SOFT,
        gap: 3,
      });
    });
  }

  // ------------------------------------------------------------------
  // 5 · Una sección por página
  // ------------------------------------------------------------------
  cuerpo.forEach((section, index) => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;

    write(`${index + 1} · ${labels.sections[section.key] ?? section.key}`, {
      size: 16,
      font: bold,
      color: GREEN,
    });

    const note = snapshot.notes[section.key];
    if (note) {
      paragraph(note);
      space(6);
    }

    if (section.key === "month_activity") {
      pintarRelato(snapshot);
    } else if (section.key === "opportunities") {
      pintarOportunidades(snapshot.opportunities);
    } else if (section.key === "annexes") {
      pintarAnexos(snapshot);
    } else {
      pintarCifras(section.key);
    }
  });

  /**
   * RN-REP-18 · el relato del mes: una línea por cosa que pasó, con su
   * fecha delante. Es lo que Bosco pidió — *"un resumen de todo lo que ha
   * pasado en el mes"*— y por eso no se recorta: un relato con puntos
   * suspensivos no es un relato.
   */
  function pintarRelato(version: ReportSnapshot): void {
    const relato = version.activity;
    const bolsa = version.allowance ?? [];

    if (relato === undefined) {
      // Una versión anterior a la migración 112 no lo trae. No se
      // recalcula —es el original de su día (RN-REP-12)—: se dice.
      write(es.emptyReasons.no_data_yet, { size: 10, color: SOFT });
      return;
    }

    // RN-REP-20 · la bolsa, a la cabeza. Las cuatro categorías siempre,
    // el "0 de 0" incluido: esa línea dice lo que el plan NO le da.
    if (bolsa.length > 0) {
      write(labels.allowance.title, { size: 11, font: bold, gap: 10 });
      for (const linea of bolsa) {
        room(20);
        at(es.naming.categoriesPlural[linea.category], MARGIN, y, { size: 9.5 });
        at(fit(allowanceText(linea, labels), 230, 9.5, bold), MARGIN + 200, y, { size: 9.5, font: bold });
        y -= 8;
        page.drawLine({
          start: { x: MARGIN, y },
          end: { x: PAGE_WIDTH - MARGIN, y },
          thickness: 0.5,
          color: RULE,
        });
        y -= 10;
      }
      space(10);
    }

    if (relato.changes.length === 0 && relato.entries.length === 0 && bolsa.length === 0) {
      write(labels.activity.empty, { size: 10, color: SOFT });
      return;
    }

    // RN-REP-18 · la ficha de cada cambio: qué pidió, qué se cambió,
    // cuándo y de qué tipo. Tres líneas por cambio, como la maqueta que
    // aprobó Bosco.
    if (relato.changes.length > 0) {
      write(labels.activity.changesTitle, { size: 11, font: bold, gap: 10 });
      for (const cambio of relato.changes) {
        // El bloque entero de un tirón: partir una ficha entre dos páginas
        // dejaría un título huérfano al pie.
        room(cambio.description ? 58 : 44);
        at(fechaCorta(cambio.requestedAt), MARGIN, y, { size: 9, color: SOFT });
        at(fit(cambio.title ?? cambio.code, 280, 10.5, bold), MARGIN + 60, y, { size: 10.5, font: bold });
        const tipo = changeCategoryText(cambio, labels);
        at(tipo, PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(sanitize(tipo), 9), y, {
          size: 9,
          color: cambio.budgeted ? RED : SOFT,
        });
        y -= 14;

        if (cambio.description) {
          for (const linea of wrap(cambio.description, 80)) {
            at(linea, MARGIN + 60, y, { size: 9.5, color: SOFT });
            y -= 12;
          }
        }

        at(changeDatesText(cambio, labels), MARGIN + 60, y, { size: 8.5, font: bold, color: SOFT });
        y -= 10;
        page.drawLine({
          start: { x: MARGIN, y },
          end: { x: PAGE_WIDTH - MARGIN, y },
          thickness: 0.5,
          color: RULE,
        });
        y -= 12;
      }
      space(6);
    }

    if (relato.entries.length > 0) {
      write(labels.activity.othersTitle, { size: 11, font: bold, gap: 10 });
      for (const entrada of orderedActivity(relato.entries)) {
        room(18);
        at(fechaCorta(entrada.at), MARGIN, y, { size: 9, color: SOFT });
        at(activityText(entrada, labels), MARGIN + 60, y, { size: 10 });
        y -= 8;
        page.drawLine({
          start: { x: MARGIN, y },
          end: { x: PAGE_WIDTH - MARGIN, y },
          thickness: 0.5,
          color: RULE,
        });
        y -= 10;
      }
    }
  }

  /** Las cifras de una sección, en la tabla de tres columnas de la maqueta. */
  function pintarCifras(key: ReportSectionKey): void {
    const figures = figuresOfSection(snapshot, key);
    if (figures.length === 0) {
      // CA-20 · nunca un hueco mudo: si la sección no trae cifra, se dice.
      write(es.emptyReasons.no_data_yet, { size: 10, color: SOFT });
      return;
    }

    // Tres columnas con su ancho declarado, y cada celda recortada al
    // suyo. El ancho útil de la hoja son 483 pt; se reparten 240 / 120 /
    // 123 porque el concepto es lo más largo y la comparación lo más
    // corto.
    const ANCHO_CONCEPTO = 240;
    const ANCHO_VALOR = 118;
    const xValor = MARGIN + ANCHO_CONCEPTO + 10;
    const xComp = xValor + ANCHO_VALOR + 10;
    const anchoComp = PAGE_WIDTH - MARGIN - xComp;

    room(24);
    at(labels.pdf.columnConcept, MARGIN, y, { size: 7.5, font: bold, color: SOFT });
    at(labels.pdf.columnValue, xValor, y, { size: 7.5, font: bold, color: SOFT });
    // La columna de comparación solo se anuncia si alguna cifra la trae:
    // un encabezado sobre una columna vacía promete algo que no está.
    const hayComparacion = figures.some((figure) => changeText(figure, labels) !== null);
    if (hayComparacion) at(labels.pdf.columnPrevious, xComp, y, { size: 7.5, font: bold, color: SOFT });
    y -= 8;
    rule(12);

    for (const figure of figures) {
      room(22);
      const sinDato = figure.value === null;
      at(fit(figureLabel(figure, labels), ANCHO_CONCEPTO, 9.5, regular), MARGIN, y, { size: 9.5 });
      at(fit(figureText(figure, labels, true), ANCHO_VALOR, 9.5, sinDato ? regular : bold), xValor, y, {
        size: 9.5,
        // Una cifra que no existe se escribe con su motivo, en redonda y
        // en gris: no es un número, y ponerla en negrita la haría parecer
        // uno.
        font: sinDato ? regular : bold,
        color: sinDato ? SOFT : INK,
      });
      const variacion = changeText(figure, labels, true);
      if (variacion !== null) at(fit(variacion, anchoComp, 8.5, regular), xComp, y, { size: 8.5, color: SOFT });
      y -= 8;
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_WIDTH - MARGIN, y },
        thickness: 0.5,
        color: RULE,
      });
      y -= 12;
    }

    // RN-REP-17 · las barras de dos tonos, **solo en Rendimiento
    // digital**, que es donde las dibuja la maqueta y donde significan
    // algo: son cuentas comparables entre sí —sesiones, clics,
    // impresiones—. En Operación no valen: un 100 % de cumplimiento
    // contra otro 100 % son dos barras iguales que no dicen nada, y un
    // tiempo medio dibujado como barra se lee al revés, porque ahí la
    // barra corta es la buena.
    //
    // Van DESPUÉS de la tabla y no en su lugar: la tabla lleva el número
    // exacto, la barra lleva el tamaño relativo, y quitar una por la otra
    // quitaría la mitad.
    if (key !== "digital") return;

    const comparables = figures.filter(
      (figure): figure is ReportFigure & { previous: number } =>
        figure.value !== null &&
        figure.value >= 0 &&
        typeof figure.previous === "number" &&
        figure.previous >= 0 &&
        (figure.value > 0 || figure.previous > 0),
    );
    if (comparables.length === 0) return;

    space(14);
    write(labels.pdf.barsLegend, { size: 8, color: SOFT, gap: 12 });

    const anchoMax = 170;
    const xBarra = MARGIN + 210;
    for (const figure of comparables) {
      room(34);
      const tope = Math.max(figure.value ?? 0, figure.previous);
      at(fit(figureLabel(figure, labels), 200, 9.5, regular), MARGIN, y, { size: 9.5 });
      page.drawRectangle({
        x: xBarra,
        y: y - 1,
        width: ((figure.value ?? 0) / tope) * anchoMax,
        height: 7,
        color: GREEN,
      });
      page.drawRectangle({
        x: xBarra,
        y: y - 11,
        width: (figure.previous / tope) * anchoMax,
        height: 7,
        color: RULE,
      });
      at(figureText(figure, labels), xBarra + anchoMax + 10, y, { size: 8.5, font: bold });
      at(figureText({ ...figure, value: figure.previous }, labels), xBarra + anchoMax + 10, y - 11, {
        size: 8.5,
        color: SOFT,
      });
      y -= 30;
    }
  }

  /** §96 · las aprobadas, numeradas, con su impacto y su esfuerzo. */
  function pintarOportunidades(oportunidades: readonly ReportOpportunity[]): void {
    if (oportunidades.length === 0) {
      write(es.emptyReasons.no_data_yet, { size: 10, color: SOFT });
      return;
    }

    oportunidades.forEach((opportunity, index) => {
      room(48);
      at(`${index + 1}.`, MARGIN, y, { size: 11, font: bold, color: GREEN });
      at(opportunityTitle(opportunity), MARGIN + 18, y, { size: 11, font: bold });
      y -= 14;

      const impacto =
        es.opportunities.impacts[opportunity.impact as keyof typeof es.opportunities.impacts] ??
        opportunity.impact;
      // Decisión 26b · el esfuerzo ES la categoría del cambio. Sin ella no
      // se inventa una: se dice que todavía no la tiene.
      const esfuerzo =
        opportunity.effortCategory === null
          ? labels.pdf.opportunityEffortUnknown
          : (es.naming.categories[opportunity.effortCategory as keyof typeof es.naming.categories] ??
            opportunity.effortCategory);
      at(labels.pdf.opportunityMeta(impacto, esfuerzo), MARGIN + 18, y, {
        size: 8,
        font: bold,
        color: SOFT,
      });
      y -= 16;
    });
  }

  /**
   * §94 · de dónde sale cada cifra y hasta cuándo llega. Esta página es la
   * que permite leer un hueco sin llamar a nadie, y por eso no se redacta:
   * se lee de las propias cifras digitales, que ya traen su fuente, su
   * fecha de última sincronización y su motivo de vacío.
   */
  function pintarAnexos(version: ReportSnapshot): void {
    const porFuente = new Map<string, { at: string | null; reason: string | null }>();
    for (const figure of figuresOfSection(version, "digital")) {
      if (!figure.dimension) continue;
      const previo = porFuente.get(figure.dimension);
      porFuente.set(figure.dimension, {
        // La más reciente de las fechas de esa fuente: es la que contesta
        // "¿hasta cuándo llegan estos datos?".
        at: figure.at && (!previo?.at || figure.at > previo.at) ? figure.at : (previo?.at ?? null),
        reason: figure.value === null ? (figure.noDataReason ?? previo?.reason ?? null) : (previo?.reason ?? null),
      });
    }

    if (porFuente.size === 0) {
      write(es.emptyReasons.no_data_yet, { size: 10, color: SOFT });
      return;
    }

    for (const [provider, estado] of porFuente) {
      room(20);
      const nombre =
        es.integrations.providers[provider as keyof typeof es.integrations.providers]?.name ?? provider;
      const conectada = estado.reason === null;
      at(nombre, MARGIN, y, { size: 9.5, font: bold });
      at(conectada ? labels.pdf.sourceConnected : labels.pdf.sourceMissing, MARGIN + 170, y, {
        size: 9.5,
        color: conectada ? GREEN : RED,
      });
      at(
        estado.reason !== null && estado.reason in es.emptyReasons
          ? es.emptyReasons[estado.reason as keyof typeof es.emptyReasons]
          : estado.at
            ? labels.pdf.sourceUpTo(fechaCorta(estado.at))
            : labels.pdf.noValue,
        MARGIN + 250,
        y,
        { size: 9, color: SOFT },
      );
      y -= 16;
    }
  }

  // ------------------------------------------------------------------
  // 6 · El pie, en todas las páginas
  // ------------------------------------------------------------------
  //
  // Un PDF se imprime y se reparte suelto: una hoja sin contexto no se
  // sabe de quién es ni de cuándo.
  const total = pdf.getPageCount();
  const pie = labels.pdf.footer(
    meta.establishmentName ?? labels.pdf.consolidated,
    `${meta.periodLabel.from} – ${meta.periodLabel.to}`,
  );
  pdf.getPages().forEach((hoja, index) => {
    hoja.drawText(sanitize(pie), {
      x: MARGIN,
      y: MARGIN - 24,
      size: 7.5,
      font: regular,
      color: SOFT,
    });
    const numero = sanitize(labels.pdf.pageOfShort(index + 1, total));
    hoja.drawText(numero, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(numero, 7.5),
      y: MARGIN - 24,
      size: 7.5,
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

export function sanitize(text: string): string {
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
