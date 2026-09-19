import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";

import { SourcesStatusTable, insightsSince } from "./DigitalSections";
import type { DigitalDataView } from "./integrations-load";

/**
 * RN-INT-09 (decisión 48) · "Cuotly Insights" es el nombre del resumen
 * propio, no una fuente.
 *
 * Lo que esta suite vigila es la tentación de copiar el diseño literal:
 * las páginas 41 y 44 lo pintan siempre **"Activa"**, y hacerlo así
 * afirmaría que hay un resumen cuando puede no haber ni un dato detrás.
 * Eso es exactamente el dato de relleno que CLAUDE.md prohíbe, y por eso
 * el estado se deriva.
 */
afterEach(cleanup);

const t = es.integrations;

function vista(lastSuccessAt: Record<string, string | null>): DigitalDataView {
  return {
    timezone: "Europe/Madrid",
    window: { from: "2026-09-01", to: "2026-09-28" },
    providers: Object.entries(lastSuccessAt).map(([provider, fecha]) => ({
      provider: provider as never,
      status: fecha === null ? "not_connected" : "connected",
      lastSuccessAt: fecha,
      reason: null,
      // `points` hace falta de verdad: la columna "Información" de una
      // fuente conectada y sin motivo lee el último día con dato.
      points: [],
    })),
    metrics: [],
  } as unknown as DigitalDataView;
}

describe("RN-INT-09 · el estado se deriva, no se pinta fijo", () => {
  it("sin ninguna fuente con datos, dice que no hay nada que resumir", () => {
    render(
      <SourcesStatusTable
        view={vista({ ga4: null })}
        providers={["ga4"]}
        title="Fuentes"
      />,
    );
    expect(screen.getByText(t.insightsNothingYet)).toBeTruthy();
    expect(screen.queryByText(t.insightsActive)).toBeNull();
  });

  it("con una fuente que ha traído datos, está activo", () => {
    render(
      <SourcesStatusTable
        view={vista({ ga4: "2026-09-14T06:00:00Z" })}
        providers={["ga4"]}
        title="Fuentes"
      />,
    );
    expect(screen.getByText(t.insightsActive)).toBeTruthy();
  });

  it("aparece siempre, con datos o sin ellos", () => {
    // El diseño lo pone entre las fuentes y ahí se queda: esconderlo
    // cuando no hay datos dejaría un hueco sin explicación.
    render(
      <SourcesStatusTable view={vista({ ga4: null })} providers={["ga4"]} title="Fuentes" />,
    );
    expect(screen.getByTestId("source-cuotly-insights")).toBeTruthy();
    expect(screen.getByText(t.insightsName)).toBeTruthy();
  });

  it("dice que no es una conexión, en los dos estados", () => {
    // Ponerlo entre GA4 y Search Console sin decirlo prometería una
    // fuente de datos propia que no existe: no hay recogida, ni
    // retención, ni aviso legal nuevo.
    const { unmount } = render(
      <SourcesStatusTable view={vista({ ga4: null })} providers={["ga4"]} title="Fuentes" />,
    );
    expect(screen.getByText(t.insightsInfoEmpty)).toBeTruthy();
    unmount();

    render(
      <SourcesStatusTable
        view={vista({ ga4: "2026-09-14T06:00:00Z" })}
        providers={["ga4"]}
        title="Fuentes"
      />,
    );
    expect(screen.getByText(t.insightsInfo)).toBeTruthy();
  });
});

describe("RN-INT-09 · su fecha es la del dato que resume", () => {
  it("toma la más reciente de las fuentes, no la primera que encuentra", () => {
    expect(
      insightsSince(
        vista({
          ga4: "2026-09-10T06:00:00Z",
          search_console: "2026-09-14T06:00:00Z",
          clarity: "2026-09-02T06:00:00Z",
        }),
        ["ga4", "search_console", "clarity"],
      ),
    ).toBe("2026-09-14T06:00:00Z");
  });

  it("no cuenta las fuentes que no se le preguntan", () => {
    // Cada sección enseña sus proveedores (DATA_SECTION_PROVIDERS): el
    // resumen de Búsqueda no puede fecharse con lo que trajo Clarity.
    expect(
      insightsSince(
        vista({ ga4: "2026-09-10T06:00:00Z", clarity: "2026-09-14T06:00:00Z" }),
        ["ga4"],
      ),
    ).toBe("2026-09-10T06:00:00Z");
  });

  it("sin ninguna, es null y no una fecha inventada", () => {
    expect(insightsSince(vista({ ga4: null }), ["ga4"])).toBeNull();
  });
});
