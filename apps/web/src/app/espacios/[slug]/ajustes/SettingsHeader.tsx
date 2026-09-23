import { PageHeader, Tabs } from "@/components/ui";
import { es } from "@/i18n/es";

import { SETTINGS_TABS, settingsTabHref, type SettingsTab } from "./tabs";

/**
 * La cabecera común de Ajustes (M23 y siguientes): "Ajustes del espacio",
 * su subtítulo y las ocho pestañas. La pintan también las páginas propias
 * —Suscripción, Auditoría, Propiedad y Exportación—, para que moverse por
 * Ajustes sea siempre la misma barra y no una colección de páginas sueltas
 * con su "volver".
 *
 * `active` es `null` en las páginas que no son una pestaña (Propiedad y
 * Exportación, M64): se enseña la barra sin ninguna subrayada.
 */
export function SettingsHeader({ slug, active }: { slug: string; active: SettingsTab["key"] | null }) {
  return (
    <>
      <PageHeader title={es.settings.pageTitle} subtitle={es.settings.pageSubtitle} />
      <Tabs
        label={es.settings.title}
        active={active ?? ""}
        tabs={SETTINGS_TABS.map((tab) => ({
          key: tab.key,
          label: es.settings.tabs[tab.key],
          href: settingsTabHref(slug, tab),
        }))}
      />
    </>
  );
}
