import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";

vi.mock("@/app/(auth)/actions", () => ({ replyToAccessRequest: vi.fn() }));

import { FollowUpView, type FollowUpData } from "./FollowUpView";

const t = es.auth.access;

const base: FollowUpData = {
  status: "submitted",
  status_reason: null,
  applicant_reply: null,
  contact_name: "Ana García",
  business_name: "Restaurante Oliva",
  can_reply: false,
};

afterEach(cleanup);

describe("A01 a A04 · el seguimiento de la solicitud de acceso", () => {
  it("A01 · RN-ACC-12 · en revisión, con los dos datos que devuelve el seguimiento", () => {
    render(<FollowUpView token="k" data={base} />);
    expect(screen.getByRole("heading", { name: t.sentTitle })).toBeInTheDocument();
    expect(screen.getByText(t.inReview)).toBeInTheDocument();
    expect(screen.getByText("Ana García")).toBeInTheDocument();
    expect(screen.getByText("Restaurante Oliva")).toBeInTheDocument();
  });

  it("A02 · RN-ACC-05 · el mensaje del equipo y la caja para responder", () => {
    render(
      <FollowUpView
        token="k"
        data={{ ...base, status: "needs_information", status_reason: "¿Qué servicio necesitas?", can_reply: true }}
      />,
    );
    expect(screen.getByRole("heading", { name: t.needsInfoTitle })).toBeInTheDocument();
    expect(screen.getByText(t.teamMessage)).toBeInTheDocument();
    expect(screen.getByText("“¿Qué servicio necesitas?”")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.replySubmit })).toBeInTheDocument();
  });

  it("A03 · RN-ACC-03 · aprobada dice que no crea espacio ni panel", () => {
    render(<FollowUpView token="k" data={{ ...base, status: "approved" }} />);
    expect(screen.getByRole("heading", { name: t.approvedTitle })).toBeInTheDocument();
    expect(screen.getByText(t.approvedNotice)).toBeInTheDocument();
    // Decisión 67 · "Contactar con Cuotly" escribe a info@restavor.com.
    expect(screen.getByRole("link", { name: t.contactCuotly })).toHaveAttribute(
      "href",
      "mailto:info@restavor.com",
    );
  });

  it("A04 · RN-ACC-07 · no aprobada enseña el motivo y nunca quién la revisó", () => {
    const { container } = render(
      <FollowUpView token="k" data={{ ...base, status: "rejected", status_reason: "Falta concretar el servicio." }} />,
    );
    expect(screen.getByRole("heading", { name: t.rejectedTitle })).toBeInTheDocument();
    expect(screen.getByText(t.decisionReason)).toBeInTheDocument();
    expect(screen.getByText("“Falta concretar el servicio.”")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/revisad[ao] por/i);
    expect(screen.getByRole("link", { name: t.contactCuotly })).toHaveAttribute(
      "href",
      "mailto:info@restavor.com",
    );
  });
});
