import Link from "next/link";
import type { ReactNode } from "react";

import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "outline";

/*
 * Las mismas tres pintas que `Button`, para un enlace. `outline` es el
 * botón de contorno verde con texto verde que la maqueta pone en las filas
 * ("Ver ficha", "Ver solicitud", "Confirmar pago"): distinto del primario
 * lleno, que es la acción de la pantalla, y del secundario gris, que es
 * lo que se puede hacer pero no es el camino principal.
 */
const VARIANTES: Record<Variant, string> = {
  primary: "bg-primary text-surface hover:bg-primary-dark",
  secondary: "border border-border bg-surface text-text hover:bg-soft-surface",
  outline: "border border-cuotly-green bg-surface text-cuotly-green hover:bg-cuotly-green/10",
};

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  icon,
  trailingIcon,
  children,
  className = "",
}: {
  href: string;
  variant?: Variant;
  size?: "sm" | "md";
  icon?: IconName;
  trailingIcon?: IconName;
  children: ReactNode;
  className?: string;
}) {
  const tamano = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm";
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-field font-semibold transition-colors focus:outline focus:outline-2 focus:outline-cuotly-green ${tamano} ${VARIANTES[variant]} ${className}`}
    >
      {icon ? <Icon name={icon} className="h-4 w-4" /> : null}
      {children}
      {trailingIcon ? <Icon name={trailingIcon} className="h-4 w-4" /> : null}
    </Link>
  );
}
