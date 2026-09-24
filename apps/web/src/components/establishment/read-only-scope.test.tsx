import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import { ReadOnlyScope } from "./ReadOnlyScope";

/**
 * M74 · el Resumen de un restaurante en solo lectura (RN-EST-10).
 *
 * Lo que vigila:
 *
 *   · Que la columna "Qué no puedes hacer" diga lo que la guarda del
 *     servidor cierra y NADA MÁS: el dibujo pone "Modificar la información
 *     del restaurante" y la ficha se sigue pudiendo corregir.
 *   · Que la línea de tiempo salga de los pasos reales, con su motivo, y
 *     acabe en el alta.
 *   · Que sin pasos que enseñar no se pinte una línea de tiempo con solo
 *     el alta, que diría que el estado nunca cambió.
 */
const t = es.establishmentStatus;

afterEach(cleanup);

const HISTORIA = [
  { state: "read_only", at: "2026-09-10T08:00:00Z", reason: "Fin del mantenimiento", created: false },
  { state: "active", at: "2026-03-01T08:00:00Z", reason: null, created: false },
  { state: "configuring", at: "2026-02-15T08:00:00Z", reason: null, created: true },
] as const;

describe("M74 · solo lectura", () => {
  it("RN-EST-10 · dice qué se puede y qué no, con lo que cierra el servidor", () => {
    render(<ReadOnlyScope historyHref="/h" filesHref="/f" history={null} timeZone="Europe/Madrid" />);
    for (const linea of [...t.readOnlyCan, ...t.readOnlyCannot]) {
      expect(screen.getByText(linea)).toBeInTheDocument();
    }
    expect(screen.queryByText(/Modificar la información/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.historyLink })).toHaveAttribute("href", "/h");
    expect(screen.getByRole("link", { name: t.filesLink })).toHaveAttribute("href", "/f");
  });

  it("RN-EST-08 · la línea de tiempo lleva los pasos con su motivo y acaba en el alta", () => {
    render(
      <ReadOnlyScope historyHref="/h" filesHref="/f" history={HISTORIA} timeZone="Europe/Madrid" />,
    );
    expect(screen.getByText(t.timelineTitle)).toBeInTheDocument();
    expect(screen.getByText("Fin del mantenimiento")).toBeInTheDocument();
    expect(screen.getByText(t.timelineCreated)).toBeInTheDocument();
    expect(screen.getByText(es.space.statuses.configuring)).toBeInTheDocument();
  });

  it("sin pasos que enseñar no hay línea de tiempo", () => {
    render(<ReadOnlyScope historyHref="/h" filesHref="/f" history={null} timeZone="Europe/Madrid" />);
    expect(screen.queryByText(t.timelineTitle)).not.toBeInTheDocument();
  });
});
