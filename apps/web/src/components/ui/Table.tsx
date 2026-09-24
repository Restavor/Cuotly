import { Children, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from "react";

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
export function Table({
  children,
  footer,
  stack = true,
}: {
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Diseño móvil (P3 de `docs/diseno/PLAN-MOVIL.md`) · por debajo de
   * `sm` cada fila se pinta como una **tarjeta**: la primera celda arriba,
   * como título, y las demás en parejas etiqueta–valor, con la etiqueta
   * de su columna. Es lo que dibuja el PDF móvil en todas sus listas, en
   * vez de una tabla que se desplaza de lado dentro de su caja.
   *
   * `false` la deja como tabla también en el teléfono: para una rejilla
   * que solo se entiende entera (un calendario, una matriz de días).
   */
  stack?: boolean;
}) {
  /*
    Las etiquetas salen de la cabecera **en el servidor**, recorriendo los
    elementos: `<TableHead><TableRow><TableHeaderCell>` sigue siendo la
    forma de escribir una tabla y ninguna pantalla tiene que repetirlas.
    Viajan como variables CSS (`--tabla-c2`…) que las celdas pintan con
    `::before` (ver `styles/tokens.css`), así que no hace falta JavaScript
    en el navegador y no hay salto al hidratar.
  */
  const etiquetas = stack ? headerLabels(children) : [];
  const variables: Record<string, string> = {};
  etiquetas.forEach((texto, indice) => {
    if (texto !== "") variables[`--tabla-c${indice + 1}`] = JSON.stringify(texto);
  });

  return (
    <div className="overflow-hidden rounded-[12px] border border-border">
      {/* `relative`: los textos `sr-only` de las celdas van posicionados y,
          sin esto, se escapan del desplazamiento y ensanchan la página. */}
      <div className="relative overflow-x-auto">
        {/*
          Los `role` son explícitos porque en móvil las filas dejan de ser
          `display: table-row`, y Safari y Chrome quitan entonces la
          semántica de tabla: un lector de pantalla dejaría de anunciar
          filas y columnas justo donde más falta hace.
        */}
        <table
          role="table"
          data-apilada={stack ? "" : undefined}
          style={variables as CSSProperties}
          className="w-full border-collapse text-left text-sm"
        >
          {children}
        </table>
      </div>
      {footer}
    </div>
  );
}

/**
 * El texto **visible** de un nodo de React, bajando por sus hijos. Lo que va
 * en `sr-only` no cuenta: una cabecera que solo existe para el lector de
 * pantalla ("Ver" sobre una columna de botones) no se ve en escritorio y
 * tampoco debe salir como etiqueta encima del botón en el teléfono.
 */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) {
    const props = (node as ReactElement<{ children?: ReactNode; className?: string }>).props;
    if (typeof props.className === "string" && props.className.split(/\s+/).includes("sr-only")) {
      return "";
    }
    return textOf(props.children);
  }
  return "";
}

/**
 * Los textos de las `TableHeaderCell` de la primera fila de `TableHead`,
 * en orden. Si la cabecera no está escrita con estas piezas (otra
 * componente la pinta por dentro), devuelve una lista vacía: la tabla se
 * apila igual, sin etiquetas, en vez de fallar.
 */
function headerLabels(children: ReactNode): string[] {
  const head = Children.toArray(children).find(
    (hijo): hijo is ReactElement<{ children?: ReactNode }> =>
      isValidElement(hijo) && hijo.type === TableHead,
  );
  if (head === undefined) return [];
  const fila = Children.toArray(head.props.children).find(
    (hijo): hijo is ReactElement<{ children?: ReactNode }> =>
      isValidElement(hijo) && hijo.type === TableRow,
  );
  if (fila === undefined) return [];
  return Children.toArray(fila.props.children)
    .filter(
      (hijo): hijo is ReactElement<{ children?: ReactNode }> =>
        isValidElement(hijo) && hijo.type === TableHeaderCell,
    )
    .map((celda) => textOf(celda.props.children).replace(/\s+/g, " ").trim());
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
    <thead role="rowgroup" className="bg-soft-surface/70 text-xs font-medium text-text-secondary">
      {children}
    </thead>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return (
    <tbody role="rowgroup" className="divide-y divide-border bg-surface">
      {children}
    </tbody>
  );
}

/** `highlight` es la fila que espera algo de quien mira, en verde muy suave (G04). */
export function TableRow({ children, highlight = false }: { children: ReactNode; highlight?: boolean }) {
  return (
    <tr role="row" className={`transition-colors ${highlight ? "bg-cuotly-green/5" : "hover:bg-soft-surface/50"}`}>{children}</tr>
  );
}

export function TableHeaderCell({ children }: { children: ReactNode }) {
  return (
    <th role="columnheader" className="whitespace-nowrap px-4 py-3 font-medium">
      {children}
    </th>
  );
}

export function TableCell({ children }: { children: ReactNode }) {
  return (
    <td role="cell" className="px-4 py-3 align-middle text-text">
      {children}
    </td>
  );
}

/** El pie de la maqueta: "Mostrando 4 de 4 trabajos", en gris. */
export function TableFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 text-sm text-text-secondary">
      {children}
    </div>
  );
}
