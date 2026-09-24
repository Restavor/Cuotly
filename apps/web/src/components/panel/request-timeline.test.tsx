import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RequestTimeline, type TimelineView } from "./RequestPieces";

const paso = (key: string, label: string): TimelineView => ({
  key,
  status: "done",
  label,
  dateLabel: "24 sept 2026",
});

const cuatro = [
  paso("received", "Recibida"),
  paso("accepted", "Aceptada"),
  paso("in_progress", "En curso"),
  paso("published", "Publicada"),
];

describe("RequestTimeline horizontal en el teléfono (PDF móvil, p. 122)", () => {
  it("con cuatro pasos o menos es una sola fila, también en el teléfono", () => {
    const { container } = render(<RequestTimeline steps={cuatro} orientation="horizontal" />);
    expect(container.querySelectorAll("ol")).toHaveLength(1);
    expect(container.querySelector(".sm\\:hidden")).toBeNull();
    expect(screen.getAllByText("Publicada")).toHaveLength(1);
  });

  it("con más de cuatro, en el teléfono va en vertical y la fila queda para la pantalla ancha", () => {
    const seis = [paso("sent", "Solicitud enviada"), ...cuatro, paso("correction", "En corrección")];
    const { container } = render(<RequestTimeline steps={seis} orientation="horizontal" />);
    const movil = container.querySelector(".sm\\:hidden");
    const ancha = container.querySelector(".hidden.sm\\:block");
    expect(movil?.querySelector("ol.space-y-4")).not.toBeNull();
    expect(ancha?.querySelector("ol.flex")).not.toBeNull();
    // Cada paso, una vez en cada versión: solo una se ve en cada anchura.
    expect(screen.getAllByText("En corrección")).toHaveLength(2);
  });
});
