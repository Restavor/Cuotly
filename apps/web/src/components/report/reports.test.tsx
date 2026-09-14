import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ReportSnapshot, WorkerPersonalReport } from "@/core/reports";
import { es } from "@/i18n/es";
import { figureLabel } from "@/services/report-pdf";

import { AvailableReports } from "./AvailableReports";
import { PersonalReport } from "./PersonalReport";
import { ReportFigures } from "./ReportFigures";
import { ReportsTable } from "./ReportsTable";
import type { ReportRow } from "./reports-load";

/**
 * Las pantallas de informes (Fase 3, Hito 16; §89 a §95). Lo que se vigila
 * aquí es lo que una pantalla puede romper sin que la base se entere:
 *
 *   · Que una cifra que no existe DICE SU MOTIVO y no un guion mudo
 *     (CA-20, §178).
 *   · Que la vista previa se abre con lo que decidió el equipo, y que el
 *     lector puede encender lo que la versión trae dentro y el equipo
 *     dejó fuera (decisión 29), marcado como lo que es: algo que no va en
 *     el PDF.
 *   · Que al restaurante no se le enseña la cocina —ni el estado interno
 *     ni quién lo aprobó— y que lo que ve es su informe (P7, RN-REP-13).
 *   · Que el informe personal dice que la carga no es una nota y que las
 *     comparaciones no son suyas (§55, §90).
 */
const t = es.reportsPage;

afterEach(cleanup);

function informe(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    id: "rep-1",
    establishmentId: "est-1",
    establishmentName: "Casa Informes",
    category: "operation",
    name: "Informe mensual",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    status: "sent",
    statusReason: null,
    deliveryChannel: "email",
    includeCsv: false,
    scheduledFor: null,
    sentAt: "2026-09-01T08:00:00Z",
    approvedAt: "2026-08-31T10:00:00Z",
    createdAt: "2026-08-30T10:00:00Z",
    ...overrides,
  };
}

describe("la biblioteca del equipo (vista 10.01)", () => {
  it("enseña el estado con texto, no solo con color (§21.4)", () => {
    render(
      <ReportsTable
        rows={[informe(), informe({ id: "rep-2", status: "pending_review" })]}
        base="/espacios/restavor/informes"
      />,
    );

    expect(screen.getByText(t.states.sent)).toBeInTheDocument();
    expect(screen.getByText(t.states.pending_review)).toBeInTheDocument();
  });

  it("sin informes dice por qué está vacío, no una tabla en blanco", () => {
    render(<ReportsTable rows={[]} base="/espacios/restavor/informes" />);

    expect(screen.getByText(t.empty)).toBeInTheDocument();
    expect(screen.getByText(t.emptyReason)).toBeInTheDocument();
  });

  it("un consolidado se dice como tal, y no con un restaurante en blanco", () => {
    render(
      <ReportsTable
        rows={[informe({ establishmentId: null, establishmentName: null })]}
        base="/espacios/restavor/informes"
      />,
    );

    expect(screen.getByText(t.pdf.consolidated)).toBeInTheDocument();
  });
});

describe("lo que ve el restaurante (vista 22.01, RN-REP-13)", () => {
  it("enseña el informe con su periodo, su fecha de compartición y su PDF", () => {
    render(<AvailableReports reports={[informe()]} base="/espacios/restavor/informes" />);

    expect(screen.getByText("Informe mensual")).toBeInTheDocument();
    expect(screen.getByText(t.downloadPdf)).toBeInTheDocument();
  });

  it("no enseña el estado interno del informe: eso es conversación del equipo", () => {
    render(<AvailableReports reports={[informe()]} base="/espacios/restavor/informes" />);

    expect(screen.queryByText(t.states.approved)).not.toBeInTheDocument();
    expect(screen.queryByText(t.states.pending_review)).not.toBeInTheDocument();
  });

  it("sin informes compartidos dice el motivo", () => {
    render(<AvailableReports reports={[]} base="/espacios/restavor/informes" />);

    expect(screen.getByText(t.clientEmpty)).toBeInTheDocument();
    expect(screen.getByText(t.clientEmptyReason)).toBeInTheDocument();
  });
});

describe("la vista previa de las cifras (§94, CA-20)", () => {
  const snapshot: ReportSnapshot = {
    category: "operation",
    period: { start: "2026-08-01", end: "2026-08-31" },
    generatedAt: "2026-09-01T08:00:00Z",
    sections: [
      { key: "executive_summary", position: 1, included: true },
      { key: "operation", position: 2, included: true },
      { key: "digital", position: 3, included: false },
    ],
    figures: [
      { section: "operation", metric: "jobs_completed", value: 10 },
      { section: "operation", metric: "start_compliance", value: null, unit: "percent", noDataReason: "stale" },
      { section: "digital", metric: "sessions", value: 3, dimension: "ga4" },
    ],
    opportunities: [],
    notes: { executive_summary: "Agosto flojo, como todos los agostos." },
  };

  /** La cifra digital tal y como la escribe la pantalla, con su fuente. */
  const cifraDigital = figureLabel({ section: "digital", metric: "sessions", value: 3, dimension: "ga4" }, t);

  it("una cifra sin valor dice su motivo y no un guion", () => {
    render(<ReportFigures snapshot={snapshot} />);

    expect(screen.getByText(es.emptyReasons.stale)).toBeInTheDocument();
  });

  it("decisión 29 · al abrir se ve lo que decidió el equipo: la sección que apagó no sale", () => {
    render(<ReportFigures snapshot={snapshot} />);

    // "Rendimiento digital" aparece una sola vez, en el selector, y no
    // como encabezado de una sección pintada: su cifra no está a la vista.
    expect(screen.getAllByText(t.sections.digital)).toHaveLength(1);
    expect(screen.queryByText(cifraDigital)).not.toBeInTheDocument();
    // "Operación" sale dos veces: en el selector y como encabezado de su
    // sección, que es lo que dice que está pintada.
    expect(screen.getAllByText(t.sections.operation)).toHaveLength(2);
  });

  it("decisión 29 · el lector enciende la sección que el equipo dejó fuera y la ve, marcada como fuera del PDF", () => {
    render(<ReportFigures snapshot={snapshot} />);

    const casilla = screen.getByRole("checkbox", { name: new RegExp(t.sections.digital) });
    expect(casilla).not.toBeChecked();
    expect(screen.getByText(`(${t.viewSectionExtra})`)).toBeInTheDocument();

    fireEvent.click(casilla);

    expect(screen.getByText(cifraDigital)).toBeInTheDocument();
  });

  it("decisión 29 · el selector no ofrece una sección que la versión no trae", () => {
    render(
      <ReportFigures
        snapshot={{
          ...snapshot,
          figures: [{ section: "operation", metric: "jobs_completed", value: 10 }],
        }}
      />,
    );

    // Sin cifra digital dentro, encenderla solo enseñaría un vacío.
    expect(screen.queryByText(t.sections.digital)).not.toBeInTheDocument();
  });

  it("el texto que escribió una persona se enseña tal cual: Cuotly no redacta nada", () => {
    render(<ReportFigures snapshot={snapshot} />);

    expect(screen.getByText("Agosto flojo, como todos los agostos.")).toBeInTheDocument();
  });

  it("una sección incluida sin cifras dice que todavía no hay datos", () => {
    render(
      <ReportFigures
        snapshot={{
          ...snapshot,
          figures: [],
          notes: {},
          sections: [{ key: "operation", position: 1, included: true }],
        }}
      />,
    );

    expect(screen.getByText(es.emptyReasons.no_data_yet)).toBeInTheDocument();
  });

  it("§96 · una oportunidad del informe se titula desde su regla, no desde una frase guardada", () => {
    render(
      <ReportFigures
        snapshot={{
          ...snapshot,
          sections: [{ key: "opportunities", position: 1, included: true }],
          opportunities: [
            {
              id: "opp-1",
              rule: "low_ctr",
              subject: "menú del día",
              title: null,
              impact: "low",
              effortCategory: "small",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText(es.opportunities.ruleTitles.low_ctr("menú del día"))).toBeInTheDocument();
    expect(screen.getByText(es.opportunities.impacts.low)).toBeInTheDocument();
  });
});

describe("§90 · el informe personal del trabajador", () => {
  const personal: WorkerPersonalReport = {
    workerId: "ana",
    currentLoadPoints: 12,
    historicalPoints: 48,
    jobsCompleted: 6,
    jobsPending: 2,
    startCompliancePercent: 86,
    executionCompliancePercent: null,
    averageStartMinutes: 180,
    averageCompletionMinutes: null,
    jobsBlocked: 1,
    correctionsRequested: 0,
  };

  it("§55 · dice que la carga no es una nota y que las comparaciones no son suyas", () => {
    render(<PersonalReport report={personal} period={{ start: "2026-08-01", end: "2026-08-31" }} />);

    expect(screen.getByText(t.loadIsNotAScore)).toBeInTheDocument();
    expect(screen.getByText(t.comparisonsOnlyForManagers)).toBeInTheDocument();
  });

  it("§90 · no lleva ni una cifra de dinero", () => {
    const { container } = render(
      <PersonalReport report={personal} period={{ start: "2026-08-01", end: "2026-08-31" }} />,
    );

    expect(container.textContent).not.toContain("€");
  });

  it("lo que no se pudo medir se dice, en vez de enseñarse como un cero", () => {
    render(<PersonalReport report={personal} period={{ start: "2026-08-01", end: "2026-08-31" }} />);

    // Cumplimiento de ejecución y tiempo medio de finalización son `null`:
    // no hubo ninguno que llegara al hito, que no es lo mismo que "0 %".
    expect(screen.getAllByText(t.pdf.noValue).length).toBe(2);
    expect(screen.getByText(t.units.percent(86))).toBeInTheDocument();
  });
});
