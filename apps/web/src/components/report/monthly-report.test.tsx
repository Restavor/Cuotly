import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MonthlyReportCard, type MonthlyReportView } from "@/components/establishment/Sheet";
import { es } from "@/i18n/es";

import { EntryTextsForm, PublishReportButton } from "./MonthlyReport";

/**
 * El informe del mes en la ficha (decisión 78). Lo que puede romper una
 * pantalla sin que la base se entere:
 *
 *   · Que "Subir informe" sin revisar PREGUNTE, con las dos salidas que
 *     pidió Bosco, y que lo revisado no pregunte (RN-REP-29).
 *   · Que la confirmación viaje en el formulario: es lo que el servidor
 *     exige (`publish_report`).
 *   · Que los botones aparezcan cuando tocan: generar sin informe, subir y
 *     revisar con él, y solo "ver" cuando ya se subió (RN-REP-27).
 *   · Que el editor de textos recuerde que lo lee el restaurante (P7).
 */

vi.mock("@/app/espacios/[slug]/informes/actions", () => ({
  generateMonthlyReport: vi.fn(),
  publishReport: vi.fn(),
  saveReportTexts: vi.fn(),
}));

const t = es.reportsPage.monthly;

afterEach(cleanup);

function vista(overrides: Partial<MonthlyReportView> = {}): MonthlyReportView {
  return {
    establishmentId: "est-1",
    periodKind: "month",
    monthLabel: "agosto de 2026",
    report: {
      id: "rep-1",
      status: "preparing",
      sentAt: null,
      generatedAt: "2026-09-25T10:00:00Z",
    },
    canPublish: true,
    ...overrides,
  };
}

describe("RN-REP-32 · la tarjeta cuando el plan manda el informe cada trimestre", () => {
  it("RN-REP-32 · un plan trimestral ve el informe del trimestre, no el del mes", () => {
    render(
      <MonthlyReportCard
        slug="restavor"
        view={vista({ periodKind: "quarter", monthLabel: "julio a septiembre de 2026", report: null })}
        timeZone="Europe/Madrid"
      />,
    );
    expect(screen.getByText(t.quarterTitle)).toBeInTheDocument();
    expect(screen.getByText(t.quarterNotGenerated("julio a septiembre de 2026"))).toBeInTheDocument();
    expect(screen.queryByText(t.title)).not.toBeInTheDocument();
  });
});

describe("RN-REP-27 · la tarjeta del informe del mes", () => {
  it("RN-REP-27 · sin informe del mes, solo se ofrece generarlo", () => {
    render(<MonthlyReportCard slug="restavor" view={vista({ report: null })} timeZone="Europe/Madrid" />);
    expect(screen.getByText(t.notGenerated("agosto de 2026"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.generate })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.publish })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: t.review })).not.toBeInTheDocument();
  });

  it("RN-REP-27 · generado, aparecen Subir informe y Revisar informe, y Revisar abre la vista 10.04", () => {
    render(<MonthlyReportCard slug="restavor" view={vista()} timeZone="Europe/Madrid" />);
    expect(screen.getByRole("button", { name: t.publish })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.review })).toHaveAttribute("href", "/espacios/restavor/informes/rep-1");
    expect(screen.getByRole("button", { name: t.regenerate })).toBeInTheDocument();
  });

  it("RN-REP-29 · sin 'Aprobar informes' no se ofrece subir, y se dice por qué", () => {
    render(<MonthlyReportCard slug="restavor" view={vista({ canPublish: false })} timeZone="Europe/Madrid" />);
    expect(screen.queryByRole("button", { name: t.publish })).not.toBeInTheDocument();
    expect(screen.getByText(t.noApprovePermission)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.review })).toBeInTheDocument();
  });

  it("RN-REP-27 · lo subido ya no se regenera ni se sube: solo se ve", () => {
    render(
      <MonthlyReportCard
        slug="restavor"
        view={vista({ report: { id: "rep-1", status: "sent", sentAt: "2026-09-02T08:00:00Z", generatedAt: "2026-09-01T08:00:00Z" } })}
        timeZone="Europe/Madrid"
      />,
    );
    expect(screen.getByRole("link", { name: t.view })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.publish })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.regenerate })).not.toBeInTheDocument();
  });
});

describe("RN-REP-29 · la alerta de subir sin revisar", () => {
  it("RN-REP-29 · sin revisar, pregunta: subir sin revisar o cancelar y revisar", () => {
    render(<PublishReportButton slug="restavor" reportId="rep-1" reviewed={false} reviewHref="/espacios/restavor/informes/rep-1" />);
    fireEvent.click(screen.getByRole("button", { name: t.publish }));

    const alerta = screen.getByRole("dialog");
    expect(within(alerta).getByText(t.confirmTitle)).toBeInTheDocument();
    expect(within(alerta).getByRole("link", { name: t.confirmReview })).toHaveAttribute(
      "href",
      "/espacios/restavor/informes/rep-1",
    );
    const subir = within(alerta).getByRole("button", { name: t.confirmPublish });
    // La confirmación viaja al servidor, que es quien la exige.
    const formulario = subir.closest("form");
    expect(formulario?.querySelector('input[name="confirmUnreviewed"]')).toHaveValue("true");
  });

  it("RN-REP-29 · revisado y aprobado, sube sin preguntar y sin confirmación", () => {
    render(<PublishReportButton slug="restavor" reportId="rep-1" reviewed reviewHref="/x" />);
    const boton = screen.getByRole("button", { name: t.publish });
    expect(boton).toHaveAttribute("type", "submit");
    expect(boton.closest("form")?.querySelector('input[name="confirmUnreviewed"]')).toHaveValue("false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("RN-REP-30 · el editor de textos", () => {
  it("RN-REP-30 · cada cambio lleva título y descripción con su original al lado, y recuerda que lo lee el restaurante", () => {
    render(
      <EntryTextsForm
        slug="restavor"
        reportId="rep-1"
        readOnly={false}
        changes={[
          {
            key: "change:SOL-1",
            date: "3 ago",
            title: "Nueva carta",
            titleOriginal: "Cambiar el precio del menú",
            description: "Cambiar 20 € de pescado por 25 €",
            descriptionOriginal: "Cambiar 20 € de pescado por 25 €",
            edited: true,
          },
        ]}
        entries={[
          {
            key: "entry:menu_published:2026-08-10:2026-08-10",
            date: "10 ago",
            text: "Menú del día publicado · 10 ago",
            textOriginal: "Menú del día publicado · 10 ago",
            edited: false,
          },
        ]}
      />,
    );
    expect(screen.getByText(es.reportsPage.texts.hint)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Nueva carta")).toBeInTheDocument();
    expect(document.querySelector('input[name="titleOriginal:change:SOL-1"]')).toHaveValue("Cambiar el precio del menú");
    expect(screen.getByText(es.reportsPage.texts.edited)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: es.reportsPage.texts.save })).toBeInTheDocument();
  });

  it("RN-REP-30 · un informe subido no se edita", () => {
    render(
      <EntryTextsForm
        slug="restavor"
        reportId="rep-1"
        readOnly
        changes={[]}
        entries={[{ key: "entry:file_shared:x:carta.pdf", date: "12 ago", text: "Archivo", textOriginal: "Archivo", edited: false }]}
      />,
    );
    expect(screen.getByText(es.reportsPage.texts.readOnly)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: es.reportsPage.texts.save })).not.toBeInTheDocument();
    expect(document.querySelector('input[name="body:entry:file_shared:x:carta.pdf"]')).toBeDisabled();
  });
});
