import Link from "next/link";
import { redirect } from "next/navigation";

import { ButtonLink, EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { contextsTab, type ContextSide } from "@/core/global-home";
import { SIDE_PARAM } from "@/core/global-inbox";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { PanelCards, SpaceCards } from "../ContextCards";
import { loadGlobalContexts } from "../global-load";

/**
 * RN-GLO-03 · "Restaurantes" del contexto global: en la barra de móvil y,
 * desde el 25/09/2026, también en el menú lateral de escritorio, donde
 * ocupa el hueco que tenía "Mis solicitudes".
 *
 * El botón de la barra llevaba a un ancla del Inicio (`/#mis-paneles`)
 * que en el teléfono no hacía nada: ya estabas en el Inicio y el bloque
 * no tenía caja propia a la que desplazarse. Esta pantalla es su destino:
 * los mismos contextos que el Inicio, separados en dos pestañas —
 * **Mantenimiento**, los espacios de mantenimiento, y **Restaurantes**,
 * los paneles de restaurante—, con las mismas tarjetas.
 *
 * Todo sale de `my_contexts()`, con las mismas políticas que el Inicio
 * (RN-GLO-01): aquí no se decide qué ve nadie. La pestaña va en la
 * dirección (`?lado=`, los mismos valores que la bandeja de Mensajes).
 */
export const dynamic = "force-dynamic";

export default async function GlobalContextsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = es.globalContext.contexts;
  const contextos = await loadGlobalContexts(supabase);

  if (contextos.failed) {
    return (
      <div className="space-y-4">
        <PageHeader title={t.title} subtitle={t.subtitle} />
        <ErrorState
          title={es.globalContext.home.contextsFailed}
          description={es.globalContext.home.contextsFailedReason}
        />
      </div>
    );
  }

  const { lado } = await searchParams;
  const cuantos = {
    spaces: contextos.spaces.length,
    restaurants: contextos.restaurants.length,
  };
  const side = contextsTab(typeof lado === "string" ? lado : null, cuantos);

  const pestana = (lado: ContextSide, etiqueta: string, icono: IconName, n: number) => {
    const activa = lado === side;
    return (
      <Link
        href={`/restaurantes?lado=${SIDE_PARAM[lado]}`}
        aria-current={activa ? "page" : undefined}
        className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors focus:outline focus:outline-2 focus:outline-cuotly-green sm:flex-none sm:px-5 ${
          activa
            ? "border-cuotly-green bg-cuotly-green/5 font-semibold text-primary-dark"
            : "border-transparent font-medium text-text-secondary hover:text-text"
        }`}
      >
        <Icon name={icono} className="h-5 w-5" />
        {etiqueta}
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
            activa ? "bg-primary-dark text-surface" : "bg-soft-surface text-text"
          }`}
        >
          <span className="sr-only">{t.count(n)}</span>
          <span aria-hidden="true">{n}</span>
        </span>
      </Link>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t.title} subtitle={t.subtitle} />

      <div className="overflow-hidden rounded-card border border-border bg-surface shadow-sm">
        <nav aria-label={t.tabsLabel} className="flex border-b border-border">
          {pestana("maintenance", t.tabMaintenance, "building", cuantos.spaces)}
          {pestana("restaurant", t.tabRestaurants, "dailyMenu", cuantos.restaurants)}
        </nav>

        <div className="p-4 sm:p-5">
          {side === "maintenance" ? (
            contextos.spaces.length > 0 ? (
              <SpaceCards spaces={contextos.spaces} restaurantCount={contextos.restaurantCount} />
            ) : (
              <EmptyState
                icon="building"
                title={t.maintenanceEmptyTitle}
                description={t.maintenanceEmptyReason}
                action={
                  <ButtonLink href="/solicitar-espacio" variant="secondary">
                    {es.globalContext.home.requestSpace}
                  </ButtonLink>
                }
              />
            )
          ) : contextos.restaurants.length > 0 ? (
            <PanelCards restaurants={contextos.restaurants} />
          ) : (
            <EmptyState
              icon="dailyMenu"
              title={t.restaurantsEmptyTitle}
              description={t.restaurantsEmptyReason}
            />
          )}
        </div>
      </div>
    </div>
  );
}
