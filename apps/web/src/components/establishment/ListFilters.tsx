import { NO_PLAN_FILTER, type EstablishmentFilters } from "@/core/establishments";
import { ESTABLISHMENT_STATES } from "@/core/naming";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

/**
 * §20.2 · los filtros del listado de restaurantes: buscador, grupo, plan y
 * estado.
 *
 * Es un `<form method="get">` de verdad, sin una línea de JavaScript. Tres
 * consecuencias, y las tres son el motivo:
 *
 *   · el filtro vive en la dirección, así que se comparte y el botón de
 *     volver lo deshace;
 *   · funciona antes de que hidrate nada y con el teclado solo (CA-22);
 *   · quien filtra lo hace al pulsar, no mientras escribe — un listado que
 *     se recarga solo en cada tecla mueve las filas debajo del cursor.
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
  const selectClass =
    "rounded-field border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition-colors focus:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green";

  return (
    <form
      method="get"
      action={action}
      role="search"
      aria-label={t.legend}
      className="flex flex-wrap items-end gap-3 rounded-[20px] border border-border bg-surface p-4"
    >
      <div className="min-w-[220px] flex-1">
        <label htmlFor="buscar-restaurante" className="sr-only">
          {t.searchLabel}
        </label>
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
          />
          <input
            id="buscar-restaurante"
            type="search"
            name="buscar"
            defaultValue={filters.search}
            placeholder={t.searchPlaceholder}
            className="w-full rounded-field border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text outline-none transition-colors focus:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="filtro-grupo" className="text-sm text-text-secondary">
          {t.groupLabel}
        </label>
        <select id="filtro-grupo" name="grupo" defaultValue={filters.groupId ?? ""} className={selectClass}>
          <option value="">{t.all}</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="filtro-plan" className="text-sm text-text-secondary">
          {t.planLabel}
        </label>
        <select id="filtro-plan" name="plan" defaultValue={filters.planId ?? ""} className={selectClass}>
          <option value="">{t.all}</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
          {/* RN-COM-11 · no tener plan es un caso real, no la casilla vacía. */}
          <option value={NO_PLAN_FILTER}>{t.withoutPlan}</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="filtro-estado" className="text-sm text-text-secondary">
          {t.statusLabel}
        </label>
        <select id="filtro-estado" name="estado" defaultValue={filters.status ?? ""} className={selectClass}>
          <option value="">{t.all}</option>
          {ESTABLISHMENT_STATES.map((state) => (
            <option key={state} value={state}>
              {es.naming.states.establishment[state]}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="rounded-field bg-primary px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
      >
        {t.submit}
      </button>

      {hasFilters ? (
        <a
          href={action}
          className="rounded-field px-2 py-2 text-sm font-medium text-cuotly-green hover:underline focus:outline focus:outline-2 focus:outline-cuotly-green"
        >
          {t.clear}
        </a>
      ) : null}
    </form>
  );
}
