import { Icon, type IconName } from "@/components/ui/Icon";
import type { IntegrationProvider } from "@/core/integrations";
import { es } from "@/i18n/es";

/**
 * La marca de cada fuente en las pantallas de integraciones (vistas 17,
 * 22 y las seis "sin datos"): un círculo con un icono del juego del
 * sistema.
 *
 * El diseño pinta el logotipo de cada producto. No se traen: son marcas
 * ajenas con sus propias normas de uso, y un logotipo a color al lado de
 * iconos de trazo fino desafina igual que un emoji (`States.tsx`). Lo que
 * identifica a la fuente es su nombre, que va siempre al lado; el icono
 * dice de qué trata —visitas, búsqueda, la ficha, el comportamiento, la
 * velocidad— y hereda la paleta por `currentColor`.
 */
const MARK: Readonly<Record<IntegrationProvider, IconName>> = {
  ga4: "reports",
  search_console: "search",
  business_profile: "building",
  clarity: "person",
  pagespeed: "clock",
};

export function ProviderMark({ provider, size = "md" }: { provider: IntegrationProvider; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const icon = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <span
      aria-hidden="true"
      className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-soft-surface text-primary`}
    >
      <Icon name={MARK[provider]} className={icon} />
    </span>
  );
}

export function providerName(provider: IntegrationProvider): string {
  return es.integrations.providers[provider].name;
}
