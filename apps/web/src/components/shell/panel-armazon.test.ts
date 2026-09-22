import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { es } from "@/i18n/es";

import {
  desktopMenu,
  desktopMenuGroups,
  fullNav,
  isClientRole,
  PANEL_ANCHORS,
  PANEL_ROUTES,
  sidebarGroups,
  type ShellRole,
} from "./navigation";

const SLUG = "restavor";
const OTRO = "otro-espacio";
const REST = "84000000-0000-0000-0000-000000000001";

const CLIENTES: readonly ShellRole[] = ["client", "client_daily_menu"];
const EQUIPO: readonly ShellRole[] = ["owner", "admin", "worker"];

/**
 * §40 · RN-PAN · el panel del restaurante como contexto propio.
 *
 * Lo que estos tests vigilan es el defecto que la decisión 46 vino a
 * arreglar: hasta el 17/09/2026 el armazón pintaba **siempre** el menú del
 * equipo en la barra lateral de escritorio, también para un restaurante.
 * Un cliente veía ahí los catorce destinos del espacio —Trabajos, Tareas,
 * Equipo, Finanzas, Planes, Ajustes— y cada uno le daba una pantalla sin
 * permiso o un 404.
 *
 * No era un agujero: quién puede leer qué lo deciden RLS y las funciones
 * del servidor, y eso no cambió nunca (CLAUDE.md: ocultar un botón no es
 * un control de acceso, y enseñarlo tampoco concede nada). Era catorce
 * puertas que no son suyas, ofrecidas por su nombre.
 */
describe("RN-PAN-07 · la barra lateral es la de quien mira", () => {
  it("RN-PAN-07: al restaurante no se le ofrece NINGUNA ruta del equipo", () => {
    const delEquipo = new Set(desktopMenu(SLUG).map((d) => d.href));

    for (const role of CLIENTES) {
      const { main, footer } = sidebarGroups(SLUG, role, REST);
      const todos = [...main, ...footer];
      expect(todos.length, role).toBeGreaterThan(0);

      for (const destino of todos) {
        // El ancla no cuenta: `…/restaurantes/<id>#mensajes` es su propia
        // pantalla, no una del espacio.
        const sinAncla = destino.href.split("#")[0];
        expect(delEquipo.has(sinAncla), `${role} · ${destino.key} → ${destino.href}`).toBe(false);
        expect(sinAncla.startsWith(`/espacios/${SLUG}/restaurantes/${REST}`), destino.key).toBe(true);
      }
    }
  });

  it("RN-PAN-07: el equipo sigue viendo exactamente el menú de §20.2", () => {
    for (const role of EQUIPO) {
      expect(sidebarGroups(SLUG, role, null), role).toEqual(desktopMenuGroups(SLUG));
    }
  });

  it("la barra del panel es la superficie completa del cliente, sin perder ni repetir", () => {
    for (const role of CLIENTES) {
      const { main, footer } = sidebarGroups(SLUG, role, REST);
      const claves = [...main, ...footer].map((d) => d.key);
      expect(new Set(claves).size, role).toBe(claves.length);
      expect(claves.slice().sort()).toEqual(
        fullNav(SLUG, role, REST)
          .map((d) => d.key)
          .sort(),
      );
    }
  });

  it("§131 · Ayuda es lo único que va al pie del panel: no hay Ajustes del espacio ni Agente", () => {
    for (const role of CLIENTES) {
      const { footer } = sidebarGroups(SLUG, role, REST);
      expect(footer.map((d) => d.key), role).toEqual(["help"]);
    }
  });
});

/**
 * Las tres filas que iban al mismo sitio. El panel del restaurante es hoy
 * una pantalla larga con todos sus bloques, así que "Solicitudes", "Nueva
 * solicitud" y "Mensajes" apuntaban los tres a la misma dirección exacta.
 * En la barra de móvil no se notaba —son iconos que se pulsan de uno en
 * uno—; en una barra lateral son tres filas seguidas que no dicen a qué
 * parte llevan.
 */
describe("RN-PAN-07 · las anclas del panel llevan a algún sitio de verdad", () => {
  const PAGINA = join(
    process.cwd(),
    "src/app/espacios/[slug]/restaurantes/[id]/page.tsx",
  );

  it("R05, R06 y R20 · ya no queda ninguna ancla: cada destino del panel es su pantalla", () => {
    expect(Object.keys(PANEL_ANCHORS)).toEqual([]);
    // La página del restaurante ya no se lee para buscar anclas.
    expect(readFileSync(PAGINA, "utf8").length).toBeGreaterThan(0);
  });

  it("R05, R06 y R20 · Solicitudes, Nueva solicitud y Mensajes son pantallas con su page.tsx", () => {
    for (const [clave, ruta] of Object.entries(PANEL_ROUTES)) {
      const pagina = join(
        process.cwd(),
        `src/app/espacios/[slug]/restaurantes/[id]${ruta}/page.tsx`,
      );
      expect(existsSync(pagina), `${clave} → ${ruta}`).toBe(true);
    }
  });

  it("los destinos que comparten pantalla se distinguen por su ancla", () => {
    for (const role of CLIENTES) {
      const destinos = fullNav(SLUG, role, REST);
      const conAncla = destinos.filter((d) => d.href.includes("#"));
      expect(conAncla.length, role).toBe(Object.keys(PANEL_ANCHORS).length);
      // Ninguna dirección repetida: era justo el defecto.
      const hrefs = destinos.map((d) => d.href);
      expect(new Set(hrefs).size, role).toBe(hrefs.length);
    }
  });

  it("sin restaurante identificado no se inventa un ancla colgando de la nada", () => {
    for (const role of CLIENTES) {
      for (const destino of fullNav(SLUG, role, null)) {
        expect(destino.href, `${role} · ${destino.key}`).toBe("/");
      }
    }
  });
});

/**
 * RN-PAN-03 · el nombre del espacio de mantenimiento no se le enseña al
 * restaurante. Es la misma frontera que tapa la identidad de quien hace su
 * trabajo (P7): el espacio es organización interna del equipo.
 */
describe("RN-PAN-03 y RN-PAN-05 · lo que dice la cabecera del panel", () => {
  it("el panel tiene su propio nombre de contexto y su propio menú accesible", () => {
    expect(es.restaurantPanel.label).toBe("Panel de restaurante");
    expect(es.restaurantPanel.menuLabel).not.toBe(es.nav.menuLabel);
  });

  it("RN-PAN-05: el texto del selector solo tiene sentido con más de uno", () => {
    expect(es.restaurantPanel.switchHint(2)).toContain("otro");
    expect(es.restaurantPanel.switchHint(3)).toContain("3");
  });
});

/**
 * RN-PAN-04 · cambiar de restaurante puede cambiar de espacio, y la
 * dirección tiene que seguirlo. Si el selector construyera el enlace con
 * el espacio en el que ya estás, llevaría a un restaurante que no está
 * ahí y el servidor contestaría un 404 — o, peor, nada.
 */
describe("RN-PAN-04 · el selector cruza la frontera entre espacios", () => {
  it("un restaurante de otro espacio se alcanza por el espacio suyo, no por el actual", () => {
    for (const role of CLIENTES) {
      const destinos = fullNav(OTRO, role, REST);
      for (const destino of destinos) {
        expect(destino.href.startsWith(`/espacios/${OTRO}/restaurantes/${REST}`), destino.key).toBe(
          true,
        );
      }
    }
  });

  it("todo rol de cliente pasa por esta comprobación: uno nuevo sin clasificar la rompe", () => {
    const todos = (Object.keys(es.roles) as ShellRole[]).filter(isClientRole);
    expect(todos.slice().sort()).toEqual([...CLIENTES].slice().sort());
  });
});
