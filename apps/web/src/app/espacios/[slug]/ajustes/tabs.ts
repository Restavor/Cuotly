import { es } from "@/i18n/es";

/**
 * Las ocho pestañas de "Ajustes del espacio" (página 109 del diseño
 * definitivo móvil): **General · Horarios · Impuestos · Integraciones ·
 * Suscripción · Seguridad · Auditoría · Notificaciones**.
 *
 * Hasta ahora la pantalla era **una sola columna larguísima** con todas
 * las secciones seguidas: casi quinientas líneas que había que recorrer
 * para llegar al calendario. Lo que el diseño cambia es cómo se llega a
 * cada cosa, no qué hace cada cosa — las reglas son las de siempre
 * (RN-NOT, RN-CLK, RN-FIN-08…).
 *
 * **Dos de las ocho ya eran páginas propias** y se quedan como están:
 * `Suscripción` vive en `/ajustes/suscripcion` y `Auditoría` en
 * `/ajustes/auditoria`. Sus direcciones **no se tocan** porque hay avisos
 * ya emitidos que apuntan ahí —`run_cuotly_storage_sweep()` manda a la
 * suscripción— y RN-NOT-04 dice que un aviso abre el elemento exacto. Un
 * enlace profundo que deja de funcionar es un aviso roto, no un detalle de
 * navegación. Por eso su "pestaña" es un enlace a su ruta, y las otras
 * seis viajan en `?vista=`.
 *
 * Las pestañas son un DATO y no JSX, por lo mismo que en la ficha del
 * restaurante (`components/establishment/tabs.ts`): así la barra, la
 * lectura de la dirección y los tests salen del mismo sitio.
 */
export interface SettingsTab {
  readonly key: keyof typeof es.settings.tabs;
  readonly slug: string;
  /**
   * Cuando la pestaña ya es una página propia, su ruta relativa al espacio.
   * `null` significa que se pinta dentro de `/ajustes` con `?vista=`.
   */
  readonly route: string | null;
}

export const SETTINGS_TABS: readonly SettingsTab[] = [
  { key: "general", slug: "general", route: null },
  { key: "schedule", slug: "horarios", route: null },
  { key: "taxes", slug: "impuestos", route: null },
  { key: "integrations", slug: "integraciones", route: null },
  { key: "subscription", slug: "suscripcion", route: "ajustes/suscripcion" },
  { key: "security", slug: "seguridad", route: null },
  { key: "audit", slug: "auditoria", route: "ajustes/auditoria" },
  { key: "notifications", slug: "notificaciones", route: null },
];

/**
 * Qué pestaña pide la dirección. Lo que no se reconoce cae en la primera,
 * que es General: un enlace viejo o escrito a mano enseña los ajustes, no
 * un hueco en blanco ni un 404.
 */
export function parseSettingsTab(value: string | undefined): SettingsTab {
  return SETTINGS_TABS.find((tab) => tab.slug === value) ?? SETTINGS_TABS[0];
}

/** A dónde lleva cada pestaña desde el espacio `slug`. */
export function settingsTabHref(spaceSlug: string, tab: SettingsTab): string {
  const base = `/espacios/${spaceSlug}`;
  if (tab.route !== null) return `${base}/${tab.route}`;
  return `${base}/ajustes?vista=${tab.slug}`;
}
