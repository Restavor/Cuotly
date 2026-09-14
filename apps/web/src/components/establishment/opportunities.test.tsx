import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";

import { OpportunitiesSection, opportunityTitle } from "./Opportunities";
import type { OpportunitiesView, OpportunityRow } from "./opportunities-load";

/**
 * La sección Oportunidades (Fase 3, Hito 15; §96 a §101). Lo que se
 * vigila aquí es lo que una pantalla puede romper sin que la base se
 * entere:
 *
 *   · Que la evidencia SE ENSEÑA (§96: no se afirma nada sin evidencia).
 *   · Que el esfuerzo se dice en lo que se tarda y lo que gasta, y que
 *     con la bolsa agotada dice que va a presupuesto (decisión 26b).
 *   · Que a quien no puede aprobar no se le ofrece aprobar (§97) — y que
 *     se le dice por qué, en vez de un botón que falla.
 *   · Que al restaurante no se le enseña la cocina: ni el alcance, ni la
 *     prioridad, ni si el equipo la ve (P7).
 *   · Que el hueco dice el motivo correcto según el plan (§101).
 */
const t = es.opportunities;

afterEach(cleanup);

function oportunidad(overrides: Partial<OpportunityRow> = {}): OpportunityRow {
  return {
    id: "opp-1",
    origin: "automatic",
    rule: "traffic_drop",
    subject: "",
    category: "traffic",
    scope: "basic",
    title: null,
    description: null,
    recommendedAction: null,
    impact: "medium",
    priority: 2,
    effortCategory: "medium",
    includeInReport: false,
    status: "detected",
    statusReason: null,
    evidence: [
      { provider: "ga4", metric: "sessions", dimension: "", value: 840, previous: 1365, unit: "count" },
    ],
    periodStart: "2026-08-17",
    periodEnd: "2026-09-13",
    detectionCount: 3,
    firstDetectedAt: "2026-09-01T06:00:00Z",
    lastDetectedAt: "2026-09-14T06:00:00Z",
    approvedAt: null,
    discardedAt: null,
    discardReason: null,
    reopenedAt: null,
    ...overrides,
  };
}

const IMPULSO = {
  includedSmall: 16,
  includedPhoto: 12,
  includedMedium: 3,
  includedLarge: 0,
  grantsPriority: false,
};

function vista(overrides: Partial<OpportunitiesView> = {}): OpportunitiesView {
  return {
    rows: [oportunidad()],
    access: "basic",
    plan: IMPULSO,
    remaining: { small: 14, photo: 12, medium: 3, large: 0 },
    ...overrides,
  };
}

describe("§96 · lo que una oportunidad enseña", () => {
  it("el título sale de la regla y del sujeto, no de la base", () => {
    expect(opportunityTitle(oportunidad())).toBe(t.ruleTitles.traffic_drop());
    expect(opportunityTitle(oportunidad({ rule: "low_ctr", subject: "menú del día" }))).toContain("menú del día");
    // Una añadida a mano lleva el título que escribió una persona (§97).
    expect(opportunityTitle(oportunidad({ rule: null, origin: "manual", title: "Fotos de 2019" }))).toBe(
      "Fotos de 2019",
    );
  });

  it("enseña la evidencia con sus cifras y su periodo", () => {
    render(<OpportunitiesSection view={vista()} viewer="approver" establishmentId="est-1" path="/x" />);

    expect(screen.getByText(t.evidenceHint)).toBeInTheDocument();
    expect(screen.getByText("840")).toBeInTheDocument();
    expect(screen.getByText("1365")).toBeInTheDocument();
    expect(screen.getByText(/Detectada 3 veces/)).toBeInTheDocument();
  });

  it("el esfuerzo dice lo que se tarda y lo que gasta (decisión 26b)", () => {
    render(<OpportunitiesSection view={vista()} viewer="approver" establishmentId="est-1" path="/x" />);

    expect(screen.getByText(/1 a 3 días laborables/)).toBeInTheDocument();
    expect(screen.getByText(/Gasta 1 cambio cambio mediano de los 3 que te quedan/)).toBeInTheDocument();
  });

  it("con la bolsa agotada, o con un plan que no incluye la categoría, dice que va a presupuesto", () => {
    render(
      <OpportunitiesSection
        view={vista({ remaining: { small: 14, photo: 12, medium: 0, large: 0 } })}
        viewer="approver"
        establishmentId="est-1"
        path="/x"
      />,
    );

    expect(screen.getByText(new RegExp(t.effortNotIncluded.slice(0, 40)))).toBeInTheDocument();
  });

  it("sin saldo leído no se inventa un cero: se dice que no se sabe", () => {
    render(
      <OpportunitiesSection view={vista({ remaining: null })} viewer="approver" establishmentId="est-1" path="/x" />,
    );

    expect(screen.getByText(new RegExp(t.effortUnknownBalance))).toBeInTheDocument();
  });
});

describe("§97 · quién puede qué", () => {
  it("quien aprueba informes ve aprobar y descartar", () => {
    render(<OpportunitiesSection view={vista()} viewer="approver" establishmentId="est-1" path="/x" />);

    expect(screen.getByRole("button", { name: t.approve })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.discard })).toBeInTheDocument();
    expect(screen.getByText(t.editTitle)).toBeInTheDocument();
  });

  it("el trabajador recomienda, no aprueba, y se le dice por qué", () => {
    render(<OpportunitiesSection view={vista()} viewer="worker" establishmentId="est-1" path="/x" />);

    expect(screen.getByRole("button", { name: t.recommend })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.approve })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.discard })).not.toBeInTheDocument();
    expect(screen.getByText(t.cannotApproveHint)).toBeInTheDocument();
    // Y editar la propuesta tampoco es suyo.
    expect(screen.queryByText(t.editTitle)).not.toBeInTheDocument();
  });

  it("el equipo puede añadir una a mano, el restaurante no", () => {
    render(<OpportunitiesSection view={vista()} viewer="worker" establishmentId="est-1" path="/x" />);
    expect(screen.getByText(t.addTitle)).toBeInTheDocument();

    cleanup();
    render(
      <OpportunitiesSection
        view={vista({ rows: [oportunidad({ status: "approved_for_report" })] })}
        viewer="client"
        establishmentId="est-1"
        path="/x"
      />,
    );
    expect(screen.queryByText(t.addTitle)).not.toBeInTheDocument();
  });
});

describe("§100 y P7 · lo que ve el restaurante", () => {
  it("las tres acciones de §100, y ninguna organización interna", () => {
    render(
      <OpportunitiesSection
        view={vista({ rows: [oportunidad({ status: "approved_for_report" })] })}
        viewer="client"
        establishmentId="est-1"
        path="/x"
      />,
    );

    expect(screen.getByText(t.clientActions.request_change)).toBeInTheDocument();
    expect(screen.getByText(t.clientActions.request_quote)).toBeInTheDocument();
    expect(screen.getByText(t.clientActions.ask_question)).toBeInTheDocument();

    // Ni el alcance, ni la prioridad, ni si el equipo la ve, ni las notas.
    expect(screen.queryByText(t.scopes.basic)).not.toBeInTheDocument();
    expect(screen.queryByText(t.priorityLabel(2))).not.toBeInTheDocument();
    expect(screen.queryByText(t.notesTitle)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.approve })).not.toBeInTheDocument();
  });

  it("§101 · sin ninguna, el motivo depende del plan", () => {
    render(
      <OpportunitiesSection
        view={vista({ rows: [], access: "none" })}
        viewer="client"
        establishmentId="est-1"
        path="/x"
      />,
    );
    expect(screen.getByText(t.clientEmptyNone)).toBeInTheDocument();

    cleanup();
    render(
      <OpportunitiesSection
        view={vista({ rows: [], access: "basic" })}
        viewer="client"
        establishmentId="est-1"
        path="/x"
      />,
    );
    expect(screen.getByText(t.clientEmptyBasic)).toBeInTheDocument();
  });

  it("el equipo sin ninguna ve que no ha saltado ninguna regla, no un error", () => {
    render(
      <OpportunitiesSection view={vista({ rows: [] })} viewer="approver" establishmentId="est-1" path="/x" />,
    );
    expect(screen.getByText(t.teamEmpty)).toBeInTheDocument();
    expect(screen.getByText(t.teamEmptyHint)).toBeInTheDocument();
  });

  it("si no se pudieron leer, se dice: no se enseña una lista vacía", () => {
    render(<OpportunitiesSection view={null} viewer="approver" establishmentId="est-1" path="/x" />);
    expect(screen.getByText(es.emptyReasons.error)).toBeInTheDocument();
  });
});
