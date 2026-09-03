import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createOptions, desktopMenu, mobileNav, type ShellRole } from "./navigation";

const SLUG = "restavor";
const REST = "84000000-0000-0000-0000-000000000001";
const ROLES: readonly ShellRole[] = ["owner", "admin", "worker", "client", "client_daily_menu"];

/**
 * Barrido en falso-cerrado sobre la navegación: **todo destino que el
 * armazón pinta tiene que llevar a una ruta que exista**, y el que no
 * exista tiene que estar clasificado aquí abajo con su motivo.
 *
 * Por qué hace falta. El menú de §20.2 se escribió entero en el Hito 8,
 * antes que las pantallas, así que durante semanas hubo destinos que
 * llevaban a un 404 sin que nada lo dijera. Ya pasó dos veces: la ficha de
 * "Restaurantes" no existía y los destinos del cliente apuntaban a rutas
 * del equipo. Las dos se encontraron a mano, tarde.
 *
 * Este test no exige que estén todas hechas —la Fase 1 sigue en marcha—:
 * exige que nadie AÑADA un destino nuevo sin ruta y sin decirlo, y que
 * quien construya una de las pendientes tenga que venir a borrarla de la
 * lista. Un destino que ni existe ni está en la lista hace fallar el test.
 */
/**
 * La clave es la RUTA, no la clave del destino: la misma clave sirve a dos
 * sitios distintos según el rol —"messages" lleva al equipo a
 * `/mensajes`, que no existe, y al cliente a su propio restaurante, que
 * sí—, así que clasificar por clave taparía una ruta rota. Lo enseñó este
 * mismo test en su primera ejecución.
 */
const PENDIENTES: Readonly<Record<string, string>> = {
  // §20.2 · destinos del menú de escritorio cuyo hito todavía no ha
  // llegado. El ROADMAP los enumera en las salvedades del Hito 8.
  "/espacios/[slug]/tareas":
    "HU-21 · servidor y puntos de carga hechos (src/core/load-points.ts); sin pantalla.",
  "/espacios/[slug]/mensajes":
    "§66.2 · la conversación interna de un trabajo, distinta de la de la solicitud.",
  "/espacios/[slug]/informes": "Fase 3. §20.2 pide su estructura con estado vacío; todavía no está.",
  "/espacios/[slug]/menu-diario":
    "Fase 2. §20.2 pide su estructura con estado vacío; todavía no está.",
  "/espacios/[slug]/planes": "HU-07 · asignar plan y servicios y ver el ciclo vigente; sin pantalla.",
  "/espacios/[slug]/ajustes": "HU-36 · la auditoría del espacio; sin pantalla.",
  // §20.3 · el sexto elemento de la barra de móvil.
  "/espacios/[slug]/mas": "§20.3 · la pantalla 'Más' con el resto de destinos; sin construir.",
  // §20.5 · opciones del botón Crear.
  "/espacios/[slug]/restaurantes/nuevo":
    "El formulario de nuevo restaurante vive dentro del inicio del espacio, no en esta ruta.",
  // §20.3 · Menú Diario del restaurante, Fase 2.
  "/espacios/[slug]/restaurantes/[id]/menu-diario": "Fase 2 · Menú Diario del restaurante.",
};

/**
 * De una URL a la ruta del App Router que la serviría. El slug y el
 * identificador del restaurante son segmentos dinámicos: se sustituyen por
 * el nombre de la carpeta que los recoge.
 */
function routePathOf(href: string): string {
  return href
    .split("?")[0]
    .replace(`/espacios/${SLUG}`, "/espacios/[slug]")
    .replace(`/restaurantes/${REST}`, "/restaurantes/[id]");
}

function routeExists(href: string): boolean {
  return existsSync(join(process.cwd(), "src/app", routePathOf(href), "page.tsx"));
}

function destinosDeLaAplicacion() {
  const todos = [
    ...desktopMenu(SLUG),
    ...ROLES.flatMap((role) => [...mobileNav(SLUG, role, REST), ...createOptions(SLUG, role, REST)]),
  ];
  // El selector de contexto ("/") no es una ruta del espacio: es la
  // portada, y tiene su propia página.
  return todos.filter((d) => d.href !== "/");
}

describe("§20.2/§20.3/§20.5 · ningún destino del armazón lleva a un 404 sin avisar", () => {
  it("cada destino tiene ruta, o está clasificado como pendiente con su motivo", () => {
    const rotos: string[] = [];

    for (const destino of destinosDeLaAplicacion()) {
      if (routeExists(destino.href)) continue;
      if (routePathOf(destino.href) in PENDIENTES) continue;
      rotos.push(`${destino.key} → ${routePathOf(destino.href)}`);
    }

    expect(
      rotos,
      "destinos sin ruta y sin clasificar: constrúyelos o añádelos a PENDIENTES con su motivo",
    ).toEqual([]);
  });

  it("la lista de pendientes no se queda con destinos ya construidos", () => {
    // El otro lado del falso-cerrado: si alguien construye la pantalla y
    // no borra su línea, la lista empieza a mentir sobre lo que falta.
    const yaHechos = destinosDeLaAplicacion()
      .filter((d) => routePathOf(d.href) in PENDIENTES && routeExists(d.href))
      .map((d) => routePathOf(d.href));

    expect(
      [...new Set(yaHechos)],
      "estos destinos ya tienen pantalla: quítalos de PENDIENTES",
    ).toEqual([]);
  });
});
