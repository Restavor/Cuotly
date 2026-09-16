import { mobileNav, type ShellRole } from "@/components/shell/navigation";

import { barDestinations } from "./BottomBar";

const ROLES: readonly ShellRole[] = ["owner", "admin", "worker", "client", "client_daily_menu"];

describe("RN-MOV-02 · la barra de §21 es la de la web, no una copia", () => {
  it("cinco destinos y el último es Más, para los cinco roles", () => {
    for (const role of ROLES) {
      const bar = barDestinations("demo", role, role.startsWith("client") ? "est-1" : null);
      expect(bar).toHaveLength(5);
      expect(bar[bar.length - 1]?.key).toBe("more");
    }
  });

  it("devuelve exactamente lo que devuelve mobileNav() de la web", () => {
    for (const role of ROLES) {
      const establishmentId = role.startsWith("client") ? "est-1" : null;
      expect(barDestinations("demo", role, establishmentId)).toEqual(mobileNav("demo", role, establishmentId));
    }
  });

  it("las rutas son las de la web: todas cuelgan de /espacios/<slug>", () => {
    for (const role of ROLES) {
      for (const d of barDestinations("demo", role, "est-1")) {
        expect(d.href.startsWith("/espacios/demo")).toBe(true);
      }
    }
  });
});
