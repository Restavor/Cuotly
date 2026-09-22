import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";

import { PanelHome, type PanelHomeData } from "./PanelHome";

const t = es.panelHome;

function datos(cambios: Partial<PanelHomeData> = {}): PanelHomeData {
  return {
    firstName: "Ana",
    establishment: { name: "Oliva", code: "EST-0001", city: "Vigo", photoUrl: null },
    links: {
      newRequest: "/r/solicitudes/nueva",
      createMenu: null,
      plan: "/r/facturacion",
      menus: null,
      messages: "/r#mensajes",
      requests: "/r/solicitudes",
      data: "/r/datos",
    },
    attention: [],
    plan: { names: ["Premium+"], quotas: [{ label: "Cambios pequeños", used: 8, included: 25 }], renewsLabel: "1 oct 2026" },
    nextMenu: null,
    showMenus: false,
    messages: [],
    activity: [],
    inProgress: [],
    firstSteps: false,
    ...cambios,
  };
}

afterEach(cleanup);

describe("R01 · el Inicio del panel del restaurante", () => {
  it("saluda por el nombre y enseña el plan con sus cuotas del ciclo, sin precio", () => {
    const { container } = render(<PanelHome data={datos()} />);
    expect(screen.getByRole("heading", { name: "Hola, Ana" })).toBeInTheDocument();
    expect(screen.getByText("Premium+")).toBeInTheDocument();
    expect(screen.getByText("8 / 25")).toBeInTheDocument();
    // El restaurante no lee `plans`: no se inventa un precio.
    expect(container.textContent).not.toMatch(/€/);
  });

  it("sin nada pendiente dice «Todo al día», no pinta tarjetas vacías", () => {
    render(<PanelHome data={datos()} />);
    expect(screen.getByText(t.allClearTitle)).toBeInTheDocument();
    expect(screen.queryByText(t.attentionRequestTitle)).not.toBeInTheDocument();
  });

  it("las tarjetas de arriba llevan a donde se resuelve cada cosa", () => {
    render(
      <PanelHome
        data={datos({
          attention: [
            { kind: "request", count: 2, href: "/r/solicitudes/1" },
            { kind: "charge", overdue: false, concept: "Cuota de octubre", dateLabel: "28 sep 2026", href: "/r/facturacion" },
          ],
        })}
      />,
    );
    expect(screen.getByText(t.attentionRequestBody(2))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.attentionRequestCta })).toHaveAttribute("href", "/r/solicitudes/1");
    expect(screen.getByText(t.attentionChargeBody("Cuota de octubre", "28 sep 2026"))).toBeInTheDocument();
  });

  it("cada tarjeta vacía dice por qué, sin ejemplos", () => {
    render(<PanelHome data={datos({ plan: { names: [], quotas: [], renewsLabel: null } })} />);
    expect(screen.getByText(t.planNone)).toBeInTheDocument();
    expect(screen.getByText(t.messagesEmpty)).toBeInTheDocument();
    expect(screen.getByText(t.activityEmpty)).toBeInTheDocument();
    expect(screen.getByText(t.inProgressEmpty)).toBeInTheDocument();
  });

  it("R02 · «Crear menú» y «Próxima publicación» solo con Menú Diario", () => {
    render(<PanelHome data={datos()} />);
    expect(screen.queryByRole("link", { name: t.createMenu })).not.toBeInTheDocument();
    expect(screen.queryByText(t.nextMenuTitle)).not.toBeInTheDocument();
    cleanup();
    render(
      <PanelHome
        data={datos({
          showMenus: true,
          links: { ...datos().links, createMenu: "/r/menu-diario", menus: "/r/menu-diario" },
        })}
      />,
    );
    expect(screen.getByRole("link", { name: t.createMenu })).toHaveAttribute("href", "/r/menu-diario");
    expect(screen.getByText(t.nextMenuEmpty)).toBeInTheDocument();
  });

  it("R04 · un restaurante recién llegado ve sus primeros pasos", () => {
    render(<PanelHome data={datos({ firstSteps: true })} />);
    const pasos = screen.getByRole("heading", { name: t.firstStepsTitle }).closest("section") as HTMLElement;
    expect(within(pasos).getByRole("link", { name: t.stepDataCta })).toHaveAttribute("href", "/r/datos");
    expect(within(pasos).getByRole("link", { name: t.stepRequestCta })).toHaveAttribute("href", "/r/solicitudes/nueva");
  });
});
