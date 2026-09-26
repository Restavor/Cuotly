import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";

vi.mock("./actions", () => ({
  askCreditQuote: vi.fn(),
  deferToNextCycle: vi.fn(),
  trimScope: vi.fn(),
}));
vi.mock("../../actions", () => ({ acceptRequest: vi.fn() }));

import { CreditDecision } from "./CreditDecision";

afterEach(cleanup);

const t = es.credits;

function pintar(over: Partial<Parameters<typeof CreditDecision>[0]> = {}) {
  return render(
    <CreditDecision
      requestId="r-1"
      fit="accept"
      description="Cambiar el teléfono y la foto de portada"
      context={null}
      deferredUntilLabel={null}
      quoteRequestedLabel={null}
      {...over}
    />,
  );
}

describe("RN-CRE-11 · cabe en lo que le queda: se acepta", () => {
  it("solo el botón de aceptar, sin las salidas", () => {
    pintar();
    expect(screen.getByRole("button", { name: es.clientArea.acceptSubmit })).toBeTruthy();
    expect(screen.queryByText(t.notEnoughTitle)).toBeNull();
    expect(screen.queryByRole("button", { name: t.quoteSubmit })).toBeNull();
  });
});

describe("RN-CRE-14 · no le llega: tres salidas, nunca hacer una parte", () => {
  it("cabe en un ciclo entero: quitar cosas, esperar o presupuesto, y no se ofrece aceptar", () => {
    const { container } = pintar({ fit: "choose" });
    expect(screen.getByText(t.notEnoughHint)).toBeTruthy();
    expect(screen.getByRole("button", { name: t.trimSubmit })).toBeTruthy();
    expect(screen.getByRole("button", { name: t.deferSubmit })).toBeTruthy();
    expect(screen.getByRole("button", { name: t.quoteSubmit })).toBeTruthy();
    expect(screen.queryByRole("button", { name: es.clientArea.acceptSubmit })).toBeNull();
    // Quitar cosas parte de lo que escribió, no de una hoja en blanco.
    expect((container.querySelector('textarea[name="description"]') as HTMLTextAreaElement).value).toBe(
      "Cambiar el teléfono y la foto de portada",
    );
  });

  it("ya está esperando: se le dice hasta cuándo en vez de ofrecer esperar otra vez", () => {
    pintar({ fit: "choose", deferredUntilLabel: "1 oct 2026" });
    expect(screen.getByText(t.deferredUntil("1 oct 2026"))).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.deferSubmit })).toBeNull();
  });

  it("no cabe ni en un ciclo entero: esperar no sirve y no se ofrece", () => {
    pintar({ fit: "quote_or_trim" });
    expect(screen.getByText(t.neverFitsHint)).toBeTruthy();
    expect(screen.getByRole("button", { name: t.trimSubmit })).toBeTruthy();
    expect(screen.getByRole("button", { name: t.quoteSubmit })).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.deferSubmit })).toBeNull();
  });
});

describe("RN-CRE-07 · su plan no incluye créditos", () => {
  it("solo el presupuesto", () => {
    pintar({ fit: "quote" });
    expect(screen.getByRole("button", { name: t.quoteSubmit })).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.trimSubmit })).toBeNull();
    expect(screen.queryByRole("button", { name: es.clientArea.acceptSubmit })).toBeNull();
  });
});

describe("RN-CRE-14 · ya pidió presupuesto", () => {
  it("se le dice que se está preparando y no se le ofrece nada más", () => {
    pintar({ fit: "choose", quoteRequestedLabel: "26 sept 2026, 10:00" });
    expect(screen.getByText(t.quoteRequested("26 sept 2026, 10:00"))).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
