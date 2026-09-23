"use client";

import type { ReactNode } from "react";

/**
 * La barra de filtros de la bandeja es un formulario GET normal: la
 * dirección es el estado, y funciona sin JavaScript con Intro en el
 * buscador o con el botón de `<noscript>`. Con JavaScript, cambiar el
 * espacio o el interruptor de "Sin leer" lo envía solo, como el dibujo.
 */
export function InboxFilters({ children, submitLabel }: { children: ReactNode; submitLabel: string }) {
  return (
    <form
      method="get"
      action="/mensajes"
      role="search"
      onChange={(e) => {
        const campo = e.target as unknown as HTMLInputElement | HTMLSelectElement;
        if (campo.tagName === "SELECT" || (campo as HTMLInputElement).type === "checkbox") {
          e.currentTarget.requestSubmit();
        }
      }}
      className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3"
    >
      {children}
      <noscript>
        <button type="submit" className="rounded-field border border-border px-3 py-1.5 text-sm font-semibold">
          {submitLabel}
        </button>
      </noscript>
    </form>
  );
}
