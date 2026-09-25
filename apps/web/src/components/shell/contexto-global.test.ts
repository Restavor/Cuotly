import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DESTINATION_ICONS,
  GLOBAL_CONTEXTS,
  globalActiveDestination,
  globalCreateOptions,
  globalMenu,
  globalMobileNav,
  globalMoreDestinations,
} from "./navigation";

/**
 * §36 · el contexto global (vistas G01 a G08).
 *
 * Lo que se comprueba aquí es lo que se rompió: que esta zona use **el
 * armazón de todos** y no uno propio. Hasta el 20/09/2026 tenía el suyo
 * —tarjeta blanca, sin iconos, sin cabecera, sin buscador, sin campana y
 * sin avatar—, y como desde la decisión 42 aquí entra todo el mundo al
 * identificarse, la primera pantalla de Cuotly era también la que menos se
 * parecía al diseño.
 */
const RAIZ = join(process.cwd(), "src/app/(global)");
const SHELL = readFileSync(join(process.cwd(), "src/components/shell/AppShell.tsx"), "utf8");

function pantallas(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return pantallas(full);
    return entry.endsWith(".tsx") ? [full] : [];
  });
}

describe("§36 · el contexto global usa el armazón de todos", () => {
  it("§36: su disposición la pone AppShell, no una barra propia", () => {
    const layout = readFileSync(join(RAIZ, "layout.tsx"), "utf8");

    expect(layout).toContain("AppShell");
    expect(layout).toContain('context="global"');
  });

  it("CA-22: ninguna pantalla de §36 abre su propio <main>", () => {
    const culpables = pantallas(RAIZ)
      .filter((file) => !file.endsWith("layout.tsx"))
      .filter((file) => /<main[\s>]/.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(process.cwd(), ""));

    expect(culpables, "el <main> lo pone el armazón, no la pantalla").toEqual([]);
  });

  it("§36: el armazón no pinta caja de contexto en la zona global", () => {
    // No hay espacio del que cambiar ni sitio al que volver: ya estás en la
    // raíz. Se comprueba que la caja y la salida cuelgan de `esGlobal`.
    expect(SHELL).toContain("{esGlobal ? null : (");
  });
});

describe("§36 · los cinco destinos de G01", () => {
  it("§36: son los de la maqueta, en su orden", () => {
    expect(globalMenu().map((d) => [d.key, d.href])).toEqual([
      ["home", "/"],
      ["establishments", "/restaurantes"],
      ["messages", "/mensajes"],
      ["account", "/cuenta"],
      ["help", "/ayuda"],
    ]);
  });

  it("§36: todos tienen icono, y ninguno se queda con un hueco en blanco", () => {
    for (const destino of [
      ...globalMenu(),
      ...globalMobileNav(),
      ...globalMoreDestinations(),
      ...globalCreateOptions(),
    ]) {
      expect(DESTINATION_ICONS[destino.key], destino.key).toBeDefined();
    }
  });

  /*
   * "Inicio" es `/`, y `startsWith("/")` es cierto para todo: sin el caso
   * aparte, las cinco pantallas marcarían Inicio. Es el mismo fallo que ya
   * tuvo la barra anterior y que su comentario dejaba escrito.
   */
  it("§36: Inicio solo está activo en la raíz", () => {
    expect(globalActiveDestination("/")?.key).toBe("home");
    expect(globalActiveDestination("/mensajes")?.key).toBe("messages");
    expect(globalActiveDestination("/restaurantes")?.key).toBe("establishments");
    expect(globalActiveDestination("/cuenta/sesiones")?.key).toBe("account");
    expect(globalActiveDestination("/ayuda")?.key).toBe("help");
  });
});

describe("§20.3 · la barra de móvil del contexto global", () => {
  it("§20.3: son cuatro destinos, y Crear no es uno de ellos", () => {
    expect(globalMobileNav().map((d) => d.key)).toEqual([
      "home",
      "establishments",
      "messages",
      "more",
    ]);
  });

  /*
   * RN-GLO-03 · "Restaurantes" era un ancla del Inicio (`/#mis-paneles`)
   * y en el teléfono no hacía nada: ya estabas en el Inicio. Ahora lleva a
   * su propia pantalla, que existe y separa las dos pestañas.
   */
  it("RN-GLO-03: 'Restaurantes' lleva a su pantalla, con las dos pestañas", () => {
    const destinos = new Map(globalMobileNav().map((d) => [d.key, d.href]));
    expect(destinos.get("establishments")).toBe(GLOBAL_CONTEXTS);

    const pagina = readFileSync(join(RAIZ, "restaurantes/page.tsx"), "utf8");
    expect(pagina).toContain(`pestana("maintenance"`);
    expect(pagina).toContain(`pestana("restaurant"`);
  });

  it("RN-GLO-03: el menú lateral lleva al mismo 'Restaurantes' que la barra, y ya no a 'Mis solicitudes'", () => {
    const lateral = new Map(globalMenu().map((d) => [d.key, d.href]));
    const barra = new Map(globalMobileNav().map((d) => [d.key, d.href]));
    expect(lateral.get("establishments")).toBe(barra.get("establishments"));
    expect(lateral.has("myRequests")).toBe(false);
  });

  it("RN-GLO-03: en 'Restaurantes' la barra lo marca como activo", () => {
    expect(globalActiveDestination("/restaurantes")?.key).toBe("establishments");
    expect(globalActiveDestination("/")?.key).toBe("home");
  });

  it("§20.3: 'Más' recoge lo que no cabe en la barra, sin repetir nada", () => {
    const enLaBarra = new Set(globalMobileNav().map((d) => d.key));
    const enMas = globalMoreDestinations().map((d) => d.key);

    expect(enMas.filter((key) => enLaBarra.has(key))).toEqual([]);
    // Los dos del menú lateral que la barra deja fuera.
    expect(enMas).toContain("myRequests");
    expect(enMas).toContain("account");
    expect(enMas).toContain("help");
  });
});

describe("§36 · salir de Cuotly sigue siendo posible", () => {
  /*
   * El botón de cerrar sesión vivía en la barra lateral vieja, que era el
   * único sitio del producto que lo ofrecía. Al pasar esta zona al armazón
   * del diseño —cinco destinos, sin un sexto— se habría perdido sin que
   * fallara nada.
   */
  it("RN-GLO-06: 'Cerrar sesión' está en Mi cuenta", () => {
    // Desde G05 lo pinta la vista de Mi cuenta, que la página monta.
    const pagina = readFileSync(join(RAIZ, "cuenta/page.tsx"), "utf8");
    const vista = readFileSync(join(RAIZ, "cuenta/AccountView.tsx"), "utf8");
    expect(pagina).toContain("<AccountView");
    expect(vista).toContain("signOut");
  });
});
