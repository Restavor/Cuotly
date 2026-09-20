import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import { ActivityChart } from "./ActivityChart";

/**
 * Página 22 del diseño definitivo móvil · la gráfica "Actividad de
 * mantenimiento", pintada.
 *
 * Lo que vigila, que es justo lo que una gráfica puede mentir sin que se
 * note:
 *
 *   · Que un **fallo de lectura** no se dibuje como una línea plana. Una
 *     línea en cero afirma "no pasó nada ese mes", y cuando la consulta ha
 *     fallado eso es una afirmación que nadie puede hacer (CA-20,
 *     CLAUDE.md MUST NOT).
 *   · Que los números **exactos** estén siempre en el árbol, no solo
 *     dibujados: quien no distinga los dos colores, quien use lector de
 *     pantalla y quien quiera la cifra leen la misma tabla (PRD §21.4).
 *   · Que el eje vertical **empiece en cero**. Es el fallo clásico de una
 *     gráfica de conteos y aquí se comprueba sobre lo dibujado, no sobre
 *     la función que lo calcula.
 *   · Que las etiquetas del eje horizontal **no se salgan del dibujo**.
 */
const t = es.spaceHome.activityChart;

const mes = [
  { day: "2026-09-01", requests: 3, jobs: 1 },
  { day: "2026-09-02", requests: 0, jobs: 0 },
  { day: "2026-09-03", requests: 7, jobs: 4 },
  { day: "2026-09-04", requests: 2, jobs: 6 },
];

afterEach(cleanup);

describe("página 22 · Actividad de mantenimiento", () => {
  it("si la consulta falló dice el motivo y NO dibuja nada (CA-20)", () => {
    const { container } = render(<ActivityChart days={[]} failed />);

    expect(screen.getByText(t.failed)).toBeInTheDocument();
    // Ni una línea: una gráfica vacía se leería como "no pasó nada".
    expect(container.querySelector("svg")).toBeNull();
  });

  it("un mes sin actividad dice que no ha pasado nada, que NO es lo mismo que un fallo", () => {
    render(<ActivityChart days={[]} failed={false} />);

    expect(screen.getByText(t.empty)).toBeInTheDocument();
    expect(screen.queryByText(t.failed)).not.toBeInTheDocument();
  });

  it("los números exactos están en la tabla, no solo en el dibujo (§21.4)", () => {
    render(<ActivityChart days={mes} failed={false} />);

    const tabla = screen.getByRole("table");
    const filas = within(tabla).getAllByRole("row");
    // Una de cabecera más un día por cada día del mes cargado.
    expect(filas).toHaveLength(mes.length + 1);

    const tercerDia = within(filas[3]).getAllByRole("cell").map((c) => c.textContent);
    expect(tercerDia).toEqual(["3", "7", "4"]);
  });

  it("la gráfica apunta a la tabla como su descripción", () => {
    render(<ActivityChart days={mes} failed={false} />);

    const grafica = screen.getByRole("img", { name: t.title });
    const idTabla = grafica.getAttribute("aria-describedby");
    expect(idTabla).toBeTruthy();
    expect(document.getElementById(idTabla!)).toContainElement(screen.getByRole("table"));
  });

  it("el eje vertical empieza en cero", () => {
    const { container } = render(<ActivityChart days={mes} failed={false} />);

    const marcas = [...container.querySelectorAll("svg text")]
      .map((n) => n.textContent ?? "")
      .filter((texto) => /^\d+$/.test(texto))
      .map(Number);

    expect(marcas).toContain(0);
    // Y el techo cubre el valor más alto del mes (7 solicitudes).
    expect(Math.max(...marcas)).toBeGreaterThanOrEqual(7);
  });

  it("las etiquetas del eje horizontal caben dentro del dibujo", () => {
    const { container } = render(<ActivityChart days={mes} failed={false} />);

    const svg = container.querySelector("svg")!;
    const ancho = Number(svg.getAttribute("viewBox")!.split(" ")[3 - 1]);

    const etiquetas = [...svg.querySelectorAll("text")].filter((n) =>
      /^\d+ [a-z]{3}$/.test(n.textContent ?? ""),
    );
    expect(etiquetas.length).toBeGreaterThan(1);

    // La primera se ancla por su borde izquierdo y la última por el
    // derecho: centradas, la última empezaba justo donde acaba el dibujo.
    expect(etiquetas[0].getAttribute("text-anchor")).toBe("start");
    expect(etiquetas[etiquetas.length - 1].getAttribute("text-anchor")).toBe("end");
    for (const etiqueta of etiquetas) {
      expect(Number(etiqueta.getAttribute("x"))).toBeLessThanOrEqual(ancho);
    }
  });

  it("dibuja una línea por serie y las nombra las dos en la leyenda", () => {
    const { container } = render(<ActivityChart days={mes} failed={false} />);

    const lineas = [...container.querySelectorAll("path")];
    expect(lineas).toHaveLength(2);
    for (const linea of lineas) {
      expect(linea.getAttribute("d")).not.toBe("");
    }

    // El color nunca es la única señal de cuál es cuál: la leyenda las
    // nombra, y la tabla vuelve a nombrarlas en sus cabeceras.
    const leyenda = within(screen.getByRole("list"));
    expect(leyenda.getByText(t.requests)).toBeInTheDocument();
    expect(leyenda.getByText(t.jobs)).toBeInTheDocument();

    const cabeceras = within(screen.getByRole("table"))
      .getAllByRole("columnheader")
      .map((c) => c.textContent);
    expect(cabeceras).toEqual([t.columnDay, t.requests, t.jobs]);
  });

  it("con un solo día todavía dibuja la serie", () => {
    const { container } = render(
      <ActivityChart days={[{ day: "2026-09-01", requests: 2, jobs: 1 }]} failed={false} />,
    );

    const lineas = [...container.querySelectorAll("path")];
    expect(lineas).toHaveLength(2);
    expect(lineas[0].getAttribute("d")).toMatch(/^M/);
  });
});
