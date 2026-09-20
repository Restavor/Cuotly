import { describe, expect, it } from "vitest";

import { es } from "@/i18n/es";

import {
  activeDestination,
  BAR_KEYS,
  CLIENT_ROLES,
  createOptions,
  DESTINATION_ICONS,
  desktopMenu,
  desktopMenuGroups,
  hrefWithoutAnchor,
  isClientRole,
  isStaffRole,
  mobileNav,
  moreDestinations,
  type ShellRole,
} from "./navigation";

const SLUG = "restavor";
const REST = "84000000-0000-0000-0000-000000000001";

/**
 * Quién es del equipo y quién es el restaurante.
 *
 * No es una comprobación de permisos —eso es del servidor—, pero decide
 * qué PANTALLA se sirve, y equivocarse le da a un restaurante la ficha
 * interna del equipo o un 404 en la suya. Que es exactamente lo que
 * pasaba: `role !== "client"` dejaba a `client_daily_menu` del lado del
 * equipo, y el layout del espacio lo echaba con un 404 en todas sus
 * pantallas porque un restaurante no puede leer `spaces`.
 */
describe("de qué lado está cada rol (§20.3)", () => {
  it("el restaurante es cliente tenga o no Menú Diario contratado", () => {
    expect(isClientRole("client")).toBe(true);
    expect(isClientRole("client_daily_menu")).toBe(true);
    // El que rompía: contratar Menú Diario no convierte a nadie en equipo.
    expect(isStaffRole("client_daily_menu")).toBe(false);
  });

  it("el equipo es el equipo", () => {
    for (const role of ["owner", "admin", "worker"] as const) {
      expect(isStaffRole(role), role).toBe(true);
      expect(isClientRole(role), role).toBe(false);
    }
  });

  it("todo rol cae en un lado o en el otro: uno nuevo sin clasificar hace fallar esto", () => {
    // `es.roles` tiene una entrada por rol porque el armazón pinta su
    // nombre (`roleLabel`), así que sirve de lista de todos los que hay.
    const todos = Object.keys(es.roles) as ShellRole[];
    expect(todos.length).toBeGreaterThan(0);
    for (const role of todos) {
      expect(isClientRole(role) !== isStaffRole(role), role).toBe(true);
    }
    expect(todos.filter(isClientRole).sort()).toEqual([...CLIENT_ROLES].sort());
  });
});

/**
 * §20.3, reescrito el 19/09/2026 (decisión 47): **una sola barra**, la
 * misma para todos los roles — Inicio · Restaurantes · Crear · Mensajes ·
 * Más—, con el Crear central que NO es un destino.
 *
 * Hasta ese día había cuatro barras distintas, una por rol, y estos tests
 * las vigilaban. Se reescriben porque la regla cambió, no porque estorbaran.
 */
describe("§20.3 · una sola barra, la misma para todos", () => {
  it("§20.3: los mismos cuatro destinos, en el mismo orden, para cada rol", () => {
    for (const role of ["owner", "admin", "worker", "client", "client_daily_menu"] as const) {
      expect(mobileNav(SLUG, role, REST).map((d) => d.key), role).toEqual([...BAR_KEYS]);
    }
  });

  it("§20.3: son cuatro y no cinco porque el Crear central no es un destino", () => {
    // Si estuviera aquí con un `href` falso, `activeDestination()` podría
    // marcarlo como activo, y una acción no está nunca "activa".
    for (const role of ["owner", "admin", "worker", "client", "client_daily_menu"] as const) {
      expect(mobileNav(SLUG, role, REST).some((d) => d.key === "create"), role).toBe(false);
      // Y sigue existiendo como acción, que es donde le toca.
      expect(createOptions(SLUG, role, REST).length, role).toBeGreaterThan(0);
    }
  });

  it("§20.3: Más sigue siendo el último, que es el que desborda", () => {
    for (const role of ["owner", "admin", "worker", "client", "client_daily_menu"] as const) {
      const bar = mobileNav(SLUG, role, REST);
      expect(bar[bar.length - 1]?.key, role).toBe("more");
    }
  });
});

describe("CA-21 · el mismo destino se llama igual en las dos superficies", () => {
  it("CA-21: cada destino de móvil que existe en escritorio lleva su misma etiqueta", () => {
    const escritorio = new Map(desktopMenu(SLUG).map((d) => [d.key, d.label]));
    for (const role of ["owner", "admin", "worker", "client"] as const) {
      for (const destino of mobileNav(SLUG, role, REST)) {
        const enEscritorio = escritorio.get(destino.key);
        if (enEscritorio !== undefined) {
          expect(destino.label, `${role}/${destino.key}`).toBe(enEscritorio);
        }
      }
    }
  });
});

describe("Los destinos del cliente son SUYOS, no los del equipo", () => {
  it("un cliente con su restaurante identificado navega dentro de él", () => {
    const destinos = new Map(mobileNav(SLUG, "client", REST).map((d) => [d.key, d.href]));
    // Inicio y Mensajes son de SU panel.
    expect(destinos.get("home")).toBe(`/espacios/${SLUG}/restaurantes/${REST}`);
    expect(destinos.get("messages")).toBe(`/espacios/${SLUG}/restaurantes/${REST}#mensajes`);
    // "Restaurantes" va al Inicio global a propósito: los suyos pueden estar
    // en varios espacios de mantenimiento y esa lista solo existe allí
    // (RN-GLO-03). No se inventa una ruta nueva.
    expect(destinos.get("establishments")).toBe("/#mis-paneles");
    // "Más" es la misma ruta para todos: decide su contenido por rol.
    expect(destinos.get("more")).toBe(`/espacios/${SLUG}/mas`);
  });

  it("ningún destino de cliente cae en una ruta del equipo", () => {
    // `/espacios/<slug>/solicitudes` y `/trabajos` son del equipo: un
    // cliente que llegara ahí vería un 404 o una pantalla sin permiso.
    for (const role of ["client", "client_daily_menu"] as const) {
      for (const destino of mobileNav(SLUG, role, REST)) {
        expect(destino.href, `${role}/${destino.key}`).not.toMatch(
          /^\/espacios\/[^/]+\/(solicitudes|trabajos|finanzas|equipo|informes)/,
        );
      }
      for (const opcion of createOptions(SLUG, role, REST)) {
        expect(opcion.href, `${role}/${opcion.key}`).not.toMatch(
          /^\/espacios\/[^/]+\/(solicitudes|trabajos|finanzas|equipo|informes)/,
        );
      }
    }
  });

  it("sin restaurante identificado, el cliente va al Inicio global y no a una ruta del equipo", () => {
    // Antes iba a "/", que era el selector de contexto. Desde la decisión 42
    // la raíz ES el Inicio global, y desde la 47 la barra lo nombra. Lo que
    // no puede pasar es que caiga en una pantalla del equipo.
    for (const destino of mobileNav(SLUG, "client")) {
      const esGlobal = hrefWithoutAnchor(destino.href) === "/";
      const esMas = destino.href === `/espacios/${SLUG}/mas`;
      expect(esGlobal || esMas, `${destino.key} → ${destino.href}`).toBe(true);
    }
    expect(createOptions(SLUG, "client")[0]?.href).toBe("/");
  });

  it("el equipo no se ve afectado: sus destinos siguen colgando del espacio", () => {
    for (const destino of mobileNav(SLUG, "owner", REST)) {
      expect(destino.href.startsWith(`/espacios/${SLUG}`)).toBe(true);
    }
  });
});

describe("§20.3 · 'Más' es el resto, y se deriva en vez de escribirse", () => {
  const ROLES = ["owner", "admin", "worker", "client", "client_daily_menu"] as const;

  it("ningún destino de la barra se repite en 'Más'", () => {
    for (const role of ROLES) {
      const enLaBarra = new Set(mobileNav(SLUG, role, REST).map((d) => d.key));
      const enMas = moreDestinations(SLUG, role, REST).map((d) => d.key);
      expect(enMas.filter((key) => enLaBarra.has(key))).toEqual([]);
    }
  });

  it("entre la barra y 'Más' está TODO el menú del equipo: nada se queda sin puerta en móvil", () => {
    for (const role of ["owner", "admin", "worker"] as const) {
      const alcanzables = new Set([
        ...mobileNav(SLUG, role, null).map((d) => d.key),
        ...moreDestinations(SLUG, role, null).map((d) => d.key),
      ]);
      for (const destino of desktopMenu(SLUG)) {
        expect(alcanzables.has(destino.key)).toBe(true);
      }
    }
  });

  it("§20.1 y HU-05: las dos acciones de cuenta están siempre, que en móvil no hay otro sitio", () => {
    for (const role of ROLES) {
      const claves = moreDestinations(SLUG, role, REST).map((d) => d.key);
      expect(claves).toContain("switchSpace");
      expect(claves).toContain("sessions");
    }
  });

  it("al cliente no se le ofrece ninguna ruta del equipo", () => {
    for (const role of ["client", "client_daily_menu"] as const) {
      for (const destino of moreDestinations(SLUG, role, REST)) {
        // Sus destinos cuelgan de su restaurante, o son de su cuenta.
        const suyo =
          destino.href.startsWith(`/espacios/${SLUG}/restaurantes/${REST}`) ||
          destino.href === "/" ||
          destino.href === "/cuenta/sesiones";
        expect(suyo).toBe(true);
      }
    }
  });

  it("Menú Diario solo se le ofrece a quien lo tiene contratado", () => {
    const conServicio = [
      ...mobileNav(SLUG, "client_daily_menu", REST),
      ...moreDestinations(SLUG, "client_daily_menu", REST),
    ].map((d) => d.key);
    const sinServicio = [
      ...mobileNav(SLUG, "client", REST),
      ...moreDestinations(SLUG, "client", REST),
    ].map((d) => d.key);

    expect(conServicio).toContain("dailyMenu");
    expect(sinServicio).not.toContain("dailyMenu");
  });

  it("sin saber de qué restaurante hablamos, el cliente va al selector y no a un 404", () => {
    for (const destino of moreDestinations(SLUG, "client", null)) {
      expect(destino.href.startsWith(`/espacios/${SLUG}/restaurantes/`)).toBe(false);
    }
  });
});

describe("El menú lateral se pinta con iconos, y ninguno falta", () => {
  it("todo destino del menú de §20.2 tiene icono", () => {
    const sinIcono = desktopMenu(SLUG)
      .filter((d) => DESTINATION_ICONS[d.key] === undefined)
      .map((d) => d.key);

    expect(sinIcono, "añade su icono en DESTINATION_ICONS").toEqual([]);
  });

  it("todo destino de móvil y de Crear tiene icono", () => {
    const claves = new Set(
      (["owner", "admin", "worker", "client", "client_daily_menu"] as const).flatMap((role) => [
        ...mobileNav(SLUG, role, REST).map((d) => d.key),
        ...moreDestinations(SLUG, role, REST).map((d) => d.key),
      ]),
    );

    expect([...claves].filter((k) => DESTINATION_ICONS[k] === undefined)).toEqual([]);
  });

  it("el menú de escritorio se parte en dos grupos sin perder ni repetir destinos", () => {
    const { main, footer } = desktopMenuGroups(SLUG);
    expect([...main, ...footer].map((d) => d.key)).toEqual(desktopMenu(SLUG).map((d) => d.key));
    expect(footer.map((d) => d.key)).toEqual(["agent", "settings"]);
  });
});

describe("El destino activo es el más concreto, no el primero que casa", () => {
  it("la ficha de un trabajo activa Trabajos, no Inicio", () => {
    const activo = activeDestination(SLUG, `/espacios/${SLUG}/trabajos/${REST}`);
    expect(activo?.key).toBe("jobs");
  });

  it("la raíz del espacio activa Inicio", () => {
    expect(activeDestination(SLUG, `/espacios/${SLUG}`)?.key).toBe("home");
    // Con barra final es la misma pantalla: si no, el menú se quedaría sin
    // marcar y la miga de pan sin nombre.
    expect(activeDestination(SLUG, `/espacios/${SLUG}/`)?.key).toBe("home");
  });

  it("un prefijo a medias no activa nada por parecerse", () => {
    // `/tareasx` no es `/tareas`: se compara por segmentos completos.
    expect(activeDestination(SLUG, `/espacios/${SLUG}/tareasx`)?.key).not.toBe("tasks");
  });

  it("una ruta de otro espacio no activa ningún destino de este", () => {
    expect(activeDestination(SLUG, "/espacios/otro/trabajos")).toBeNull();
  });
});
