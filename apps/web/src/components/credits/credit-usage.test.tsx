import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";

import { CreditUsageBar, CreditUsageDetail, type CreditDetailView } from "./CreditUsage";

afterEach(cleanup);

const t = es.credits;

const saldo = { includedHalf: 40, usedHalf: 21, percentUsed: 53, renewsLabel: "27 de octubre de 2026" };

const lineas: CreditDetailView[] = [
  {
    key: "r1",
    kind: "request",
    code: "SOL-0007",
    description: "Nueva sección de eventos",
    usedHalf: 13,
    percent: 33,
    href: "/solicitud/r1",
  },
  { key: "r2", kind: "request", code: "SOL-0005", description: "Cambiar el teléfono", usedHalf: 8, percent: 20, href: null },
  { key: "ajuste-0", kind: "adjustment", code: null, description: null, usedHalf: -2, percent: -5, href: null },
];

describe("RN-CRE-16 · el restaurante ve porcentajes", () => {
  it("la barra dice el porcentaje y no los créditos", () => {
    const { container } = render(<CreditUsageBar balance={saldo} audience="client" />);
    expect(screen.getByText(t.usagePercent(53))).toBeTruthy();
    expect(screen.getByText(t.usageRenews("27 de octubre de 2026"))).toBeTruthy();
    expect(container.textContent).not.toContain("créditos");
  });

  it("el detalle, por solicitud y en porcentaje del plan, con el ajuste aparte", () => {
    const { container } = render(<CreditUsageDetail lines={lineas} audience="client" />);
    expect(screen.getByRole("link", { name: "SOL-0007 · Nueva sección de eventos" })).toHaveAttribute("href", "/solicitud/r1");
    expect(screen.getByText(t.detailPercent(33))).toBeTruthy();
    expect(screen.getByText(t.detailPercent(20))).toBeTruthy();
    expect(screen.getByText(t.detailAdjustmentPercent(5))).toBeTruthy();
    expect(container.textContent).not.toContain("créditos ·");
  });

  it("sin nada gastado lo dice, sin lista vacía", () => {
    render(<CreditUsageDetail lines={[]} audience="client" />);
    expect(screen.getByText(t.detailEmpty)).toBeTruthy();
  });
});

describe("RN-CRE-16 · el equipo ve además los créditos exactos", () => {
  it("en la barra y en cada línea", () => {
    render(
      <>
        <CreditUsageBar balance={saldo} audience="team" />
        <CreditUsageDetail lines={lineas} audience="team" />
      </>,
    );
    expect(screen.getByText(t.usageTeam("10,5", "20"))).toBeTruthy();
    expect(screen.getByText(t.detailTeam("6,5", 33))).toBeTruthy();
    expect(screen.getByText(t.detailAdjustmentTeam("1", 5))).toBeTruthy();
  });
});

describe("RN-CRE-17 · al 100 % se dice así", () => {
  it("al restaurante, con las tres salidas", () => {
    render(<CreditUsageBar balance={{ ...saldo, usedHalf: 40, percentUsed: 100 }} audience="client" />);
    expect(screen.getByText(t.usageFull)).toBeTruthy();
  });

  it("por debajo no sale", () => {
    render(<CreditUsageBar balance={saldo} audience="client" />);
    expect(screen.queryByText(t.usageFull)).toBeNull();
  });
});
