import type { ReactNode } from "react";

type Props = {
  title?: string;
  /**
   * Lo que va a la derecha del título: normalmente el enlace "Ver todas"
   * que lleva a la pantalla completa de eso mismo. Sin título no se pinta
   * —no habría fila de cabecera donde ponerlo—.
   */
  action?: ReactNode;
  /**
   * La línea bajo el título. El diseño la usa para contar lo que hay
   * dentro —"Tienes 3 tareas pendientes en tus contextos."— y por eso va
   * en el componente y no suelta en cada pantalla.
   */
  subtitle?: string;
  /**
   * `danger` es la tarjeta de aviso del diseño: fondo y borde rojos
   * suaves, con un icono al lado del título. No es decoración: es la única
   * tarjeta de una pantalla que pide algo, y en el diseño se distingue
   * para que se vea antes que el resto.
   */
  tone?: "danger";
  children: ReactNode;
  className?: string;
};

/** Contenedor con el borde, el fondo y el radio del sistema. Nada más. */
export function Card({
  title,
  action,
  subtitle,
  tone,
  children,
  className = "",
}: Props) {
  const fondo =
    tone === "danger" ? "border-danger/30 bg-danger/5" : "border-border bg-surface";

  return (
    <div className={`rounded-card border p-5 shadow-sm sm:p-6 ${fondo} ${className}`}>
      {/*
        La cabecera **conserva su forma** cuando no se pide ni icono ni
        subtítulo: el título es hijo directo de esta fila, como siempre.
        Envolverlo en dos divs "por si acaso" rompió tres bloques de la
        ficha del restaurante, porque sus pruebas suben del título a la
        tarjeta contando padres. Lo nuevo solo aparece si alguien lo pide.
      */}
      {title ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          {tone === undefined && subtitle === undefined ? (
            <h3 className="text-base font-semibold text-primary-dark">{title}</h3>
          ) : (
            <div className="flex min-w-0 items-start gap-2.5">
              {tone === "danger" ? (
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger text-sm font-bold text-surface"
                >
                  !
                </span>
              ) : null}
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-primary-dark">{title}</h3>
                {subtitle ? (
                  <p className="mt-0.5 text-sm text-text-secondary">{subtitle}</p>
                ) : null}
              </div>
            </div>
          )}
          {action}
        </div>
      ) : null}
      {children}
    </div>
  );
}
