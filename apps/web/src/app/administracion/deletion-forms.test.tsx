import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";

import { AccountDeletionForm } from "./DeletionForms";

vi.mock("./actions", () => ({ platformDelete: vi.fn(), platformRestore: vi.fn() }));

afterEach(cleanup);

const ta = es.platformAdmin.deletion.account;

describe("Decisión 81 · eliminar una cuenta desde el panel", () => {
  it("RN-ADM-19 · de cada espacio de propiedad única se elige a quién pasa, o al azar", () => {
    render(
      <AccountDeletionForm
        userId="ana"
        email="ana@example.com"
        spaces={[
          { spaceId: "a", spaceName: "Espacio A", candidates: [{ userId: "luis", name: "Luis", role: "admin" }] },
        ]}
      />,
    );
    const select = screen.getByLabelText(ta.successorLabel("Espacio A")) as HTMLSelectElement;
    expect(select.name).toBe("successor:a");
    expect(select.value).toBe("");
    expect([...select.options].map((o) => o.textContent)).toEqual([ta.random, `Luis · ${ta.roleAdmin}`]);
  });

  it("RN-ADM-19 · un espacio sin nadie más se dice: se elimina con la cuenta", () => {
    render(
      <AccountDeletionForm
        userId="ana"
        email="ana@example.com"
        spaces={[{ spaceId: "c", spaceName: "Espacio C", candidates: [] }]}
      />,
    );
    expect(screen.getByText(ta.noSuccessor("Espacio C"))).toBeTruthy();
  });

  it("RN-ADM-15 · pide el motivo y escribir el correo para confirmar (§140)", () => {
    render(<AccountDeletionForm userId="ana" email="ana@example.com" spaces={[]} />);
    expect(screen.getByLabelText(es.platformAdmin.deletion.reasonLabel)).toBeTruthy();
    expect(screen.getByLabelText(es.platformAdmin.deletion.confirmationLabel("ana@example.com"))).toBeTruthy();
    expect(screen.getByRole("button", { name: ta.submit })).toBeTruthy();
  });
});
