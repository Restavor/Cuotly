import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";

import { ArchiveButton } from "../DeletionForms";
import { PermanentDeleteButton, RecoverButton } from "./ArchivedActions";

vi.mock("../actions", () => ({
  platformDelete: vi.fn(),
  platformRestore: vi.fn(),
  platformRecover: vi.fn(),
  platformDeletePermanently: vi.fn(),
}));

afterEach(cleanup);

const t = es.platformAdmin.archived;
const td = es.platformAdmin.deletion;

describe("Decisión 82 · Archivados en el panel de Cuotly", () => {
  it("RN-ADM-22 · en las listas de activos el botón es Archivar, y dice que pasa a Archivados", () => {
    render(
      <ArchiveButton
        kind="establishment"
        id="r1"
        name="Casa uno"
        title={td.establishmentTitle("Casa uno")}
        hint={td.establishmentHint}
      />,
    );
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: td.archiveAction }));
    expect(screen.getByText(td.nothingIsErased)).toBeTruthy();
  });

  it("RN-ADM-23 · recuperar es un clic: un botón que envía, sin motivo ni confirmación", () => {
    const { container } = render(<RecoverButton kind="space" id="s1" />);
    const boton = screen.getByRole("button", { name: t.recover });
    expect(boton.getAttribute("type")).toBe("submit");
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector('input:not([type="hidden"])')).toBeNull();
    const ocultos = [...container.querySelectorAll('input[type="hidden"]')] as HTMLInputElement[];
    expect(Object.fromEntries(ocultos.map((i) => [i.name, i.value]))).toEqual({ kind: "space", id: "s1" });
  });

  it("RN-ADM-24 · eliminar pide confirmación antes: aviso, motivo y escribir el nombre", () => {
    render(<PermanentDeleteButton kind="establishment" id="r2" name="Casa dos" />);
    // Nada se envía con el primer clic: solo abre la confirmación.
    expect(screen.queryByLabelText(td.reasonLabel)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: t.deleteAction }));

    expect(screen.getByText(t.deleteWarning)).toBeTruthy();
    expect(screen.getByText(t.deleteEstablishmentHint)).toBeTruthy();
    const motivo = screen.getByLabelText(td.reasonLabel) as HTMLTextAreaElement;
    const nombre = screen.getByLabelText(td.confirmationLabel("Casa dos")) as HTMLInputElement;
    expect(motivo.required).toBe(true);
    expect(nombre.required).toBe(true);
    expect(screen.getByRole("button", { name: t.deleteConfirm }).getAttribute("type")).toBe("submit");
  });

  it("RN-ADM-24 · el aviso de un espacio dice que su propietario tampoco lo recupera", () => {
    render(<PermanentDeleteButton kind="space" id="s2" name="Espacio dos" />);
    fireEvent.click(screen.getByRole("button", { name: t.deleteAction }));
    expect(screen.getByText(t.deleteSpaceTitle("Espacio dos"))).toBeTruthy();
    expect(screen.getByText(t.deleteSpaceHint)).toBeTruthy();
  });
});
