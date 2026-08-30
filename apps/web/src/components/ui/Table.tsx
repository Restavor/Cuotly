import type { ReactNode } from "react";

/**
 * Piezas de tabla del sistema. Se componen a mano (`<Table><TableHead>…`)
 * en vez de recibir filas/columnas por props, para poder poner dentro de
 * cada celda lo que haga falta (badges, botones, enlaces) sin una API
 * genérica que acabe limitando.
 */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-border">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-soft-surface text-xs font-semibold uppercase tracking-wide text-text-secondary">
      <tr>{children}</tr>
    </thead>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function TableRow({ children }: { children: ReactNode }) {
  return <tr className="hover:bg-soft-surface/60">{children}</tr>;
}

export function TableHeaderCell({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}

export function TableCell({ children }: { children: ReactNode }) {
  return <td className="px-4 py-3 text-text">{children}</td>;
}
