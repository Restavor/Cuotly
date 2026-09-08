import type { ReactNode } from "react";

type Props = {
  title?: string;
  /**
   * Lo que va a la derecha del título: normalmente el enlace "Ver todas"
   * que lleva a la pantalla completa de eso mismo. Sin título no se pinta
   * —no habría fila de cabecera donde ponerlo—.
   */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Contenedor con el borde, el fondo y el radio del sistema. Nada más. */
export function Card({ title, action, children, className = "" }: Props) {
  return (
    <div
      className={`rounded-[20px] border border-border bg-surface p-6 ${className}`}
    >
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-primary-dark">{title}</h3>
          {action}
        </div>
      ) : null}
      {children}
    </div>
  );
}
