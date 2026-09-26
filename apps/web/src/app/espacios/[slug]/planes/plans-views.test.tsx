import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";

import type { CataloguePlan, PlanCatalogue } from "./catalogue-load";
import { PlanCatalogueTab, RestaurantsTab, ServicesTab, VersionsTab } from "./PlansView";

vi.mock("./actions", () => ({
  assignPlan: vi.fn(),
  cancelScheduledPlanChange: vi.fn(),
  contractService: vi.fn(),
  publishConditions: vi.fn(),
  recordExternalAcceptance: vi.fn(),
  schedulePlanChange: vi.fn(),
  upgradePlanNow: vi.fn(),
  createPlan: vi.fn(),
  revisePlan: vi.fn(),
  renamePlan: vi.fn(),
  archivePlan: vi.fn(),
  createService: vi.fn(),
  reviseService: vi.fn(),
  renameService: vi.fn(),
  archiveService: vi.fn(),
  recordRevisionAcceptance: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const t = es.plansPage;
afterEach(cleanup);

const BASICO = "5a000000-0000-4000-8000-000000000001";
const PREMIUM_PLUS = "5a000000-0000-4000-8000-000000000002";
const MENU = "5a000000-0000-4000-8000-000000000003";

function plan(over: Partial<CataloguePlan> & Pick<CataloguePlan, "id" | "name" | "priceCents">): CataloguePlan {
  return {
    lineageId: over.id,
    revision: 1,
    publishedAt: "2026-06-01T10:00:00Z",
    supersededAt: null,
    archived: false,
    includedSmall: 0,
    includedPhoto: 0,
    includedMedium: 0,
    includedLarge: 0,
    startSlaHours: 48,
    executionSla: { small: 72, photo: 72, medium: 72, large: 120 },
    canOrderRequests: false,
    queueRank: 0,
    grantsPriority: false,
    watchesReviews: false,
    reportLevel: "basic",
    reportLevelRank: 0,
    reportPeriod: "month",
    ...over,
  };
}

const PLANES = [
      plan({ id: BASICO, name: "Básico", priceCents: 9900 }),
      plan({
        id: PREMIUM_PLUS,
        name: "Premium+",
        priceCents: 59900,
        includedSmall: 25,
        includedPhoto: 24,
        includedMedium: 5,
        includedLarge: 1,
        startSlaHours: 24,
        canOrderRequests: true,
        grantsPriority: true,
        reportLevel: "complete",
        reportLevelRank: 4,
      }),
];
const MENU_DIARIO = {
  id: MENU,
  lineageId: MENU,
  revision: 1,
  publishedAt: "2026-06-01T10:00:00Z",
  supersededAt: null,
  archived: false,
  name: "Menú Diario",
  kind: "daily_menu" as const,
  priceCents: 22900,
  pricePremiumCents: 19900,
  includedUpdates: 30,
};

function catalogue(over: Partial<PlanCatalogue> = {}): PlanCatalogue {
  return {
    plans: PLANES,
    planRevisions: PLANES,
    services: [MENU_DIARIO],
    serviceRevisions: [MENU_DIARIO],
    revisionStatus: [],
    planVersions: [
      { id: "v1", subjectId: PREMIUM_PLUS, version: 1, conditions: "Permanencia de 3 meses.\nSoporte.", publishedAt: "2026-06-15T10:00:00Z" },
      { id: "v2", subjectId: PREMIUM_PLUS, version: 2, conditions: "Permanencia de 3 meses.\nSoporte prioritario.", publishedAt: "2026-08-10T10:00:00Z" },
    ],
    serviceVersions: [],
    subscriptions: [
      { id: "s1", establishmentId: "e1", planId: PREMIUM_PLUS, serviceId: null, lineageId: PREMIUM_PLUS },
      { id: "s2", establishmentId: "e2", planId: PREMIUM_PLUS, serviceId: null, lineageId: PREMIUM_PLUS },
      { id: "s3", establishmentId: "e1", planId: null, serviceId: MENU, lineageId: MENU },
    ],
    establishments: new Map([
      ["e1", "Magariños"],
      ["e2", "La Encina"],
    ]),
    canPublish: true,
    failed: false,
    ...over,
  };
}

describe("M21 · Planes", () => {
  it("lista los planes con su precio y cuántos restaurantes los tienen", () => {
    render(<PlanCatalogueTab slug="s" spaceId="sp" action={null} catalogue={catalogue()} selectedId={null} timeZone="Europe/Madrid" />);
    const filas = within(screen.getByTestId("planes-catalogo")).getAllByRole("row");
    const pp = filas.find((f) => f.textContent?.includes("Premium+"));
    expect(pp?.textContent).toContain(t.catalogue.pricePerMonth(euros(59900)));
    expect(pp?.textContent).toContain("2");
  });

  it("la ficha del plan elegido enseña sus cuotas y lo que decide", () => {
    render(<PlanCatalogueTab slug="s" spaceId="sp" action={null} catalogue={catalogue()} selectedId={PREMIUM_PLUS} timeZone="Europe/Madrid" />);
    expect(screen.getByText(t.catalogue.quotaSmall(25))).toBeTruthy();
    expect(screen.getByText(t.catalogue.quotaLarge(1))).toBeTruthy();
    expect(screen.getByText(t.catalogue.reportLevels.complete)).toBeTruthy();
    expect(screen.getByText(t.catalogue.hours(24))).toBeTruthy();
    // Las condiciones vigentes son las de la versión más alta.
    expect(screen.getByText(/Soporte prioritario/)).toBeTruthy();
  });

  it("RN-COM-01 · Básico no incluye ningún cambio, y se dice", () => {
    render(<PlanCatalogueTab slug="s" spaceId="sp" action={null} catalogue={catalogue()} selectedId={BASICO} timeZone="Europe/Madrid" />);
    expect(screen.getByText(t.catalogue.nothingIncluded)).toBeTruthy();
  });

  it("RN-COM-19 · sin manage_space no se ofrece crear ni editar, y se dice por qué", () => {
    render(
      <PlanCatalogueTab
        slug="s"
        spaceId="sp"
        action="editar"
        catalogue={catalogue({ canPublish: false })}
        selectedId={PREMIUM_PLUS}
        timeZone="Europe/Madrid"
      />,
    );
    expect(screen.queryByRole("link", { name: t.edit.createPlan })).toBeNull();
    expect(screen.queryByRole("link", { name: t.edit.editPlan })).toBeNull();
    expect(screen.queryByRole("form", { name: t.edit.editPlan })).toBeNull();
    expect(screen.getByText(t.catalogue.editingReadOnly)).toBeTruthy();
  });

  it("RN-COM-20 · editar un plan con restaurantes avisa de que nace una versión", () => {
    render(
      <PlanCatalogueTab
        slug="s"
        spaceId="sp"
        action="editar"
        catalogue={catalogue()}
        selectedId={PREMIUM_PLUS}
        timeZone="Europe/Madrid"
      />,
    );
    const form = screen.getByRole("form", { name: t.edit.editPlan });
    expect(within(form).getByText(t.edit.createsVersion(2))).toBeTruthy();
    expect((within(form).getByLabelText(t.edit.priceLabel) as HTMLInputElement).value).toBe("599,00");
    expect(screen.getByRole("form", { name: t.edit.archiveTitle })).toBeTruthy();
  });

  it("RN-COM-21 · editar un plan que nadie tiene se hace en el sitio", () => {
    render(
      <PlanCatalogueTab
        slug="s"
        spaceId="sp"
        action="editar"
        catalogue={catalogue()}
        selectedId={BASICO}
        timeZone="Europe/Madrid"
      />,
    );
    expect(screen.getByText(t.edit.inPlace)).toBeTruthy();
  });

  it("RN-COM-27 · un plan archivado lo dice y no se edita", () => {
    const archivado = plan({ id: BASICO, name: "Básico", priceCents: 9900, archived: true });
    render(
      <PlanCatalogueTab
        slug="s"
        spaceId="sp"
        action="editar"
        catalogue={catalogue({ plans: [archivado], planRevisions: [archivado] })}
        selectedId={BASICO}
        timeZone="Europe/Madrid"
      />,
    );
    expect(screen.getAllByText(t.catalogue.archived).length).toBeGreaterThan(0);
    expect(screen.queryByRole("form", { name: t.edit.editPlan })).toBeNull();
  });

  it("crear plan abre el formulario vacío", () => {
    render(
      <PlanCatalogueTab slug="s" spaceId="sp" action="crear" catalogue={catalogue()} selectedId={null} timeZone="Europe/Madrid" />,
    );
    const form = screen.getByRole("form", { name: t.edit.newPlanTitle });
    expect(within(form).getByLabelText(t.edit.nameLabel)).toBeTruthy();
  });

  it("un catálogo que no se pudo leer lo dice", () => {
    render(
      <PlanCatalogueTab slug="s" spaceId="sp" action={null} catalogue={catalogue({ plans: [], failed: true })} selectedId={null} timeZone="Europe/Madrid" />,
    );
    expect(screen.getByText(t.catalogue.loadFailed)).toBeTruthy();
  });
});

describe("M54 · Servicios", () => {
  it("RN-COM-08 · Menú Diario con sus dos precios, sus 30 actualizaciones y sus 3 plantillas", () => {
    render(<ServicesTab slug="s" spaceId="sp" action={null} catalogue={catalogue()} selectedId={null} timeZone="Europe/Madrid" />);
    expect(document.body.textContent).toContain(t.catalogue.premiumPrice(euros(19900)));
    expect(screen.getByText(t.catalogue.updatesValue(30))).toBeTruthy();
    expect(screen.getByText(t.catalogue.templatesValue(3))).toBeTruthy();
    expect(screen.getByText(t.catalogue.restaurantsCount(1))).toBeTruthy();
  });
});

describe("M55 · Versiones", () => {
  it("RN-DAT-07 · la vigente es la más alta y se compara con la anterior", () => {
    render(
      <VersionsTab
        slug="s"
        catalogue={catalogue()}
        subject={{ type: "plan", id: PREMIUM_PLUS }}
        requestedVersion={null}
        requestedRevision={null}
        revisionDiff={[]}
        subscribers={[]}
        timeZone="Europe/Madrid"
      />,
    );
    const historial = screen.getByTestId("planes-versiones");
    expect(within(historial).getAllByRole("link")[0].textContent).toContain("v2");
    expect(screen.getByText("Soporte prioritario.")).toBeTruthy();
    expect(screen.getByText("Soporte.")).toBeTruthy();
  });

  it("la primera versión no tiene con qué compararse", () => {
    render(
      <VersionsTab
        slug="s"
        catalogue={catalogue()}
        subject={{ type: "plan", id: PREMIUM_PLUS }}
        requestedVersion={1}
        requestedRevision={null}
        revisionDiff={[]}
        subscribers={[]}
        timeZone="Europe/Madrid"
      />,
    );
    expect(screen.getByText(t.versions.firstVersion)).toBeTruthy();
  });

  it("enseña en qué versión está cada restaurante", () => {
    render(
      <VersionsTab
        slug="s"
        catalogue={catalogue()}
        subject={{ type: "plan", id: PREMIUM_PLUS }}
        requestedVersion={null}
        requestedRevision={null}
        revisionDiff={[]}
        subscribers={[
          {
            subscriptionId: "s1",
            establishmentId: "e1",
            name: "Magariños",
            terms: {
              subjectName: "Premium+",
              current: { versionId: "v2", version: 2, publishedAt: "2026-08-10T10:00:00Z", conditions: "x" },
              accepted: { version: 1, acceptedAt: "2026-06-20T10:00:00Z", channel: "in_app", evidenceFileId: null },
              status: "outdated",
            },
          },
          { subscriptionId: "s2", establishmentId: "e2", name: "La Encina", terms: null },
        ]}
        timeZone="Europe/Madrid"
      />,
    );
    const lista = screen.getByTestId("planes-suscriptores");
    expect(lista.textContent).toContain(t.terms.statusOutdated(1, 2));
    expect(lista.textContent).toContain(t.versions.acceptanceUnknown);
  });

  it("sin manage_space no se ofrece publicar", () => {
    render(
      <VersionsTab
        slug="s"
        catalogue={catalogue({ canPublish: false })}
        subject={null}
        requestedVersion={null}
        requestedRevision={null}
        revisionDiff={[]}
        subscribers={[]}
        timeZone="Europe/Madrid"
      />,
    );
    expect(screen.getByText(t.versions.readOnly)).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.terms.publishSubmit })).toBeNull();
  });
});

describe("RN-COM-30 · las versiones del precio y las cuotas", () => {
  const V1 = plan({ id: BASICO, name: "Básico", priceCents: 9900, supersededAt: "2026-09-01T10:00:00Z" });
  const V2 = plan({ id: MENU + "0", name: "Básico", priceCents: 12900, revision: 2 });
  const conVersiones = catalogue({
    plans: [{ ...V2, lineageId: BASICO }],
    planRevisions: [V1, { ...V2, lineageId: BASICO }],
    revisionStatus: [
      {
        subscriptionId: "s9",
        establishmentId: "e9",
        kind: "plan",
        currentId: BASICO,
        currentRevision: 1,
        headId: V2.id,
        headRevision: 2,
        movesAt: "2026-10-14T07:00:00Z",
        harms: true,
        accepted: false,
        state: "held_back",
      },
    ],
  });

  it("lista las versiones y dice qué empeora y que pide aceptación", () => {
    render(
      <VersionsTab
        slug="s"
        catalogue={conVersiones}
        subject={{ type: "plan", id: V2.id }}
        requestedVersion={null}
        requestedRevision={null}
        revisionDiff={[{ field: "price_cents", oldValue: "9900", newValue: "12900", better: false }]}
        subscribers={[{ subscriptionId: "s9", establishmentId: "e9", name: "Casa Nueve", terms: null }]}
        timeZone="Europe/Madrid"
      />,
    );
    expect(within(screen.getByTestId("planes-revisiones")).getAllByRole("link")).toHaveLength(2);
    const comparativa = screen.getByTestId("planes-comparativa");
    expect(comparativa.textContent).toContain(t.revisions.fields.price_cents);
    expect(comparativa.textContent).toContain(t.revisions.worse);
    expect(screen.getByText(t.revisions.harmsNote)).toBeTruthy();
    // RN-COM-24 · quien no aceptó sigue en la anterior, y se ve.
    expect(screen.getByTestId("planes-suscriptores").textContent).toContain(t.revisions.states.held_back);
  });
});

describe("M56 · Asignación y cambio (lista)", () => {
  const rows = [
    {
      id: "e1",
      name: "Magariños",
      code: "EST-0001",
      planId: PREMIUM_PLUS,
      planLineageId: PREMIUM_PLUS,
      planName: "Premium+",
      planPriceCents: 59900,
      services: ["Menú Diario"],
      commitmentEndsAt: null,
      commitmentCurrent: false,
      renewsAt: null,
    },
    {
      id: "e3",
      name: "Mesa Norte",
      code: "EST-0003",
      planId: null,
      planLineageId: null,
      planName: null,
      planPriceCents: null,
      services: [],
      commitmentEndsAt: null,
      commitmentCurrent: false,
      renewsAt: null,
    },
  ];

  it("filtra por plan y lleva a la ficha de cada restaurante", () => {
    render(
      <RestaurantsTab
        slug="s"
        rows={rows}
        plans={[{ id: PREMIUM_PLUS, name: "Premium+" }]}
        planFilter={PREMIUM_PLUS}
        revisionStatus={[]}
        timeZone="Europe/Madrid"
      />,
    );
    const tabla = screen.getByTestId("planes-restaurantes");
    expect(tabla.textContent).toContain("Magariños");
    expect(tabla.textContent).not.toContain("Mesa Norte");
    expect(within(tabla).getByRole("link", { name: t.manageLink }).getAttribute("href")).toBe("/espacios/s/planes/e1");
  });

  it("no tener plan es un dato, no un hueco", () => {
    render(<RestaurantsTab slug="s" rows={rows} plans={[]} planFilter={null} revisionStatus={[]} timeZone="Europe/Madrid" />);
    expect(screen.getByTestId("planes-restaurantes").textContent).toContain(t.noPlan);
  });
});

describe("M56 · confirmar el cambio", () => {
  it("RN-COM-15 · el botón que cobra no se habilita hasta marcar que se ha revisado", async () => {
    const { ConfirmPlanChangeForm } = await import("./PlanForms");
    const { fireEvent } = await import("@testing-library/react");
    render(<ConfirmPlanChangeForm subscriptionId="sub" planId={PREMIUM_PLUS} mode="now" />);
    const boton = screen.getByRole("button", { name: t.upgradeNowSubmit }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: t.change.reviewed }));
    expect(boton.disabled).toBe(false);
  });
});
