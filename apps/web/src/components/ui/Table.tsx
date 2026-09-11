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

/**
 * **`TableHead` NO pone la fila.** La pone `TableRow`, igual que en el
 * cuerpo, y por eso todas las tablas se escriben
 * `<TableHead><TableRow><TableHeaderCell>`.
 *
 * Antes ponía un `<tr>` por su cuenta y casi todas las llamadas envolvían
 * además en `<TableRow>`: el resultado era un `<tr>` dentro de otro `<tr>`
 * en veintiséis tablas. El navegador no se queja en voz alta, pero es
 * marcado inválido —React sí avisa, "In HTML, <tr> cannot be a child of
 * <tr>"— y rompe la semántica de la tabla para un lector de pantalla, que
 * es justo a quien la cabecera le sirve para nombrar cada celda.
 */
export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-soft-surface text-xs font-semibold uppercase tracking-wide text-text-secondary">
      {children}
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
