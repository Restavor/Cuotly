import { moreDestinations, type ShellRole } from "@/components/shell/navigation";

import { navigableHref } from "./routes";

const ROLES: readonly ShellRole[] = ["owner", "admin", "worker", "client", "client_daily_menu"];

describe("RN-MOV-01 · los destinos de la web se navegan en el teléfono", () => {
  it("el ancla se quita, y lo que queda es la pantalla", () => {
    expect(navigableHref("/espacios/demo/restaurantes/est-1#solicitudes")).toBe(
      "/espacios/demo/restaurantes/est-1",
    );
    expect(navigableHref("/espacios/demo/restaurantes/est-1")).toBe("/espacios/demo/restaurantes/est-1");
    expect(navigableHref("/")).toBe("/");
    expect(navigableHref("/espacios/demo/")).toBe("/espacios/demo");
    // R05 y R06 son pantallas de la web que la app tiene dentro del panel.
    expect(navigableHref("/espacios/demo/restaurantes/est-1/solicitudes/nueva")).toBe(
      "/espacios/demo/restaurantes/est-1",
    );
    expect(navigableHref("/espacios/demo/restaurantes/est-1/solicitudes/sol-9")).toBe(
      "/espacios/demo/restaurantes/est-1/solicitudes/sol-9",
    );
  });

  it('ningún destino de "Más" llega a expo-router con un fragmento', () => {
    /*
     * RN-PAN-07 puso ancla a los tres destinos del panel del restaurante,
     * que es lo correcto en un navegador y lo que rompía la app: una ruta
     * con `#` no casa con ninguna de `app/`, así que los tres caían en la
     * pantalla de "esto está en la web" con la pantalla delante.
     *
     * Este barrido es la red: si mañana entra un cuarto destino con ancla,
     * falla aquí y no en el teléfono de un restaurante.
     */
    for (const role of ROLES) {
      const establishmentId = role.startsWith("client") ? "est-1" : null;
      for (const d of moreDestinations("demo", role, establishmentId)) {
        expect(navigableHref(d.href)).not.toContain("#");
        expect(navigableHref(d.href).startsWith("/")).toBe(true);
      }
    }
  });

  it("los tres del panel llevan a la misma pantalla, que es lo que el ancla decía", () => {
    const mas = moreDestinations("demo", "client", "est-1");
    const panel = mas.filter((d) => ["requests", "newRequest", "messages"].includes(d.key));
    expect(panel.length).toBeGreaterThan(0);
    for (const d of panel) {
      expect(navigableHref(d.href)).toBe("/espacios/demo/restaurantes/est-1");
    }
  });
});
