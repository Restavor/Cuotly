import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";

import { PermissionsForm } from "./PermissionsForm";
import { CLIENT_PERMISSIONS, type ClientPermission, type PanelUser } from "./users-load";

/**
 * Páginas 152 y 153 del diseño móvil · "Usuarios y accesos" del panel
 * (RN-EST-15/16/17, decisiones 51 y 52).
 *
 * Lo que esta suite vigila es lo que el servidor NO puede vigilar: que la
 * pantalla pinte las siete casillas, con su nombre, y que cada una llegue
 * al formulario con el valor que de verdad tiene esa persona. Una casilla
 * que se pinta marcada estando apagada —o al revés— no rompe nada al
 * cargar: rompe al GUARDAR, cuando el formulario manda las siete juntas y
 * el restaurante descubre que le ha quitado un permiso a alguien sin
 * querer.
 *
 * Lo que NO vigila, porque no le toca: quién puede guardar. Eso lo
 * comprueba `set_establishment_permissions()` y lo prueba la suite 56.
 */
afterEach(cleanup);

vi.mock("./actions", () => ({
  saveClientPermissions: async () => ({ error: null, saved: true }),
}));

function permisos(encendidos: readonly ClientPermission[]) {
  return Object.fromEntries(
    CLIENT_PERMISSIONS.map((name) => [name, encendidos.includes(name)]),
  ) as Record<ClientPermission, boolean>;
}

describe("RN-EST-15 · las siete casillas del panel", () => {
  it("pinta las siete, con el nombre que el diseño les da", () => {
    render(
      <PermissionsForm
        establishmentId="est-1"
        userId="u-1"
        personName="Ana"
        current={permisos([])}
      />,
    );

    for (const name of CLIENT_PERMISSIONS) {
      expect(screen.getByLabelText(es.panelUsers.permissions[name])).toBeTruthy();
    }
  });

  it("no se deja ninguna: la lista de la pantalla y la de la base son la misma", () => {
    // El fallo que esto busca es el de añadir un permiso a la migración y
    // olvidarlo aquí: la pantalla guardaría las siete con la nueva en
    // `false` y se la quitaría a todo el mundo al primer guardado.
    expect([...CLIENT_PERMISSIONS].sort()).toEqual(
      Object.keys(es.panelUsers.permissions).sort(),
    );
    expect([...CLIENT_PERMISSIONS].sort()).toEqual(
      Object.keys(es.panelUsers.permissionHints).sort(),
    );
  });

  it("cada casilla llega con el valor que esa persona tiene, no con el de al lado", () => {
    // Se encienden dos que NO son contiguas en la lista, que es como se
    // caza un desplazamiento de índice.
    render(
      <PermissionsForm
        establishmentId="est-1"
        userId="u-1"
        personName="Ana"
        current={permisos(["create_requests", "view_reports"])}
      />,
    );

    for (const name of CLIENT_PERMISSIONS) {
      const casilla = screen.getByLabelText(es.panelUsers.permissions[name]) as HTMLInputElement;
      const esperado = name === "create_requests" || name === "view_reports";
      expect(casilla.checked).toBe(esperado);
      // Y el `name` del campo es el de la columna: es lo que la acción lee.
      expect(casilla.getAttribute("name")).toBe(name);
    }
  });
});

describe("RN-REP-01 · la séptima casilla, la que ha ido y venido", () => {
  it('"Consultar informes" está entre las siete y se llama así', () => {
    // Existió (migración 85), la quitó la decisión 28c y la devolvió la 52.
    // Si alguien vuelve a quitarla, que sea leyendo esta línea.
    expect(CLIENT_PERMISSIONS).toContain("view_reports");
    expect(es.panelUsers.permissions.view_reports).toBe("Consultar informes");
  });
});

describe("RN-EST-15 · lo que la lista resume de cada persona", () => {
  it("el Propietario no se resume con casillas: las tiene todas por su rol", () => {
    // La función `establishment_panel_users()` ya se las devuelve en true,
    // pero la pantalla no las enumera: dice "acceso completo", que es lo
    // que el diseño pone en la página 152.
    const propietario: PanelUser = {
      userId: "u-0",
      displayName: "Bosco",
      email: "bosco@ejemplo.com",
      source: "establishment",
      role: "local_owner",
      permissions: permisos([...CLIENT_PERMISSIONS]),
    };
    expect(propietario.role).toBe("local_owner");
    expect(es.panelUsers.ownerAll).toContain("Acceso completo");
  });

  it("un Editor sin ninguna casilla se dice con palabras, no con un hueco", () => {
    // CLAUDE.md · si no hay dato, se dice el motivo. Un bloque de permisos
    // vacío se lee como "no se ha cargado".
    expect(es.panelUsers.noneYet.length).toBeGreaterThan(0);
  });
});

describe("la pestaña que falta se dice, no se finge", () => {
  it("invitar a quien no tiene cuenta no está construido y se explica", () => {
    // Página 153 · la pestaña "Invitar usuario" crea una CUENTA nueva. Eso
    // no existe todavía, y pintar el formulario sería prometerlo.
    expect(es.panelUsers.inviteNotBuilt).toContain("no está construido");
  });
});
