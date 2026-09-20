"use client";

import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";
import { ABRIR_BUSQUEDA } from "@/components/shell/navigation";

/**
 * Página 1 del diseño definitivo móvil · el buscador ancho del Inicio.
 *
 * **No es un segundo buscador**: es un botón con forma de campo que abre el
 * mismo de la cabecera. Montar otro aquí daría dos cajas que buscan lo
 * mismo con dos comportamientos que tarde o temprano se separan.
 */
export function InicioBuscador() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(ABRIR_BUSQUEDA))}
      className="flex w-full items-center gap-3 rounded-[12px] border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
    >
      <Icon name="search" className="h-5 w-5 text-text-secondary" />
      <span className="text-sm text-text-secondary">
        {es.globalContext.home.searchPlaceholder}
      </span>
    </button>
  );
}
