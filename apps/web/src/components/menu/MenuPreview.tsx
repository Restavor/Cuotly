import { buildMenuDocument, isMenuLayout, type MenuDocument } from "@/core/menu-render";
import { MENU_IMAGE_HEIGHT, MENU_IMAGE_WIDTH, MenuImage } from "@/services/menu-image";

/**
 * R14, R15, R16 · la vista previa del menú en pantalla.
 *
 * Es **el mismo dibujo** que el PNG y el PDF (`MenuImage`, que el motor de
 * imágenes pinta a 1240 × 1754), reducido con CSS. Así lo que se ve aquí
 * es lo que se descarga y lo que el equipo sube a la web, y no una segunda
 * maquetación que un día se desfasa.
 *
 * Y no pasa por `/descargar`: aquella ruta deja la descarga en el historial
 * (RN-MEN-10), y mirar el menú no es descargarlo.
 */
export function MenuPreview({
  doc,
  width,
  label,
  mobileWidth,
}: {
  doc: MenuDocument;
  width: number;
  label: string;
  /**
   * El ancho por debajo de `sm`. La reducción es una escala en píxeles, no
   * un porcentaje, así que un menú de 520 px en un teléfono de 390 no
   * encoge: su caja lo recorta por la derecha. Con esto se pintan dos, cada
   * uno a su tamaño, y solo uno se ve (y lo anuncia el lector de pantalla).
   */
  mobileWidth?: number;
}) {
  if (mobileWidth !== undefined && mobileWidth !== width) {
    return (
      <>
        <span className="block sm:hidden">
          <MenuPreview doc={doc} width={mobileWidth} label={label} />
        </span>
        <span className="hidden sm:block">
          <MenuPreview doc={doc} width={width} label={label} />
        </span>
      </>
    );
  }
  const escala = width / MENU_IMAGE_WIDTH;
  return (
    <div
      role="img"
      aria-label={label}
      className="max-w-full overflow-hidden rounded-md shadow-sm"
      style={{ width, height: Math.round(MENU_IMAGE_HEIGHT * escala) }}
    >
      <div
        style={{
          width: MENU_IMAGE_WIDTH,
          height: MENU_IMAGE_HEIGHT,
          transform: `scale(${escala})`,
          transformOrigin: "top left",
        }}
      >
        <MenuImage doc={doc} />
      </div>
    </div>
  );
}

export type TemplateRow = {
  readonly layout: string;
  readonly background_color: string;
  readonly text_color: string;
  readonly accent_color: string;
  readonly heading_text: string | null;
  readonly footer_text: string | null;
  readonly show_prices: boolean;
};

export type VersionRow = {
  readonly version: number;
  readonly starters: readonly string[] | null;
  readonly mains: readonly string[] | null;
  readonly desserts: readonly string[] | null;
  readonly drink: string | null;
  readonly price_cents: number | null;
  readonly note: string | null;
};

/**
 * De las filas de la base al documento que se pinta. `null` si la
 * plantilla tiene una disposición que no se sabe dibujar: se dice que no
 * hay vista previa en vez de dibujar otra cosa.
 */
export function menuDocumentFromRows(input: {
  establishmentName: string;
  menuName: string;
  targetDate: string;
  version: VersionRow | null;
  template: TemplateRow;
}): MenuDocument | null {
  if (!isMenuLayout(input.template.layout)) return null;
  return buildMenuDocument({
    establishmentName: input.establishmentName,
    menuName: input.menuName,
    targetDate: input.targetDate,
    version: input.version?.version ?? 0,
    content: {
      starters: input.version?.starters ?? [],
      mains: input.version?.mains ?? [],
      desserts: input.version?.desserts ?? [],
      drink: input.version?.drink ?? null,
      priceCents: input.version?.price_cents ?? null,
      note: input.version?.note ?? null,
    },
    design: {
      layout: input.template.layout,
      backgroundColor: input.template.background_color,
      textColor: input.template.text_color,
      accentColor: input.template.accent_color,
      headingText: input.template.heading_text,
      footerText: input.template.footer_text,
      showPrices: input.template.show_prices,
    },
  });
}
