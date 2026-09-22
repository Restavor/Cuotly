import { PageHeader, Tabs } from "@/components/ui";
import { es } from "@/i18n/es";

const t = es.panelSettings;

export type SettingsTab = "datos" | "notificaciones" | "ayuda" | "fuentes";

/**
 * R38, R39, R40 y R44 · la cabecera común de "Ajustes y ayuda". Las cuatro
 * pestañas son cuatro pantallas que ya existían por separado —los datos,
 * la ayuda (§133) y las fuentes (RN-INT-05)—, y esta barra las junta como
 * en el dibujo sin mezclar su código.
 */
export function SettingsTabs({ base, active, subtitle }: { base: string; active: SettingsTab; subtitle?: string }) {
  return (
    <div className="space-y-4">
      <PageHeader title={t.title} subtitle={subtitle ?? t.subtitle} />
      <Tabs
        label={t.tabsLabel}
        active={active}
        tabs={[
          { key: "datos", label: t.tabs.datos, href: `${base}/ajustes` },
          { key: "notificaciones", label: t.tabs.notificaciones, href: `${base}/ajustes?tab=notificaciones` },
          { key: "ayuda", label: t.tabs.ayuda, href: `${base}/ayuda` },
          { key: "fuentes", label: t.tabs.fuentes, href: `${base}/fuentes` },
        ]}
      />
    </div>
  );
}
