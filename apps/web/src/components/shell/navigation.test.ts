import { describe, expect, it } from "vitest";

import { createOptions, desktopMenu, mobileNav, moreDestinations } from "./navigation";

const SLUG = "restavor";
const REST = "84000000-0000-0000-0000-000000000001";

describe("§20.3 · la barra de móvil tiene cinco destinos, sean quien sean", () => {
  it("§20.3: cinco destinos exactos para cada rol", () => {
    for (const role of ["owner", "admin", "worker", "client", "client_daily_menu"] as const) {
      expect(mobileNav(SLUG, role).length, role).toBe(5);
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
    const destinos = mobileNav(SLUG, "client", REST);
    const dentro = destinos.filter((d) => d.href.includes(`/restaurantes/${REST}`));
    expect(dentro.length).toBeGreaterThanOrEqual(4);
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

  it("sin restaurante identificado, el cliente va al selector de contexto", () => {
    for (const destino of mobileNav(SLUG, "client")) {
      expect(destino.href === "/" || destino.href.endsWith("/mas")).toBe(true);
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
