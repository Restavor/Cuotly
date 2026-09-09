import { es } from "@/i18n/es";

/**
 * PRD §15.2 · "La ficha tiene cinco pestañas: Resumen · Operación ·
 * Informes y datos · Gestión · Historial", y Gestión se divide a su vez en
 * cinco bloques.
 *
 * Las pestañas son un DATO, no JSX, por lo mismo que la navegación del
 * armazón (`src/components/shell/navigation.ts`): así la barra de
 * pestañas, la lectura de la dirección y los tests salen del mismo sitio y
 * no puede existir una pestaña que se pinte y no se sepa leer, ni al
 * revés.
 *
 * La pestaña viaja en la dirección (`?vista=gestion&bloque=archivos`) y no
 * en un estado del navegador: así se comparte el enlace de "los archivos
 * de Magariños", el botón de volver deshace el cambio de pestaña y la
 * pantalla entera sigue siendo de servidor — sin hidratación no se pierde
 * la navegación (CA-22).
 */
export interface SheetTab {
  readonly key: keyof typeof es.establishmentSheet.tabs;
  readonly slug: string;
}

export interface ManagementBlock {
  readonly key: keyof typeof es.establishmentSheet.blocks;
  readonly slug: string;
}

export const SHEET_TABS: readonly SheetTab[] = [
  { key: "summary", slug: "resumen" },
  { key: "operation", slug: "operacion" },
  { key: "data", slug: "datos" },
  { key: "management", slug: "gestion" },
  { key: "history", slug: "historial" },
];

export const MANAGEMENT_BLOCKS: readonly ManagementBlock[] = [
  { key: "plan", slug: "plan" },
  { key: "payments", slug: "pagos" },
  { key: "users", slug: "usuarios" },
  { key: "files", slug: "archivos" },
  { key: "integrations", slug: "integraciones" },
];

/**
 * Qué pestaña pide la dirección. Lo que no se reconoce cae en la primera,
 * que es Resumen: una dirección escrita a mano o un enlace viejo enseña la
 * ficha, no un hueco en blanco ni un 404.
 */
export function parseSheetTab(value: string | undefined): SheetTab {
  return SHEET_TABS.find((tab) => tab.slug === value) ?? SHEET_TABS[0];
}

export function parseManagementBlock(value: string | undefined): ManagementBlock {
  return MANAGEMENT_BLOCKS.find((block) => block.slug === value) ?? MANAGEMENT_BLOCKS[0];
}

/**
 * La dirección de una pestaña. `bloque` solo se escribe cuando se pide,
 * para que el enlace de "Gestión" no fije un bloque y se pueda volver al
 * que estaba.
 */
export function sheetHref(
  base: string,
  tab: SheetTab,
  block?: ManagementBlock,
): string {
  const params = new URLSearchParams({ vista: tab.slug });
  if (block !== undefined) params.set("bloque", block.slug);
  return `${base}?${params.toString()}`;
}

/**
 * La dirección del bloque de archivos, con su filtro de categoría
 * (`?tipo=`) y el archivo abierto en el panel de versiones (`?archivo=`).
 *
 * Los dos viajan en la dirección y no en un estado del navegador, por lo
 * mismo que la pestaña: "los menús de Magariños con la carta de
 * septiembre abierta" es un enlace que se pega en un mensaje, y el botón
 * de volver deshace tanto el filtro como la apertura del panel (CA-22).
 *
 * Lo que llega como `null` NO se escribe. Un `?tipo=` vacío en la
 * dirección se lee luego como un filtro, y filtrar por nada dejaría la
 * tabla vacía sin que nadie lo hubiera pedido.
 */
export function filesHref(
  base: string,
  { category, fileId }: { category: string | null; fileId: string | null },
): string {
  const params = new URLSearchParams({
    vista: SHEET_TABS[3].slug,
    bloque: MANAGEMENT_BLOCKS[3].slug,
  });
  if (category !== null) params.set("tipo", category);
  if (fileId !== null) params.set("archivo", fileId);
  return `${base}?${params.toString()}`;
}

export function sheetTabLabel(tab: SheetTab): string {
  return es.establishmentSheet.tabs[tab.key];
}

export function managementBlockLabel(block: ManagementBlock): string {
  return es.establishmentSheet.blocks[block.key];
}
