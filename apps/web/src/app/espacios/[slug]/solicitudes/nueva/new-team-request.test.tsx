import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";

vi.mock("./actions", () => ({
  createRequestOnBehalf: async () => ({ error: null, values: {} }),
}));
// La subida va al bucket con una URL firmada: aquí no hay bucket.
vi.mock("@/components/FileUploadField", () => ({ FileUploadField: () => null }));

import { NewTeamRequestForm } from "./NewTeamRequestForm";

const t = es.teamArea.requests.onBehalf;

const RESTAURANTES = [
  { id: "est-1", name: "Magariños", code: "MAG001", groupName: "Restaurantes Centro", photoUrl: null },
  { id: "est-2", name: "Casa Oliva", code: "OLI001", groupName: null, photoUrl: null },
];

function Formulario({ preseleccionado = "" }: { preseleccionado?: string }) {
  return (
    <NewTeamRequestForm
      slug="demo"
      establishments={RESTAURANTES}
      defaultEstablishmentId={preseleccionado}
      idempotencyKey="clave-fija"
    />
  );
}

/**
 * M77 · RN-REQ-08 (decisión 73). Lo que vigila:
 *
 *   · Que "Cómo lo pidió el restaurante" esté y sea obligatorio, igual
 *     que la prioridad y su motivo. El `required` no es el control
 *     —`create_request_on_behalf()` lo comprueba— pero sin él el rechazo
 *     llega tarde.
 *   · Que no haya "Guardar borrador": se envía en un paso.
 *   · Que la clave de idempotencia viaje con el formulario.
 *   · Que la categoría empiece en "Que la proponga la IA" y enseñe
 *     "Pendiente de validación" solo cuando se elige una.
 */
afterEach(cleanup);

describe("RN-REQ-08 · crear una solicitud en nombre del restaurante", () => {
  it("RN-REQ-08: cómo lo pidió, la prioridad y su motivo son obligatorios", () => {
    render(<Formulario />);
    expect(screen.getByLabelText(new RegExp(t.onBehalfLabel))).toBeRequired();
    expect(screen.getByLabelText(new RegExp(`^${t.priorityLabel}`))).toBeRequired();
    expect(screen.getByLabelText(new RegExp(t.priorityReasonLabel))).toBeRequired();
    expect(screen.getByLabelText(new RegExp(t.descriptionLabel))).toBeRequired();
  });

  it("RN-REQ-08: se envía en un paso, sin borrador", () => {
    render(<Formulario />);
    expect(screen.getByRole("button", { name: t.submit })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: es.panelRequests.saveDraft })).not.toBeInTheDocument();
  });

  it("RN-REQ-08: la clave de idempotencia viaja con el formulario", () => {
    const { container } = render(<Formulario />);
    const clave = container.querySelector('input[name="idempotencyKey"]') as HTMLInputElement;
    expect(clave.value).toBe("clave-fija");
  });

  it("RN-REQ-08: sin restaurante preseleccionado se pide elegirlo; con él, se enseña su código y su grupo", () => {
    const { container, unmount } = render(<Formulario />);
    expect((container.querySelector('select[name="establishmentId"]') as HTMLSelectElement).value).toBe("");
    unmount();

    render(<Formulario preseleccionado="est-1" />);
    expect(screen.getByText(`${t.establishmentCode("MAG001")} · Restaurantes Centro`)).toBeInTheDocument();
  });

  it("RN-REQ-08: la categoría empieza en la IA y solo al elegir una dice que está pendiente de validación", () => {
    const { container } = render(<Formulario />);
    const categoria = container.querySelector('select[name="category"]') as HTMLSelectElement;
    expect(categoria.value).toBe("");
    expect(screen.queryByText(t.pendingValidation)).not.toBeInTheDocument();

    fireEvent.change(categoria, { target: { value: "small" } });
    expect(screen.getByText(t.pendingValidation)).toBeInTheDocument();
  });
});
