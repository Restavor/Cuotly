"use client";

import type { ReactNode } from "react";

/**
 * Un formulario GET que se envía solo al cambiar un desplegable, como los
 * filtros del dibujo. La dirección es el estado, así que sin JavaScript
 * sigue funcionando con el botón de `<noscript>`.
 */
export function AutoSubmitForm({
  action,
  submitLabel,
  className,
  children,
}: {
  action: string;
  submitLabel: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      method="get"
      action={action}
      onChange={(e) => {
        if ((e.target as unknown as HTMLElement).tagName === "SELECT") e.currentTarget.requestSubmit();
      }}
      className={className}
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
