import { Tabs } from "@/components/ui/Tabs";
import { es } from "@/i18n/es";

/**
 * M82 y M84 · las tres pestañas de Restaurantes: Establecimientos, Grupos y
 * Archivados.
 *
 * Son tres direcciones y no un estado del navegador —`/restaurantes`,
 * `/restaurantes/grupos` y `/restaurantes/archivados`—: se comparten, el
 * botón de volver las deshace y funcionan sin JavaScript (CA-22).
 *
 * Archivados lleva su número porque es la pestaña que no se mira a diario:
 * sin él, un restaurante archivado por error no se echa de menos.
 */
export type RestaurantsTabKey = "list" | "groups" | "archived";

export function restaurantsTabHref(slug: string, key: RestaurantsTabKey): string {
  const base = `/espacios/${slug}/restaurantes`;
  if (key === "groups") return `${base}/grupos`;
  if (key === "archived") return `${base}/archivados`;
  return base;
}

export function RestaurantsTabs({
  slug,
  active,
  archivedCount,
}: {
  slug: string;
  active: RestaurantsTabKey;
  /** `null` cuando no se contó: entonces no se pinta el número (CA-20). */
  archivedCount: number | null;
}) {
  const t = es.teamArea.establishments.tabs;
  return (
    <Tabs
      label={t.label}
      active={active}
      tabs={[
        { key: "list", label: t.list, href: restaurantsTabHref(slug, "list") },
        { key: "groups", label: t.groups, href: restaurantsTabHref(slug, "groups") },
        {
          key: "archived",
          label: t.archived,
          href: restaurantsTabHref(slug, "archived"),
          ...(archivedCount === null || archivedCount === 0 ? {} : { count: archivedCount }),
        },
      ]}
    />
  );
}
