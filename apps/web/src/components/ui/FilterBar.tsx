import type { ReactNode } from "react";

import { Icon } from "./Icon";
import { es } from "@/i18n/es";

/**
 * La barra de filtros del diseño (M02, M08, M09, M11): un buscador a la
 * izquierda, desplegables con su rótulo encima, y "Limpiar filtros" en
 * verde a la derecha.
 *
 * Es un `<form method="get">` de verdad, sin JavaScript. Tres
 * consecuencias, y las tres son el motivo:
 *
 *   · el filtro vive en la dirección, así que se comparte y el botón de
 *     volver lo deshace;
 *   · funciona antes de que hidrate nada y con el teclado solo (CA-22);
 *   · quien filtra lo hace al pulsar, no mientras escribe — un listado que
 *     se recarga solo en cada tecla mueve las filas debajo del cursor.
 *
 * Por eso lleva un botón "Filtrar" que el dibujo no tiene: un formulario
 * sin JavaScript necesita algo que enviarlo. Es discreto y va donde el
 * diseño pone el hueco.
 *
 * **Los filtros recortan, no controlan.** Se aplican en el servidor sobre
 * las filas que RLS ya dejó pasar: un valor ajeno en la dirección no
 * enseña nada nuevo (CLAUDE.md).
 */
export function FilterBar({
  action,
  hasFilters,
  label,
  children,
  /** Parámetros que el formulario conserva aunque no sean filtros suyos. */
  hidden,
}: {
  action: string;
  hasFilters: boolean;
  label?: string;
  children: ReactNode;
  hidden?: Readonly<Record<string, string | undefined>>;
}) {
  return (
    <form
      method="get"
      action={action}
      role="search"
      aria-label={label ?? es.ui.filters.label}
      className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-card border border-border bg-surface p-4 shadow-sm"
    >
      {hidden
        ? Object.entries(hidden).map(([nombre, valor]) =>
            valor === undefined ? null : (
              <input key={nombre} type="hidden" name={nombre} value={valor} />
            ),
          )
        : null}
      {children}
      <div className="ml-auto flex items-center gap-3 self-end">
        <button
          type="submit"
          className="rounded-field border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-text transition-colors hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
        >
          {es.ui.filters.apply}
        </button>
        {hasFilters ? (
          <a
            href={action}
            className="text-sm font-semibold text-cuotly-green hover:underline focus:outline focus:outline-2 focus:outline-cuotly-green"
          >
            {es.ui.filters.clear}
          </a>
        ) : null}
      </div>
    </form>
  );
}

/** El buscador de la izquierda, con la lupa dentro. */
export function FilterSearch({
  id,
  name,
  defaultValue,
  placeholder,
  label,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  placeholder: string;
  label?: string;
}) {
  return (
    <div className="min-w-[200px] flex-1 sm:max-w-xs">
      <label htmlFor={id} className="sr-only">
        {label ?? es.ui.filters.search}
      </label>
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
        />
        <input
          id={id}
          type="search"
          name={name}
          defaultValue={defaultValue ?? ""}
          placeholder={placeholder}
          className="w-full rounded-field border border-border bg-soft-surface/50 py-2 pl-9 pr-3 text-sm text-text outline-none transition-colors focus:border-cuotly-green focus:bg-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
        />
      </div>
    </div>
  );
}

/**
 * Un desplegable con el rótulo encima, como los dibuja la maqueta. La
 * primera opción es siempre "Todos"/"Todas", que es el filtro quitado.
 */
export function FilterSelect({
  id,
  name,
  label,
  defaultValue,
  allLabel,
  options,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string | null;
  allLabel?: string;
  options: readonly { readonly value: string; readonly label: string }[];
}) {
  return (
    <div className="min-w-[150px]">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-text-secondary">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded-field border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition-colors focus:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
      >
        <option value="">{allLabel ?? es.ui.filters.all}</option>
        {options.map((opcion) => (
          <option key={opcion.value} value={opcion.value}>
            {opcion.label}
          </option>
        ))}
      </select>
    </div>
  );
}
