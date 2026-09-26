import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChangeKindForm, ResolveIncidentForm } from "@/app/espacios/[slug]/solicitudes/[id]/RequestActions";
import { es } from "@/i18n/es";

import { IncidentCard } from "./IncidentCard";

vi.mock("@/app/espacios/[slug]/solicitudes/[id]/actions", () => ({
  cancelRequestForClient: vi.fn(),
  retryAnalysis: vi.fn(),
  rejectRequest: vi.fn(),
  requestMoreInformation: vi.fn(),
  resolveIncident: vi.fn(),
  setRequestKind: vi.fn(),
  validateClassification: vi.fn(),
}));

afterEach(cleanup);

const ti = es.requestIncidents;

describe("RN-REQ-09 a 11 · la tarjeta de la incidencia", () => {
  it("RN-REQ-10 · una incidencia sin diagnosticar dice que no gasta del plan", () => {
    render(
      <IncidentCard kind="incident" outcome={null} note={null} resolvedAt={null} audience="client" timeZone="Europe/Madrid" />,
    );
    expect(screen.getByText(ti.noPlanSpend)).toBeInTheDocument();
  });

  it("RN-REQ-11 · el restaurante lee lo que significa la salida, y la explicación", () => {
    render(
      <IncidentCard
        kind="incident"
        outcome="restavor_error"
        note="Lo arreglamos hoy."
        resolvedAt="2026-09-26T10:00:00Z"
        audience="client"
        timeZone="Europe/Madrid"
      />,
    );
    expect(screen.getByText(ti.clientOutcomes.restavor_error)).toBeInTheDocument();
    expect(screen.getByText("Lo arreglamos hoy.")).toBeInTheDocument();
  });

  it("RN-REQ-11 · el equipo lee la salida que eligió", () => {
    render(
      <IncidentCard kind="incident" outcome="external" note="Del proveedor" resolvedAt="2026-09-26T10:00:00Z" audience="team" timeZone="Europe/Madrid" />,
    );
    expect(screen.getByText(ti.outcomes.external)).toBeInTheDocument();
  });

  it("RN-REQ-11 · la que resultó ser un cambio sigue explicando por qué; un cambio de siempre no pinta nada", () => {
    render(
      <IncidentCard kind="change" outcome="change" note="Era un horario" resolvedAt="2026-09-26T10:00:00Z" audience="client" timeZone="Europe/Madrid" />,
    );
    expect(screen.getByText(ti.clientOutcomes.change)).toBeInTheDocument();
    // Ya no es incidencia: no promete que no gaste.
    expect(screen.queryByText(ti.noPlanSpend)).not.toBeInTheDocument();
    cleanup();

    const { container } = render(
      <IncidentCard kind="change" outcome={null} note={null} resolvedAt={null} audience="client" timeZone="Europe/Madrid" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RN-REQ-11 · el formulario del diagnóstico", () => {
  it("RN-REQ-11 · ofrece las cuatro salidas y pide el tamaño solo cuando nace un trabajo", () => {
    const { container } = render(<ResolveIncidentForm requestId="r-1" suggestedCategory="medium" />);
    const salidas = [...container.querySelectorAll('input[name="outcome"]')].map((i) => (i as HTMLInputElement).value);
    expect(salidas).toEqual(["restavor_error", "external", "quote", "change"]);

    // Por omisión, el arreglo sin coste: pide el tamaño, con la propuesta puesta.
    expect((container.querySelector('select[name="category"]') as HTMLSelectElement).value).toBe("medium");

    fireEvent.click(screen.getByLabelText(new RegExp(ti.outcomes.external)));
    expect(container.querySelector('select[name="category"]')).toBeNull();

    fireEvent.click(screen.getByLabelText(new RegExp(ti.outcomes.quote)));
    expect(container.querySelector('select[name="category"]')).not.toBeNull();

    expect(container.querySelector('textarea[name="note"]')).toHaveAttribute("maxLength", "1000");
  });

  it("RN-REQ-09 · corregir el tipo manda el contrario del que tiene", () => {
    const { container } = render(<ChangeKindForm requestId="r-1" kind="change" />);
    expect((container.querySelector('input[name="kind"]') as HTMLInputElement).value).toBe("incident");
    expect(screen.getByRole("button", { name: ti.markIncident })).toBeInTheDocument();
  });
});
