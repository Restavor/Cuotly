import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";

import { AppShell, type ShellContext } from "./AppShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/espacios/restavor" }));
vi.mock("@/app/administracion/actions", () => ({ leaveSupportSession: vi.fn() }));

/**
 * §20.1 · en escritorio, "Cambiar de espacio" funciona como la tarjeta de
 * móvil: la caja del menú lateral despliega todos tus espacios y paneles y
 * desde ahí se cambia. Volver al Inicio global es otro enlace, el de
 * debajo ("Volver al inicio de Cuotly"), y no la caja.
 */
afterEach(cleanup);

const CONTEXTOS: readonly ShellContext[] = [
  { key: "s1", kind: "space", name: "Restavor", detail: "Propietario del espacio", href: "/espacios/restavor" },
  { key: "s2", kind: "space", name: "Otro espacio", detail: "Trabajador", href: "/espacios/otro" },
  {
    key: "p1",
    kind: "panel",
    name: "Casa Pepe",
    detail: "Panel de restaurante",
    href: "/espacios/otro/restaurantes/est-1",
  },
];

function pintar(contexts: readonly ShellContext[]) {
  return render(
    <AppShell
      spaceSlug="restavor"
      spaceName="Restavor"
      role="owner"
      roleLabel="Propietario del espacio"
      userInitial="B"
      userLabel="Bosco"
      notifications={[]}
      onSearch={async () => []}
      contexts={contexts}
    >
      <p>contenido</p>
    </AppShell>,
  );
}

describe("§20.1 · la caja de contexto del menú lateral", () => {
  it("abre un desplegable con los espacios y paneles, no un enlace al Inicio global", () => {
    pintar(CONTEXTOS);
    const aside = screen.getByRole("complementary");
    const resumen = within(aside).getByLabelText(
      `Restavor · Propietario del espacio · ${es.nav.switchSpace}`,
    );
    expect(resumen.tagName).toBe("SUMMARY");
    expect(resumen.closest("a")).toBeNull();

    const lista = within(aside).getByTestId("sidebar-context-picker");
    expect(within(lista).getByText(es.nav.contextPicker.maintenance)).toBeTruthy();
    expect(within(lista).getByText(es.nav.contextPicker.restaurants)).toBeTruthy();
    expect(within(lista).getByRole("link", { name: /Otro espacio/ }).getAttribute("href")).toBe(
      "/espacios/otro",
    );
    expect(within(lista).getByRole("link", { name: /Casa Pepe/ }).getAttribute("href")).toBe(
      "/espacios/otro/restaurantes/est-1",
    );
    expect(
      within(lista).getByRole("link", { name: /Restavor/ }).getAttribute("aria-current"),
    ).toBe("page");
  });

  it("volver al Inicio global sigue siendo el enlace de debajo", () => {
    pintar(CONTEXTOS);
    const aside = screen.getByRole("complementary");
    expect(
      within(aside).getByRole("link", { name: es.globalContext.backToCuotly }).getAttribute("href"),
    ).toBe("/");
  });

  it("con un solo contexto no promete un desplegable que no hay", () => {
    pintar(CONTEXTOS.slice(0, 1));
    const aside = screen.getByRole("complementary");
    expect(aside.querySelector("details")).toBeNull();
    expect(within(aside).queryByText(es.nav.switchSpace)).toBeNull();
    expect(within(aside).getByRole("link", { name: es.globalContext.backToCuotly })).toBeTruthy();
  });
});
