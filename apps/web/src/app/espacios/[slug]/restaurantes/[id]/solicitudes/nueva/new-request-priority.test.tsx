import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";

vi.mock("./actions", () => ({
  createRequestDraft: async () => ({ error: null, values: {} }),
}));
// La subida va al bucket con una URL firmada: aquí no hay bucket.
vi.mock("@/components/FileUploadField", () => ({ FileUploadField: () => null }));

import { NewRequestDraftForm } from "./NewRequestDraftForm";

function NewRequestForm({ establishmentId }: { establishmentId: string }) {
  return (
    <NewRequestDraftForm slug="demo" establishmentId={establishmentId} establishmentName="Casa Oliva" photoUrl={null} />
  );
}

/**
 * RN-REQ-05/06 · la prioridad de la solicitud (página 63 del diseño
 * definitivo móvil), en el formulario de R06.
 *
 * Lo que vigila:
 *
 *   · Que los dos campos estén y sean **obligatorios**. El `required` no
 *     es el control —`submit_request()` lo comprueba en el servidor— pero
 *     sin él se manda el formulario y el rechazo llega tarde.
 *   · Que los niveles sean **los tres de la decisión 49** y no otros. Un
 *     cuarto nivel en la pantalla sería un valor que el servidor rechaza.
 *   · Que diga que **no adelanta el trabajo** (RN-REQ-06). Sin esa línea,
 *     marcar "Alta" se lee como una orden, y eso no lo decide el cliente.
 */
afterEach(cleanup);

describe("RN-REQ-05 · prioridad y motivo al pedir un cambio", () => {
  it("los dos campos están y son obligatorios", () => {
    render(<NewRequestForm establishmentId="est-1" />);
    expect(screen.getByLabelText(new RegExp(es.clientArea.newPriorityLabel))).toBeRequired();
    expect(screen.getByLabelText(new RegExp(es.clientArea.newPriorityReasonLabel))).toBeRequired();
  });

  it("los niveles son exactamente Alta, Media y Baja", () => {
    const { container } = render(<NewRequestForm establishmentId="est-1" />);
    const opciones = [...container.querySelectorAll('select[name="priority"] option')].map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(opciones).toEqual(["high", "medium", "low"]);
  });

  it("no hay opción vacía: un obligatorio que empieza en blanco solo produce un error evitable", () => {
    const { container } = render(<NewRequestForm establishmentId="est-1" />);
    const select = container.querySelector('select[name="priority"]') as HTMLSelectElement;
    expect([...select.options].some((o) => o.value === "")).toBe(false);
    expect(select.value).toBe("medium");
  });

  it("el motivo no deja pasar de 200 caracteres en la propia pantalla", () => {
    // El límite de verdad está en la base; esto solo evita llegar hasta él
    // con media frase escrita de más.
    render(<NewRequestForm establishmentId="est-1" />);
    expect(screen.getByLabelText(new RegExp(es.clientArea.newPriorityReasonLabel))).toHaveAttribute(
      "maxLength",
      "200",
    );
  });

  it("RN-REQ-06 · dice que la prioridad NO adelanta el trabajo", () => {
    render(<NewRequestForm establishmentId="est-1" />);
    expect(screen.getByText(es.clientArea.newPriorityNotAPromise)).toBeInTheDocument();
  });
});

describe("R06 · la nueva solicitud del diseño definitivo", () => {
  it("RN-REQ-09 · el restaurante elige cambio o incidencia; la categoría la sigue decidiendo el equipo (RN-CLS)", () => {
    const { container } = render(<NewRequestForm establishmentId="est-1" />);
    const tipo = container.querySelector('select[name="kind"]') as HTMLSelectElement;
    expect([...tipo.options].map((o) => o.value)).toEqual(["change", "incident"]);
    // Por omisión, un cambio: es lo que era toda solicitud antes de la decisión 83.
    expect(tipo.value).toBe("change");
    expect(screen.getByText(es.requestIncidents.kindHint)).toBeInTheDocument();
    // No hay ningún campo de categoría que el restaurante pueda tocar.
    expect(container.querySelector('[name="category"]')).toBeNull();
  });

  it("«Guardar borrador» y «Revisar solicitud» envían el mismo formulario con su intención", () => {
    render(<NewRequestForm establishmentId="est-1" />);
    expect(screen.getByRole("button", { name: es.panelRequests.saveDraft })).toHaveAttribute("value", "save");
    expect(screen.getByRole("button", { name: es.panelRequests.review })).toHaveAttribute("value", "review");
    expect(screen.getByText(es.panelRequests.importantBody)).toBeInTheDocument();
  });
});
