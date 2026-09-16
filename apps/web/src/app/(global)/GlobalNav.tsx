"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * RN-GLO-01 · la barra lateral del contexto global, la de G01 a G08.
 *
 * Es cliente solo por una razón: marcar en qué pantalla estás necesita
 * saber la ruta actual. Nada de lo que decide sale de aquí — los enlaces y
 * el contador llegan calculados desde el servidor.
 */
export interface GlobalNavItem {
  readonly href: string;
  readonly label: string;
  /** El número que va a la derecha, cuando lo hay. Nunca un cero pintado. */
  readonly badge?: number;
}

export function GlobalNav({ items }: { items: readonly GlobalNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Cuotly" className="flex flex-col gap-1">
      {items.map((item) => {
        // "Inicio" es `/`, y `startsWith("/")` es cierto para todo: sin el
        // caso aparte, la barra marcaría Inicio en las cinco pantallas.
        const activo =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={activo ? "page" : undefined}
            className={`flex items-center justify-between rounded-[10px] px-3 py-2 text-sm font-semibold transition-colors ${
              activo
                ? "bg-primary text-surface"
                : "text-text hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
            }`}
          >
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge > 0 ? (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${
                  activo ? "bg-surface text-primary" : "bg-primary text-surface"
                }`}
              >
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
