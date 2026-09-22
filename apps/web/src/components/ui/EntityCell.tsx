import type { ReactNode } from "react";

/**
 * La primera celda de las tablas del diseño: foto o icono a la izquierda,
 * el nombre en negrita y debajo la ciudad, el código o lo que identifique
 * la fila (M02, M08, M09, M12, M18).
 */
export function EntityCell({
  media,
  title,
  subtitle,
}: {
  media?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      {media}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-text">{title}</span>
        {subtitle === undefined || subtitle === null ? null : (
          <span className="block truncate text-xs text-text-secondary">{subtitle}</span>
        )}
      </span>
    </span>
  );
}
