import type { ReactNode } from "react";

type Props = {
  title?: string;
  children: ReactNode;
  className?: string;
};

/** Contenedor con el borde, el fondo y el radio del sistema. Nada más. */
export function Card({ title, children, className = "" }: Props) {
  return (
    <div
      className={`rounded-[20px] border border-border bg-surface p-6 ${className}`}
    >
      {title ? (
        <h3 className="mb-3 text-base font-semibold text-primary-dark">{title}</h3>
      ) : null}
      {children}
    </div>
  );
}
