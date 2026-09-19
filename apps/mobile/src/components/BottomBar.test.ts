import { BAR_KEYS, createOptions, mobileNav, type ShellRole } from "@/components/shell/navigation";

import { barDestinations, createDestinations } from "./BottomBar";

const ROLES: readonly ShellRole[] = ["owner", "admin", "worker", "client", "client_daily_menu"];
const REST = "est-1";

/**
 * §20.3, reescrito el 19/09/2026 (decisión 47) · **una sola barra**, la
 * misma para todos: Inicio · Restaurantes · Crear · Mensajes · Más.
 *
 * Hasta ese día eran cuatro barras distintas, una por rol, y estos tests
 * las vigilaban. Se reescriben porque la regla cambió.
 */
describe("RN-MOV-02 · la barra de §20.3 es la de la web, no una copia", () => {
  it("los mismos destinos, en el mismo orden, para los cinco roles", () => {
    for (const role of ROLES) {
      expect(barDestinations("demo", role, REST).map((d) => d.key)).toEqual([...BAR_KEYS]);
    }
  });

  it("devuelve exactamente lo que devuelve mobileNav() de la web", () => {
    for (const role of ROLES) {
      expect(barDestinations("demo", role, REST)).toEqual(mobileNav("demo", role, REST));
    }
  });

  it("el último sigue siendo Más, que es el que desborda", () => {
    for (const role of ROLES) {
      const bar = barDestinations("demo", role, REST);
      expect(bar[bar.length - 1]?.key).toBe("more");
    }
  });
});

/**
 * El Crear central **no es un destino**: es la acción de §20.5. Si
 * estuviera en la lista con una ruta, el subrayado de "activo" podría
 * posarse en él, y una acción no está nunca activa.
 */
describe("§20.5 · el Crear central es una acción, no una pestaña", () => {
  it("no aparece entre los destinos de la barra", () => {
    for (const role of ROLES) {
      expect(barDestinations("demo", role, REST).some((d) => d.key === "create")).toBe(false);
    }
  });

  it("sus opciones salen de createOptions() de la web, las mismas que en escritorio", () => {
    for (const role of ROLES) {
      expect(createDestinations("demo", role, REST)).toEqual(createOptions("demo", role, REST));
    }
  });

  it("todo rol tiene al menos una opción: si no, la hoja diría su motivo", () => {
    for (const role of ROLES) {
      expect(createDestinations("demo", role, REST).length).toBeGreaterThan(0);
    }
  });
});

/**
 * Las rutas son las de la web (RN-MOV-01), pero **no todas cuelgan del
 * espacio**: desde la decisión 47 "Restaurantes" lleva al restaurante a su
 * Inicio global, porque los suyos pueden estar en varios espacios de
 * mantenimiento y esa lista solo existe allí (RN-GLO-03).
 */
describe("RN-MOV-01 · las rutas son las de la web", () => {
  it("el equipo navega dentro de su espacio, y nada más", () => {
    for (const role of ["owner", "admin", "worker"] as const) {
      for (const d of barDestinations("demo", role, null)) {
        expect(d.href.startsWith("/espacios/demo")).toBe(true);
      }
    }
  });

  it("al restaurante no se le ofrece ninguna ruta interna del equipo", () => {
    for (const role of ["client", "client_daily_menu"] as const) {
      for (const d of barDestinations("demo", role, REST)) {
        expect(d.href).not.toMatch(
          /^\/espacios\/[^/]+\/(solicitudes|trabajos|tareas|finanzas|equipo|informes|planes|ajustes)/,
        );
      }
    }
  });

  it("ningún destino llega al router con un fragmento sin resolver", () => {
    // `expo-router` casa rutas de ficheros y no sabe de anclas: el armazón
    // navega con `navigableHref()`, y esto comprueba que lo que se le pasa
    // tiene siempre una ruta detrás.
    for (const role of ROLES) {
      for (const d of barDestinations("demo", role, REST)) {
        expect(d.href.split("#")[0].length).toBeGreaterThan(0);
      }
    }
  });
});
