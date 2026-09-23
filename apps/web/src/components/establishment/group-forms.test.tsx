import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isPreviousAccessChoice } from "@/app/espacios/[slug]/restaurantes/grupos/group-action-state";
import { es } from "@/i18n/es";

import { AssignEstablishmentForm, CreateGroupForm, MoveToGroupForm } from "./GroupForms";

/**
 * RN-EST-20 · los formularios de grupos, pintados.
 *
 * Lo que vigila: que al mover **no haya ninguna opción marcada por
 * defecto** (qué pasa con quien entraba por el grupo de origen lo decide
 * una persona), que los destinos sean los que da el servidor, y que crear
 * lleve su clave de idempotencia.
 */
vi.mock("@/app/espacios/[slug]/restaurantes/grupos/actions", () => ({
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  moveEstablishmentToGroup: vi.fn(),
}));

const t = es.teamArea.groups;

afterEach(cleanup);

describe("RN-EST-20 · quien entraba por el grupo de origen", () => {
  it("las dos opciones están y ninguna viene marcada", () => {
    render(
      <MoveToGroupForm
        establishmentId="est-1"
        targets={[{ id: "g-2", name: "Grupo Costa" }]}
      />,
    );
    const editor = screen.getByRole("radio", { name: new RegExp(t.previousAccess.keep_as_editor.title) });
    const fuera = screen.getByRole("radio", { name: new RegExp(t.previousAccess.revoke.title) });
    expect(editor).not.toBeChecked();
    expect(fuera).not.toBeChecked();
    expect(editor).toBeRequired();
  });

  it("solo se aceptan las dos elecciones, nada por defecto", () => {
    expect(isPreviousAccessChoice("keep_as_editor")).toBe(true);
    expect(isPreviousAccessChoice("revoke")).toBe(true);
    expect(isPreviousAccessChoice("")).toBe(false);
    expect(isPreviousAccessChoice("editor")).toBe(false);
    expect(isPreviousAccessChoice(null)).toBe(false);
  });
});

describe("RN-EST-20 · los destinos y lo que se asigna", () => {
  it("cambiar de grupo ofrece los grupos que da el servidor, sin elegir ninguno", () => {
    render(
      <MoveToGroupForm
        establishmentId="est-1"
        targets={[
          { id: "g-2", name: "Grupo Costa" },
          { id: "g-3", name: "Grupo Norte" },
        ]}
      />,
    );
    const select = screen.getByRole("combobox", { name: t.moveTargetLabel });
    expect(select).toHaveValue("");
    expect(screen.getByRole("option", { name: "Grupo Costa" })).toHaveValue("g-2");
    expect(screen.getByRole("option", { name: "Grupo Norte" })).toHaveValue("g-3");
  });

  it("asignar ofrece los restaurantes de otros grupos, con el grupo en el que están", () => {
    render(
      <AssignEstablishmentForm
        groupId="g-1"
        establishments={[{ id: "est-9", label: t.assignOption("Magariños", "EST-0003", "Grupo A") }]}
      />,
    );
    expect(
      screen.getByRole("option", { name: "Magariños · EST-0003 · ahora en Grupo A" }),
    ).toHaveValue("est-9");
  });

  it("crear un grupo lleva su clave de idempotencia", () => {
    const { container } = render(
      <CreateGroupForm spaceId="s-1" slug="demo" idempotencyKey="clave-1" />,
    );
    expect(container.querySelector('input[name="idempotencyKey"]')).toHaveValue("clave-1");
    expect(screen.getByRole("textbox", { name: t.nameLabel })).toBeRequired();
  });
});
