import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";
import { FinanceSummary } from "./FinanceSummary";

/**
 * Página 22 · "Resumen financiero", pintado.
 *
 * Lo que vigila:
 *
 *   · Que los importes se pinten **tal cual llegan**, en céntimos, sin
 *     que esta tarjeta sume, reste ni redondee nada por su cuenta: los
 *     calcula `financial_dashboard()` sobre el libro inmutable, y el
 *     cliente nunca es la autoridad sobre un importe (CLAUDE.md MUST).
 *   · Que un cero **se escriba**. Un mes sin cobrar todavía es un dato,
 *     y taparlo con un guion lo convertiría en "no se sabe".
 *   · Que cada importe lleve su nombre escrito, no solo su color
 *     (§21.4), y que ese nombre sea **el mismo** que en Finanzas: un
 *     importe con dos nombres parece dos importes (CA-21).
 */
/**
 * `euros()` separa la cifra del símbolo con un espacio **fino e
 * irrompible** (U+202F), y Testing Library normaliza los espacios del DOM
 * a uno normal antes de comparar, pero no los de la cadena que se le pasa.
 * Sin esto, la comparación falla con dos textos que en pantalla son
 * idénticos. Lo que se comprueba sigue siendo el importe, no el espacio.
 */
const importe = (cents: number) => euros(cents).replace(/\s/g, " ");

afterEach(cleanup);

describe("página 22 · Resumen financiero", () => {
  it("pinta los dos importes tal cual llegan, en euros", () => {
    render(<FinanceSummary collectedCents={248_000} pendingCents={31_000} />);

    expect(screen.getByText(importe(248_000))).toBeInTheDocument();
    expect(screen.getByText(importe(31_000))).toBeInTheDocument();
  });

  it("un cero se escribe: es un dato, no una ausencia de dato", () => {
    render(<FinanceSummary collectedCents={0} pendingCents={0} />);

    expect(screen.getAllByText(importe(0))).toHaveLength(2);
  });

  it("los céntimos no se pierden por el camino", () => {
    // 1 234,56 €: si alguien redondeara a euros, esto lo diría.
    render(<FinanceSummary collectedCents={123_456} pendingCents={1} />);

    expect(screen.getByText(importe(123_456))).toBeInTheDocument();
    expect(screen.getByText(importe(1))).toBeInTheDocument();
  });

  it("cada importe lleva su nombre, y es el mismo que en Finanzas (CA-21)", () => {
    render(<FinanceSummary collectedCents={100} pendingCents={200} />);

    expect(screen.getByText(es.space.finance.collected)).toBeInTheDocument();
    expect(screen.getByText(es.space.finance.outstanding)).toBeInTheDocument();
  });

  it("no confunde un importe con el otro", () => {
    const { container } = render(<FinanceSummary collectedCents={500} pendingCents={900} />);

    // El cobrado va primero, como en el diseño, y cada cifra está en el
    // mismo bloque que su etiqueta.
    const bloques = [...(container.firstElementChild?.children ?? [])];
    expect(bloques).toHaveLength(2);
    expect(bloques[0].textContent).toBe(`${euros(500)}${es.space.finance.collected}`);
    expect(bloques[1].textContent).toBe(`${euros(900)}${es.space.finance.outstanding}`);
  });
});
