import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "./Table";

/**
 * Diseño móvil · P3 (docs/diseno/PLAN-MOVIL.md): en el teléfono cada fila
 * de una tabla es una tarjeta con las etiquetas de su cabecera.
 *
 * Aquí no se mira cómo se ve —eso lo dice la hoja de estilos y se comprueba
 * con capturas—, sino lo que la hoja necesita recibir y lo que no se puede
 * perder por el camino: las etiquetas en su orden, las cabeceras que solo
 * son para el lector de pantalla fuera, y la semántica de tabla, que Safari
 * y Chrome quitan en cuanto una fila deja de ser `table-row`.
 */
afterEach(cleanup);

function Ejemplo({ stack }: { stack?: boolean }) {
  const columnas = ["Estado", "Recibida"];
  return (
    <Table stack={stack}>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Solicitud</TableHeaderCell>
          {columnas.map((c) => (
            <TableHeaderCell key={c}>{c}</TableHeaderCell>
          ))}
          <TableHeaderCell>
            <span className="sr-only">Ver</span>
          </TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow>
          <TableCell>Cambiar el horario</TableCell>
          <TableCell>Pendiente</TableCell>
          <TableCell>24 sept</TableCell>
          <TableCell>
            <a href="/x">Abrir</a>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

describe("P3 · la tabla en el teléfono", () => {
  it("lleva las etiquetas de su cabecera, en orden, sacadas en el servidor", () => {
    render(<Ejemplo />);
    const tabla = screen.getByRole("table");
    expect(tabla).toHaveAttribute("data-apilada");
    expect(tabla.style.getPropertyValue("--tabla-c1")).toBe('"Solicitud"');
    expect(tabla.style.getPropertyValue("--tabla-c2")).toBe('"Estado"');
    expect(tabla.style.getPropertyValue("--tabla-c3")).toBe('"Recibida"');
  });

  it("una cabecera que solo es para el lector de pantalla no es etiqueta", () => {
    render(<Ejemplo />);
    expect(screen.getByRole("table").style.getPropertyValue("--tabla-c4")).toBe("");
  });

  it("conserva la semántica de tabla aunque las filas se apilen", () => {
    render(<Ejemplo />);
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
    expect(screen.getAllByRole("cell")).toHaveLength(4);
  });

  it("stack={false} la deja como tabla también en el teléfono", () => {
    render(<Ejemplo stack={false} />);
    const tabla = screen.getByRole("table");
    expect(tabla).not.toHaveAttribute("data-apilada");
    expect(tabla.style.getPropertyValue("--tabla-c1")).toBe("");
  });
});
