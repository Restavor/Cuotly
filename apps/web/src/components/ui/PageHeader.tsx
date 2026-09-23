import type { ReactNode } from "react";

/**
 * La cabecera de página del diseño de escritorio, que es la misma en las
 * 157 vistas de `docs/diseno/Cuotly_definitivo_diseno.pdf`: el título
 * grande a la izquierda, una frase debajo que dice qué se hace aquí, y a
 * la derecha la acción principal de la pantalla ("+ Crear establecimiento",
 * "+ Nueva solicitud", "Invitar miembro").
 *
 * Existe para que las pantallas no la escriban cada una a su manera: hasta
 * el 22/09/2026 había tres tamaños de título distintos y la acción
 * principal unas veces iba debajo a ancho completo, otras al lado y otras
 * no iba. Con esto la fila es una sola cosa, y una pantalla que no la usa
 * se nota.
 *
 * Que la acción esté aquí no autoriza nada: el servidor comprueba cada
 * operación por su cuenta (CLAUDE.md, "ocultar un botón no es un control
 * de acceso"). Lo que sí hace la pantalla es no pintar el botón a quien
 * no puede usarlo, para no prometer lo que va a rechazar.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Lo que va a la derecha: uno o dos botones, o un selector de periodo. */
  actions?: ReactNode;
  /** Una línea más bajo el subtítulo, cuando hay algo contado que decir. */
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-primary-dark sm:text-[28px]">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-text-secondary">{subtitle}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
