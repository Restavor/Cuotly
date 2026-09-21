import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import { OpportunityHighlights } from "./Opportunities";
import type { OpportunitiesView, OpportunityRow } from "./opportunities-load";

/**
 * Página 26 · "Oportunidades destacadas", en el Resumen de "Informes y
 * datos".
 *
 * Lo que vigila:
 *
 *   · Que una **descartada** no salga destacada. Alguien la cerró: volver
 *     a ponerla arriba invita a volver a mirarla, que es justo lo que ya
 *     se decidió no hacer.
 *   · Que **sin plan** se diga que no se detectan, en vez de "no hay
 *     ninguna": lo segundo hace pensar que se miró (§101, CA-20).
 *   · Que el impacto vaya **escrito**, no solo con color (§21.4), y con
 *     el mismo texto que la sección (CA-21).
 *   · Que aquí **no haya botones**: aprobar o descartar se hace en la
 *     sección, con la evidencia delante (§96).
 */
const t = es.opportunities;

function oportunidad(over: Partial<OpportunityRow> = {}): OpportunityRow {
  return {
    id: "o-1",
    origin: "automatic",
    rule: null,
    subject: "metadescriptions",
    category: "seo",
    scope: "basic",
    title: "Mejorar metadescripciones",
    description: null,
    recommendedAction: null,
    impact: "high",
    priority: 1,
    effortCategory: "small",
    includeInReport: true,
    status: "recommended",
    statusReason: null,
    evidence: [],
    periodStart: null,
    periodEnd: null,
    detectionCount: 1,
    firstDetectedAt: null,
    lastDetectedAt: null,
    approvedAt: null,
    discardedAt: null,
    ...over,
  } as OpportunityRow;
}

function vista(rows: readonly OpportunityRow[], access: OpportunitiesView["access"] = "advanced") {
  return { rows, access, plan: null, remaining: null } as OpportunitiesView;
}

afterEach(cleanup);

describe("página 26 · Oportunidades destacadas", () => {
  it("enseña el título y el impacto ESCRITO, no solo el color", () => {
    render(<OpportunityHighlights view={vista([oportunidad()])} />);

    expect(screen.getByText("Mejorar metadescripciones")).toBeInTheDocument();
    expect(screen.getByText(t.impacts.high)).toBeInTheDocument();
  });

  it("una descartada NO sale destacada: alguien ya la cerró", () => {
    render(
      <OpportunityHighlights
        view={vista([
          oportunidad({ id: "o-1", title: "Descartada", status: "discarded" }),
          oportunidad({ id: "o-2", title: "Viva", status: "recommended" }),
        ])}
      />,
    );

    expect(screen.getByText("Viva")).toBeInTheDocument();
    expect(screen.queryByText("Descartada")).not.toBeInTheDocument();
  });

  it("una que ya no aplica tampoco", () => {
    render(
      <OpportunityHighlights
        view={vista([oportunidad({ title: "Caducada", status: "no_longer_applicable" })])}
      />,
    );

    expect(screen.queryByText("Caducada")).not.toBeInTheDocument();
    expect(screen.getByText(t.highlightsEmptyTitle)).toBeInTheDocument();
  });

  it("sin plan dice que NO SE DETECTAN, no que no haya ninguna", () => {
    render(<OpportunityHighlights view={vista([oportunidad()], "none")} />);

    expect(screen.getByText(t.highlightsNoPlan)).toBeInTheDocument();
    expect(screen.queryByText(t.highlightsEmptyReason)).not.toBeInTheDocument();
    // Y no se cuela la oportunidad que traía la vista.
    expect(screen.queryByText("Mejorar metadescripciones")).not.toBeInTheDocument();
  });

  it("sin oportunidades dice qué llegaría a aparecer", () => {
    render(<OpportunityHighlights view={vista([])} />);

    expect(screen.getByText(t.highlightsEmptyTitle)).toBeInTheDocument();
    expect(screen.getByText(t.highlightsEmptyReason)).toBeInTheDocument();
  });

  it("respeta el orden que trae la vista y enseña como mucho cuatro", () => {
    render(
      <OpportunityHighlights
        view={vista(
          Array.from({ length: 7 }, (_, i) =>
            oportunidad({ id: `o-${i}`, title: `Oportunidad ${i}` }),
          ),
        )}
      />,
    );

    const filas = screen.getAllByRole("listitem");
    expect(filas).toHaveLength(4);
    expect(within(filas[0]).getByText("Oportunidad 0")).toBeInTheDocument();
    expect(screen.queryByText("Oportunidad 4")).not.toBeInTheDocument();
  });

  it("aquí NO se decide: ni un botón de aprobar o descartar (§96)", () => {
    const { container } = render(<OpportunityHighlights view={vista([oportunidad()])} />);

    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });
});
