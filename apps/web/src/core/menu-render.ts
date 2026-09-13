/**
 * `src/core/menu-render.ts` — de una versión de menú y su plantilla al
 * DOCUMENTO que se pinta (RN-MEN-02, RN-MEN-04, §58, §59). Lógica pura:
 * lo que aquí sale es una estructura con textos ya formateados —el
 * precio como "14,50 €", la fecha como "lunes, 15 de julio de 2026", las
 * secciones vacías fuera— y nada de cómo se dibuja. Dibujarlo es de
 * `src/services/menu-image.tsx`, que depende de Next.
 *
 * Separarlo así es lo que permite probar con tests que un menú sin
 * postres no pinta la sección "Postres" o que un precio en céntimos se
 * escribe con coma, sin levantar ningún motor de imágenes.
 */

/** Las tres disposiciones de la migración 78. Implementación, no regla. */
export const MENU_LAYOUTS = ["classic", "board", "elegant"] as const;
export type MenuLayout = (typeof MENU_LAYOUTS)[number];

export function isMenuLayout(value: string): value is MenuLayout {
  return (MENU_LAYOUTS as readonly string[]).includes(value);
}

export interface MenuVersionContent {
  readonly starters: readonly string[];
  readonly mains: readonly string[];
  readonly desserts: readonly string[];
  readonly drink: string | null;
  readonly priceCents: number | null;
  readonly note: string | null;
}

export interface MenuTemplateDesign {
  readonly layout: MenuLayout;
  readonly backgroundColor: string;
  readonly textColor: string;
  readonly accentColor: string;
  /** Null: el nombre del restaurante. */
  readonly headingText: string | null;
  readonly footerText: string | null;
  readonly showPrices: boolean;
}

export interface MenuRenderInput {
  readonly establishmentName: string;
  readonly menuName: string;
  /** "YYYY-MM-DD". */
  readonly targetDate: string;
  readonly version: number;
  readonly content: MenuVersionContent;
  readonly design: MenuTemplateDesign;
}

export interface MenuSection {
  readonly title: string;
  readonly items: readonly string[];
}

export interface MenuDocument {
  readonly layout: MenuLayout;
  readonly colors: { readonly background: string; readonly text: string; readonly accent: string };
  readonly heading: string;
  readonly subheading: string;
  readonly dateLabel: string;
  readonly sections: readonly MenuSection[];
  readonly drink: string | null;
  readonly price: string | null;
  readonly note: string | null;
  readonly footer: string | null;
  readonly versionLabel: string;
}

/** §58 · los nombres de las tres secciones, los mismos en pantalla y en el archivo (CA-21). */
export const SECTION_TITLES = {
  starters: "Primeros",
  mains: "Segundos",
  desserts: "Postres",
} as const;

/** "1450" → "14,50 €". Céntimos enteros, coma decimal, espacio antes del símbolo. */
export function formatPriceCents(cents: number): string {
  const euros = Math.trunc(cents / 100);
  const rest = Math.abs(cents % 100);
  return `${euros.toLocaleString("es-ES")},${String(rest).padStart(2, "0")} €`;
}

/** "2026-07-15" → "miércoles, 15 de julio de 2026". Sin zona: es una fecha civil. */
export function formatMenuDate(targetDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(targetDate);
  if (!match) {
    throw new Error(`Fecha objetivo inválida: ${targetDate}`);
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function cleanItems(items: readonly string[]): readonly string[] {
  return items.map((item) => item.trim()).filter((item) => item.length > 0);
}

/**
 * El documento. Una sección sin platos no aparece (un menú de Navidad
 * puede no tener primeros); el precio solo si la plantilla los enseña y
 * hay precio; la cabecera es la de la plantilla o el nombre del local.
 */
export function buildMenuDocument(input: MenuRenderInput): MenuDocument {
  const sections: MenuSection[] = [];
  const starters = cleanItems(input.content.starters);
  const mains = cleanItems(input.content.mains);
  const desserts = cleanItems(input.content.desserts);
  if (starters.length > 0) sections.push({ title: SECTION_TITLES.starters, items: starters });
  if (mains.length > 0) sections.push({ title: SECTION_TITLES.mains, items: mains });
  if (desserts.length > 0) sections.push({ title: SECTION_TITLES.desserts, items: desserts });

  const drink = input.content.drink?.trim() || null;
  const note = input.content.note?.trim() || null;
  const price =
    input.design.showPrices && input.content.priceCents !== null
      ? formatPriceCents(input.content.priceCents)
      : null;

  return {
    layout: input.design.layout,
    colors: {
      background: input.design.backgroundColor,
      text: input.design.textColor,
      accent: input.design.accentColor,
    },
    heading: input.design.headingText?.trim() || input.establishmentName,
    subheading: input.menuName,
    dateLabel: formatMenuDate(input.targetDate),
    sections,
    drink,
    price,
    note,
    footer: input.design.footerText?.trim() || null,
    versionLabel: `v${input.version}`,
  };
}

/**
 * El nombre del archivo que se descarga: sin acentos ni espacios para que
 * ningún navegador lo estropee, con la fecha y la versión para que dos
 * descargas de versiones distintas no se pisen en la carpeta de nadie.
 */
export function menuFileName(input: { menuName: string; targetDate: string; version: number }, format: "png" | "pdf"): string {
  const slug = input.menuName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `menu-${slug || "menu"}-${input.targetDate}-v${input.version}.${format}`;
}
