import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";

import { SpaceReportsView } from "./SpaceReportsView";

const t = es.reportsPage.dashboard;
afterEach(cleanup);

const comun = {
  slug: "s",
  timeZone: "Europe/Madrid",
  month: "2026-09",
  today: "2026-09-23",
  establishmentId: null,
  establishments: [],
};

const indicadores = {
  requestsReceived: 6,
  requestsAccepted: 0,
  requestsRejected: 0,
  requestsCancelled: 0,
  jobsStarted: 0,
  jobsCompleted: 0,
  jobsPending: 0,
  startCompliancePercent: null,
  executionCompliancePercent: null,
  averageStartMinutes: null,
  averageCompletionMinutes: null,
  jobsBlocked: 0,
  blockedMinutes: 0,
  correctionsRequested: 0,
  consumptionByCategory: { small: 0, photo: 0, medium: 0, large: 0 },
  menuUpdatesUsed: 0,
  menusPublished: 0,
  menusOutOfGuarantee: 0,
};

describe("M18 · Informes del espacio", () => {
  it("si las cifras no se pudieron calcular lo dice, no pinta ceros", () => {
    render(<SpaceReportsView {...comun} content={{ tab: "operacion", data: null }} />);
    expect(screen.getByText(t.failedTitle)).toBeTruthy();
  });

  it("RN-REP-17 · sin mes anterior no inventa una variación, y sin trabajos no hay cumplimiento", () => {
    render(
      <SpaceReportsView
        {...comun}
        content={{ tab: "operacion", data: { current: indicadores, previous: null, workers: [], attention: [] } }}
      />,
    );
    expect(screen.getAllByText(t.noPrevious).length).toBe(2);
    expect(screen.getAllByText(t.notApplicable).length).toBe(2);
    expect(screen.getByText(t.workloadEmpty)).toBeTruthy();
  });

  it("§178 · cada fuente sin dato dice por qué", () => {
    const falta = { kind: "missing" as const, reason: "not_connected" };
    render(
      <SpaceReportsView
        {...comun}
        content={{
          tab: "digital",
          data: {
            rows: [
              {
                establishmentId: "e",
                name: "Oliva",
                sessions: null,
                clicks: null,
                providers: { ga4: falta, search_console: falta, business_profile: falta, clarity: falta, pagespeed: falta },
                lastUpdate: null,
              },
            ],
          },
        }}
      />,
    );
    expect(screen.getAllByText(es.emptyReasons.not_connected).length).toBe(5);
    expect(screen.getAllByText(t.lastSyncNone).length).toBeGreaterThan(0);
  });

  it("M68 · la biblioteca es la cuarta pestaña, sin selector de mes", () => {
    render(<SpaceReportsView {...comun} content={{ tab: "generados", library: <p>biblioteca</p> }} />);
    expect(screen.getByText("biblioteca")).toBeTruthy();
    expect(screen.queryByLabelText(t.previousMonth)).toBeNull();
  });
});
