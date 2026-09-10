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

/**
 * Gestión, con la ficha de datos por delante.
 *
 * §20 de la especificación maestra enumera cinco contenidos —"plan, pagos,
 * usuarios, archivos e integraciones"— y ninguno es el bloque de datos.
 * Pero §15.2 pide quince datos mínimos, y nueve de ellos (razón social,
 * identificación fiscal, dirección, teléfonos, correos, sitio web,
 * dominio, horarios y plataforma web) no caben en ninguno de los cinco:
 * hasta la migración 57 no se guardaban en ninguna parte y el bloque de
 * Operación se limitaba a decir por qué. Van aquí, que es donde los pone
 * la maqueta, y primeros: es la identidad del restaurante, lo que se
 * consulta antes que su plan.
 *
 * `establishmentData` y no `data` porque `data` ya es la pestaña "Informes
 * y datos", y dos cosas distintas con el mismo nombre en la misma pantalla
 * se confunden en la primera lectura. Su hueco en la dirección es
 * `?vista=gestion&bloque=ficha`.
 */
export const MANAGEMENT_BLOCKS: readonly ManagementBlock[] = [
  { key: "establishmentData", slug: "ficha" },
  { key: "plan", slug: "plan" },
  { key: "payments", slug: "pagos" },
  { key: "users", slug: "usuarios" },
  { key: "files", slug: "archivos" },
  { key: "integrations", slug: "integraciones" },
];

/**
 * Los que se nombran desde fuera de esta lista. Se buscan por su clave
 * y no por su posición: `MANAGEMENT_BLOCKS[3]` era "archivos" hasta que la
 * ficha de datos se puso delante, y un índice a mano habría movido el
 * filtro del catálogo al bloque de usuarios sin que fallara ningún tipo.
 */
export const MANAGEMENT_TAB: SheetTab = SHEET_TABS.find((tab) => tab.key === "management")!;
export const OPERATION_TAB: SheetTab = SHEET_TABS.find((tab) => tab.key === "operation")!;
export const FILES_BLOCK: ManagementBlock =
  MANAGEMENT_BLOCKS.find((block) => block.key === "files")!;
export const PAYMENTS_BLOCK: ManagementBlock =
  MANAGEMENT_BLOCKS.find((block) => block.key === "payments")!;

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
    vista: MANAGEMENT_TAB.slug,
    bloque: FILES_BLOCK.slug,
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
