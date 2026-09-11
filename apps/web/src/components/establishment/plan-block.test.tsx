import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import type { SheetData } from "./Sheet";
import { EstablishmentSheet } from "./Sheet";
import { MANAGEMENT_BLOCKS, SHEET_TABS } from "./tabs";

/**
 * Vista 13 · "Gestión — Plan y servicios", pintada.
 *
 * Lo que se comprueba aquí no es el aspecto: es qué se afirma. La maqueta
 * enseña un plan con sus barras de uso, una renovación, una permanencia y
 * una tarjeta de servicio con "Actualizaciones 12/30" y "Versión aceptada
 * v2.1". Tres de esos datos **no existen** en Cuotly —el uso de un
 * servicio, el segundo precio de RN-COM-08 y el bloque legal entero—, así
 * que lo que esta suite vigila es que la pantalla diga el motivo en vez de
 * rellenar el hueco con un número que nadie ha contado (CLAUDE.md MUST
 * NOT, CA-20).
 */
const t = es.establishmentSheet;

afterEach(cleanup);

const GESTION = SHEET_TABS.find((tab) => tab.key === "management")!;
const BLOQUE_PLAN = MANAGEMENT_BLOCKS.find((block) => block.key === "plan")!;

const sinOperacion: SheetData["operation"] = {
  requests: { shown: [], hidden: 0 },
  jobs: { shown: [], hidden: 0 },
  tasks: { shown: [], hidden: 0 },
};

function sheetData(
  header: Partial<SheetData["header"]>,
  bags: SheetData["summary"]["bags"] = [],
): SheetData {
  return {
    header: {
      id: "est-1",
      name: "Magariños",
      code: "EST-0048",
      status: "active",
      groupId: "g-1",
      groupName: "Grupo Magariños",
      planId: "p-1",
      planName: "Premium",
      planPriceCents: 59900,
      services: [],
      commitmentEndsAt: null,
      commitmentStartedAt: null,
      cycleStart: null,
      cycleEnd: null,
      identity: {
        legalName: null,
        taxId: null,
        address: null,
        postalCode: null,
        city: null,
        contactName: null,
        contactEmail: null,
        phonePrimary: null,
        phoneSecondary: null,
        websiteUrl: null,
        instagram: null,
        facebookUrl: null,
        domain: null,
        openingHours: null,
        webPlatform: null,
      },
      ...header,
    },
    canEditData: false,
    summary: {
      bags,
      attention: [],
      pendingValidation: [],
      openRequests: 0,
      currentJob: null,
      liveJobs: 0,
      payment: { allowed: false, outstandingCents: 0, overdueCount: 0 },
    },
    operation: sinOperacion,
    counts: { requestsByState: [], jobsByState: [], files: 0 },
    today: "2026-09-11",
    payments: { allowed: false, charges: [], payments: [] },
    users: { rows: [], failed: false },
    files: { files: [], selected: null, categories: [], category: null },
    history: [],
  };
}

function pintar(
  header: Partial<SheetData["header"]> = {},
  bags: SheetData["summary"]["bags"] = [],
) {
  return render(
    <EstablishmentSheet
      base="/espacios/demo/restaurantes/est-1"
      slug="demo"
      tab={GESTION}
      block={BLOQUE_PLAN}
      data={sheetData(header, bags)}
    />,
  );
}

function tarjeta(titulo: string): HTMLElement {
  const encabezado = screen.getByRole("heading", { name: titulo });
  return encabezado.closest("section") ?? encabezado.parentElement!.parentElement!;
}

describe("vista 13 · el plan", () => {
  it("enseña el plan con su precio + IVA", () => {
    pintar();
    const card = within(tarjeta(t.planTitle));
    expect(card.getByText("Premium")).toBeInTheDocument();
    expect(card.getByText("599,00 € + IVA / mes")).toBeInTheDocument();
  });

  it("las barras de uso son las bolsas del ciclo, con su número escrito", () => {
    // El número va además de la barra: una barra sola obliga a estimar a
    // ojo y a quien no la ve no le dice nada.
    pintar({}, [
      { category: "small", included: 25, remaining: 17 },
      { category: "photo", included: 24, remaining: 18 },
    ]);
    const card = within(tarjeta(t.planTitle));
    expect(card.getByText(t.cycleUsed(8, 25))).toBeInTheDocument();
    expect(card.getByText(t.cycleUsed(6, 24))).toBeInTheDocument();
  });

  it("sin ciclo abierto no se inventa una fecha de renovación: se dice", () => {
    pintar({ cycleEnd: null });
    const card = within(tarjeta(t.planTitle));
    expect(card.getByText(t.renewalNone)).toBeInTheDocument();
    expect(card.queryByText(t.renewalAutomatic)).not.toBeInTheDocument();
  });

  it("con ciclo abierto da la fecha y dice que la renovación es automática", () => {
    pintar({ cycleEnd: "2026-10-01T00:00:00.000Z" });
    const card = within(tarjeta(t.planTitle));
    expect(card.getByText(t.renewalAutomatic)).toBeInTheDocument();
  });

  it("sin plan no se pinta una tarjeta vacía: se dice que no hay plan y por qué", () => {
    // RN-COM-11: el plan de mantenimiento es opcional. "Sin plan" no es un
    // error ni un hueco.
    pintar({ planName: null, planId: null, planPriceCents: null });
    const card = within(tarjeta(t.planTitle));
    expect(card.getByText(t.planNone)).toBeInTheDocument();
    expect(card.getByText(t.planNoneReason)).toBeInTheDocument();
  });
});

describe("vista 13 · los servicios", () => {
  const menuDiario = {
    subscriptionId: "s-1",
    name: "Menú Diario",
    priceCents: 22900,
    startedAt: "2026-07-01T00:00:00.000Z",
  };

  it("enseña el servicio contratado con su precio de catálogo", () => {
    pintar({ services: [menuDiario] });
    const card = within(tarjeta(t.servicesTitle));
    expect(card.getByText("Menú Diario")).toBeInTheDocument();
    expect(card.getByText("229,00 € + IVA / mes")).toBeInTheDocument();
  });

  it("NO inventa el uso del servicio: dice por qué no hay ninguno", () => {
    // La maqueta enseña "Actualizaciones 12/30". Ese contador no existe:
    // las bolsas del ciclo son las cuatro categorías del plan y Menú
    // Diario es Fase 2. Un 12 pintado aquí sería un dato inventado.
    pintar({ services: [menuDiario] });
    const card = within(tarjeta(t.servicesTitle));
    expect(card.getByText(t.serviceUsageEmptyTitle)).toBeInTheDocument();
    expect(card.getByText(t.serviceUsageEmptyReason)).toBeInTheDocument();
    expect(card.queryByText(/12/)).not.toBeInTheDocument();
    expect(card.queryByText(/\/ 30/)).not.toBeInTheDocument();
  });

  it("NO enseña el segundo precio de RN-COM-08 como si se cobrara", () => {
    // 199 € es el precio si el establecimiento tiene plan Premium activo,
    // y cuál de los dos se aplica no lo decide todavía ninguna función:
    // la mensualidad de un servicio ni siquiera se emite. Escribir 199
    // aquí sería afirmar que se le cobra eso.
    pintar({ services: [menuDiario] });
    expect(within(tarjeta(t.servicesTitle)).queryByText(/199/)).not.toBeInTheDocument();
  });

  it("NO enseña versión aceptada ni condiciones: el bloque legal está aplazado", () => {
    pintar({ services: [menuDiario] });
    const card = within(tarjeta(t.servicesTitle));
    expect(card.queryByText(/v2\.1/)).not.toBeInTheDocument();
    expect(card.queryByRole("link", { name: /condiciones/i })).not.toBeInTheDocument();
  });

  it("sin servicios lo dice, con su motivo", () => {
    pintar({ services: [] });
    const card = within(tarjeta(t.servicesTitle));
    expect(card.getByText(t.servicesNone)).toBeInTheDocument();
    expect(card.getByText(t.servicesNoneReason)).toBeInTheDocument();
  });
});
