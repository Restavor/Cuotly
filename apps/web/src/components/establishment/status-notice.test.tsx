import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import { StatusLegend } from "./StatusLegend";
import { StatusNotice } from "./StatusNotice";

/**
 * Vista 20 · "Estados y avisos", pintada.
 *
 * Lo que vigila:
 *
 *   · Que el aviso diga **el motivo concreto** (RN-EST-08) cuando lo hay, y
 *     que NO se invente uno cuando no lo hay. "Pausado por impago" sin que
 *     nadie haya escrito que es por impago es dato inventado.
 *   · Que un restaurante **activo** no lleve aviso: un banner permanente
 *     deja de leerse, y entonces tampoco se lee el que importa.
 *   · Que los cuatro estados que detienen el servicio lo digan, incluidos
 *     los dos que se parecen y no son lo mismo.
 */
const t = es.establishmentStatus;

afterEach(cleanup);

describe("vista 20 · el aviso de estado", () => {
  it("un restaurante activo NO lleva aviso", () => {
    const { container } = render(<StatusNotice status="active" reason={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("enseña el motivo concreto que alguien escribió (RN-EST-08)", () => {
    render(<StatusNotice status="paused" reason="Impago de la cuota de septiembre" />);
    expect(screen.getByText(/Impago de la cuota de septiembre/)).toBeInTheDocument();
  });

  it("sin motivo guardado NO se inventa uno", () => {
    render(<StatusNotice status="paused" reason={null} />);
    expect(screen.getByText(t.notices.paused.title)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(t.reasonLabel))).not.toBeInTheDocument();
    expect(screen.queryByText(/impago/i)).not.toBeInTheDocument();
  });

  it("con el servicio detenido dice que los contadores no corren (RN-FIN-12)", () => {
    // Es el dato que le quita el susto a quien lo lee: el plazo no avanza
    // en su contra mientras está parado.
    render(<StatusNotice status="suspended" reason={null} />);
    expect(screen.getByText(t.serviceStoppedHint)).toBeInTheDocument();
  });

  it("`ending` no dice que el servicio esté detenido (RN-EST-09)", () => {
    // "El servicio sigue activo hasta el final del periodo pagado."
    render(<StatusNotice status="ending" reason={null} />);
    expect(screen.getByText(t.notices.ending.title)).toBeInTheDocument();
    expect(screen.queryByText(t.serviceStoppedHint)).not.toBeInTheDocument();
  });

  it("un estado que no reconoce avisa, en vez de callarse", () => {
    render(<StatusNotice status="lo_que_sea" reason={null} />);
    expect(screen.getByText(t.notices.unknown.title)).toBeInTheDocument();
  });

  it("la acción solo se pinta si quien llama la pasa", () => {
    const { rerender } = render(<StatusNotice status="paused" reason={null} />);
    expect(screen.queryByRole("link", { name: /pago/i })).not.toBeInTheDocument();

    rerender(
      <StatusNotice status="paused" reason={null} action={<a href="/pagar">Registrar pago</a>} />,
    );
    expect(screen.getByRole("link", { name: "Registrar pago" })).toBeInTheDocument();
  });
});

describe("vista 20 · la leyenda de estados", () => {
  it("están los siete del PRD §15.1", () => {
    render(<StatusLegend current="active" />);
    const lista = within(screen.getByRole("list"));
    for (const estado of ["configuring", "active", "paused", "ending", "read_only", "suspended", "archived"] as const) {
      expect(lista.getByText(es.space.statuses[estado])).toBeInTheDocument();
    }
  });

  it("el actual se marca con texto, no solo con color (§21.4)", () => {
    render(<StatusLegend current="paused" />);
    expect(screen.getByText(t.currentMark)).toBeInTheDocument();
  });

  it("los cuatro que detienen el servicio lo dicen", () => {
    render(<StatusLegend current="active" />);
    expect(screen.getAllByText(t.serviceStoppedMark)).toHaveLength(4);
  });
});
