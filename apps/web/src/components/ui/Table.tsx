import type { ReactNode } from "react";

/**
 * Piezas de tabla del sistema. Se componen a mano (`<Table><TableHead>…`)
 * en vez de recibir filas/columnas por props, para poder poner dentro de
 * cada celda lo que haga falta (badges, botones, enlaces) sin una API
 * genérica que acabe limitando.
 *
 * El aspecto es el de las tablas de la maqueta de escritorio: cabecera
 * sobre superficie suave en gris y sin mayúsculas, filas separadas por una
 * línea fina, y un pie opcional con "Mostrando X de Y" (`TableFooter`).
 */
export function Table({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-border">
      {/* `relative`: los textos `sr-only` de las celdas van posicionados y,
          sin esto, se escapan del desplazamiento y ensanchan la página. */}
      <div className="relative overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">{children}</table>
      </div>
      {footer}
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
    <thead className="bg-soft-surface/70 text-xs font-medium text-text-secondary">
      {children}
    </thead>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border bg-surface">{children}</tbody>;
}

/** `highlight` es la fila que espera algo de quien mira, en verde muy suave (G04). */
export function TableRow({ children, highlight = false }: { children: ReactNode; highlight?: boolean }) {
  return (
    <tr className={`transition-colors ${highlight ? "bg-cuotly-green/5" : "hover:bg-soft-surface/50"}`}>{children}</tr>
  );
}

export function TableHeaderCell({ children }: { children: ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3 font-medium">{children}</th>;
}

export function TableCell({ children }: { children: ReactNode }) {
  return <td className="px-4 py-3 align-middle text-text">{children}</td>;
}

/** El pie de la maqueta: "Mostrando 4 de 4 trabajos", en gris. */
export function TableFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 text-sm text-text-secondary">
      {children}
    </div>
  );
}
