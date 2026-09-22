import { DATA_SECTIONS, type DataSection } from "@/core/integrations";
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
 * Gestión, con la ficha de datos por delante. **Nueve bloques**
 * (RN-EST-14, decisión 48), que son los de la página 27 del diseño
 * definitivo móvil más el estado del servicio.
 *
 * El diseño se contradice a sí mismo —su página 58 enseña otra lista:
 * Usuarios y accesos / Configuración / Archivos / Copias de seguridad— y
 * manda la 27, que es la que enumera la pestaña entera; la 58 solo dibuja
 * una de sus subpestañas y llama "Configuración" a lo que la 27 llama
 * Datos.
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
  // RN-EST-14 · las dos que el diseño definitivo pone en Gestión y que ya
  // existían en otro sitio: las notas internas se leían desde la
  // conversación (migraciones 66 y 67) y las copias de seguridad desde el
  // cuerpo de la ficha (migración 100). No cambia ninguna regla suya:
  // cambia por dónde se entra.
  { key: "internalNotes", slug: "notas" },
  { key: "backups", slug: "copias" },
  // M84 y M47 · el estado de servicio del restaurante: archivar, reactivar
  // y registrar la baja que llegó por teléfono. Va el último a propósito:
  // son las tres acciones que no se hacen todos los días, y ponerlas antes
  // de los datos o del plan las convertiría en un tropiezo. El diseño no lo
  // dibuja, y se queda igual: archivar y reactivar tienen que vivir en
  // algún sitio (RN-EST-14).
  { key: "serviceStatus", slug: "estado" },
];

/**
 * Los que se nombran desde fuera de esta lista. Se buscan por su clave
 * y no por su posición: `MANAGEMENT_BLOCKS[3]` era "archivos" hasta que la
 * ficha de datos se puso delante, y un índice a mano habría movido el
 * filtro del catálogo al bloque de usuarios sin que fallara ningún tipo.
 */
export const MANAGEMENT_TAB: SheetTab = SHEET_TABS.find((tab) => tab.key === "management")!;
export const DATA_TAB: SheetTab = SHEET_TABS.find((tab) => tab.key === "data")!;
export const OPERATION_TAB: SheetTab = SHEET_TABS.find((tab) => tab.key === "operation")!;
export const HISTORY_TAB: SheetTab = SHEET_TABS.find((tab) => tab.key === "history")!;
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
 * Las seis secciones de "Informes y datos" (maquetas 09 a 12 y las seis
 * vistas "sin datos"), con su hueco en la dirección
 * (`?vista=datos&seccion=analitica`). Qué fuente va en cada una lo dice el
 * dominio (`DATA_SECTION_PROVIDERS`); aquí solo se les da dirección y
 * nombre, por lo mismo que a las pestañas: un enlace a "la analítica de
 * Magariños" se pega en un mensaje y el botón de volver lo deshace.
 */
export interface DataSectionTab {
  readonly key: DataSection;
  readonly slug: string;
}

const DATA_SECTION_SLUGS: Readonly<Record<DataSection, string>> = {
  summary: "resumen",
  analytics: "analitica",
  search: "busqueda",
  behavior: "comportamiento",
  performance: "rendimiento",
  opportunities: "oportunidades",
};

export const DATA_SECTION_TABS: readonly DataSectionTab[] = DATA_SECTIONS.map((key) => ({
  key,
  slug: DATA_SECTION_SLUGS[key],
}));

/** La sección de Oportunidades, que se nombra desde fuera (página 26). */
export const OPPORTUNITIES_SECTION: DataSectionTab = DATA_SECTION_TABS.find(
  (section) => section.key === "opportunities",
)!;

/** Una sección desconocida cae en el Resumen, igual que una pestaña desconocida. */
export function parseDataSection(value: string | undefined): DataSectionTab {
  return DATA_SECTION_TABS.find((section) => section.slug === value) ?? DATA_SECTION_TABS[0];
}

export function dataSectionHref(base: string, section: DataSectionTab): string {
  const params = new URLSearchParams({ vista: DATA_TAB.slug, seccion: section.slug });
  return `${base}?${params.toString()}`;
}

export function dataSectionLabel(section: DataSectionTab): string {
  return es.establishmentSheet.dataSections[section.key];
}

/**
 * Página 25 del diseño · las cuatro secciones de "Operación", con su
 * hueco en la dirección (`?vista=operacion&seccion=trabajos`).
 *
 * **Por qué son secciones y no cuatro tarjetas a la vez.** Lo eran: en un
 * teléfono salían apiladas, cuatro listas cortas seguidas, y para llegar a
 * las tareas había que pasar por delante de todo lo demás. El diseño las
 * pone como un control segmentado y enseña una cada vez, que es lo que
 * cabe en una pantalla.
 *
 * Igual que las de "Informes y datos", viven en la dirección: un enlace a
 * "los trabajos de Magariños" se pega en un mensaje y el botón de volver
 * lo deshace.
 */
export const OPERATION_SECTIONS = ["requests", "jobs", "tasks", "dailyMenu"] as const;

export type OperationSection = (typeof OPERATION_SECTIONS)[number];

export interface OperationSectionTab {
  readonly key: OperationSection;
  readonly slug: string;
}

const OPERATION_SECTION_SLUGS: Readonly<Record<OperationSection, string>> = {
  requests: "solicitudes",
  jobs: "trabajos",
  tasks: "tareas",
  dailyMenu: "menu-diario",
};

export const OPERATION_SECTION_TABS: readonly OperationSectionTab[] = OPERATION_SECTIONS.map(
  (key) => ({ key, slug: OPERATION_SECTION_SLUGS[key] }),
);

/** Una sección desconocida cae en Solicitudes, igual que arriba. */
export function parseOperationSection(value: string | undefined): OperationSectionTab {
  return (
    OPERATION_SECTION_TABS.find((section) => section.slug === value) ?? OPERATION_SECTION_TABS[0]
  );
}

export function operationSectionHref(base: string, section: OperationSectionTab): string {
  const params = new URLSearchParams({ vista: OPERATION_TAB.slug, seccion: section.slug });
  return `${base}?${params.toString()}`;
}

/**
 * Página 25 · la dirección de una solicitud **abierta dentro de la ficha**,
 * en la sección Solicitudes.
 *
 * La solicitud elegida viaja en la dirección, como la sección: así el
 * panel se puede enlazar, el botón de volver lo cierra y sin JavaScript
 * funciona igual. `sin` es el enlace de cerrar, que quita el parámetro.
 */
export function openRequestHref(base: string, requestId: string | null): string {
  const params = new URLSearchParams({
    vista: OPERATION_TAB.slug,
    seccion: OPERATION_SECTION_SLUGS.requests,
  });
  if (requestId !== null) params.set("solicitud", requestId);
  return `${base}?${params.toString()}`;
}

export function operationSectionLabel(section: OperationSectionTab): string {
  return es.establishmentSheet.operationSections[section.key];
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

/**
 * M42 · las tres pestañas del bloque de Pagos: Cobros, Presupuestos y
 * Facturas. Viajan en la dirección (`?pagos=`) como todo lo demás de la
 * ficha, así que se comparten y el botón de volver las deshace (CA-22).
 */
export interface PaymentsSection {
  readonly key: keyof typeof es.establishmentSheet.paymentsSections;
  readonly slug: string;
}

export const PAYMENTS_SECTIONS: readonly PaymentsSection[] = [
  { key: "charges", slug: "cobros" },
  { key: "quotes", slug: "presupuestos" },
  { key: "invoices", slug: "facturas" },
];

export function parsePaymentsSection(value: string | undefined): PaymentsSection {
  return PAYMENTS_SECTIONS.find((section) => section.slug === value) ?? PAYMENTS_SECTIONS[0];
}

export function paymentsSectionHref(base: string, section: PaymentsSection): string {
  const params = new URLSearchParams({ vista: MANAGEMENT_TAB.slug, bloque: PAYMENTS_BLOCK.slug });
  if (section.slug !== PAYMENTS_SECTIONS[0].slug) params.set("pagos", section.slug);
  return `${base}?${params.toString()}`;
}
