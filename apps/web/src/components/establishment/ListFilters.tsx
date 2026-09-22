import { NO_PLAN_FILTER, type EstablishmentFilters } from "@/core/establishments";
import { ESTABLISHMENT_STATES } from "@/core/naming";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/ui/FilterBar";
import { es } from "@/i18n/es";

/**
 * §20.2 · los filtros del listado de restaurantes: buscador, grupo, estado
 * y plan, en el orden de la página 23 del diseño (M02).
 *
 * La pieza es `FilterBar`, que es un `<form method="get">` de verdad sin
 * una línea de JavaScript: el filtro vive en la dirección, funciona antes
 * de que hidrate nada y quien filtra lo hace al pulsar, no mientras
 * escribe.
 *
 * Las opciones son los grupos y planes que EXISTEN en el espacio, no un
 * catálogo escrito a mano: un desplegable con un plan que nadie tiene
 * contratado devolvería cero filas y parecería un error.
 */
export function ListFilters({
  groups,
  plans,
  filters,
  hasFilters,
  action,
}: {
  groups: readonly { readonly id: string; readonly name: string }[];
  plans: readonly { readonly id: string; readonly name: string }[];
  filters: EstablishmentFilters;
  hasFilters: boolean;
  action: string;
}) {
  const t = es.teamArea.establishments.filters;

  return (
    <FilterBar action={action} hasFilters={hasFilters} label={t.legend}>
      <FilterSearch
        id="buscar-restaurante"
        name="buscar"
        label={t.searchLabel}
        defaultValue={filters.search}
        placeholder={t.searchPlaceholder}
      />
      <FilterSelect
        id="filtro-grupo"
        name="grupo"
        label={t.groupLabel}
        defaultValue={filters.groupId}
        allLabel={t.all}
        options={groups.map((group) => ({ value: group.id, label: group.name }))}
      />
      <FilterSelect
        id="filtro-estado"
        name="estado"
        label={t.statusLabel}
        defaultValue={filters.status}
        allLabel={t.all}
        options={ESTABLISHMENT_STATES.map((state) => ({
          value: state,
          label: es.naming.states.establishment[state],
        }))}
      />
      <FilterSelect
        id="filtro-plan"
        name="plan"
        label={t.planLabel}
        defaultValue={filters.planId}
        allLabel={t.all}
        options={[
          ...plans.map((plan) => ({ value: plan.id, label: plan.name })),
          // RN-COM-11 · no tener plan es un caso real, no la casilla vacía.
          { value: NO_PLAN_FILTER, label: t.withoutPlan },
        ]}
      />
    </FilterBar>
  );
}
