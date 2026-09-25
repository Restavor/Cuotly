import { ButtonLink } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";
import type { ContextRow } from "@/services/global-gateway";

const t = es.globalContext.home;

/**
 * G01 · las tarjetas de "Mis espacios de mantenimiento": icono, nombre,
 * rol, cuántos restaurantes y el botón de entrar a ancho completo.
 *
 * Las pintan el Inicio global y "Restaurantes" (`/restaurantes`, pestaña
 * Mantenimiento). Viven aquí para que sean LAS MISMAS tarjetas: dos copias
 * acaban diciendo cosas distintas del mismo espacio.
 */
export function SpaceCards({
  spaces,
  restaurantCount,
}: {
  spaces: readonly ContextRow[];
  restaurantCount: ReadonlyMap<string, number>;
}) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {spaces.map((espacio) => {
        const cuantos = restaurantCount.get(espacio.space_id);
        return (
          <li
            key={espacio.space_id}
            className="flex min-w-0 flex-col rounded-[14px] border border-border bg-surface p-3.5"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cuotly-green/10 text-cuotly-green">
                <Icon name="building" className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-text">{espacio.space_name}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-text-secondary">
                  <Icon name="person" className="h-3.5 w-3.5" />
                  {espacio.role ? es.roles[espacio.role as keyof typeof es.roles] : null}
                </p>
                {/* Un espacio que no se ha podido contar NO sale con un
                    cero: se dice que no se contó. */}
                <p className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <Icon name="building" className="h-3.5 w-3.5" />
                  {cuantos === undefined ? t.spaceRestaurantsUnknown : t.spaceRestaurants(cuantos)}
                </p>
              </div>
            </div>
            <ButtonLink
              href={`/espacios/${espacio.space_slug ?? ""}`}
              trailingIcon="chevronRight"
              className="mt-3 w-full"
            >
              {t.enterSpace}
            </ButtonLink>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * G01 · las tarjetas de "Mis paneles de restaurante": el local, el rol,
 * de qué espacio de mantenimiento depende y el botón de entrar al panel.
 */
export function PanelCards({ restaurants }: { restaurants: readonly ContextRow[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {restaurants.map((restaurante) => (
        <li
          key={restaurante.establishment_id}
          className="flex min-w-0 flex-col rounded-[14px] border border-border bg-surface p-3.5"
        >
          <div className="flex items-start gap-3">
            {/*
              El diseño enseña aquí una foto del local. Esta lista no la
              trae todavía, así que va el icono: una foto de archivo sería
              un dato de adorno que no es del restaurante (CLAUDE.md MUST
              NOT).
            */}
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-soft-surface text-primary-dark">
              <Icon name="building" className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-text">{restaurante.establishment_name}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-text-secondary">
                <Icon name="person" className="h-3.5 w-3.5" />
                {restaurante.role ? es.roles[restaurante.role as keyof typeof es.roles] : null}
              </p>
              <p className="truncate text-xs text-text-secondary">
                {t.panelMaintenance(restaurante.space_name)}
              </p>
            </div>
          </div>
          <ButtonLink
            href={`/espacios/${restaurante.space_slug ?? ""}/restaurantes/${restaurante.establishment_id}`}
            variant="outline"
            trailingIcon="chevronRight"
            className="mt-3 w-full"
          >
            {t.enterPanel}
          </ButtonLink>
        </li>
      ))}
    </ul>
  );
}
