import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import { SETTINGS_TABS, parseSettingsTab, settingsTabHref } from "./tabs";

/**
 * Las ocho pestañas de "Ajustes del espacio" (página 109 del diseño).
 *
 * Lo que esta suite vigila no es que haya ocho, sino lo que se rompe al
 * meterlas: **las direcciones que ya existían**. `/ajustes/suscripcion` y
 * `/ajustes/auditoria` son destinos de avisos ya emitidos
 * —`run_cuotly_storage_sweep()` manda a la suscripción— y RN-NOT-04 dice
 * que un aviso abre el elemento exacto. Un enlace profundo que deja de
 * funcionar es un aviso roto.
 */
describe("Ajustes del espacio · las ocho pestañas (página 109)", () => {
  it("son las ocho del diseño, en su orden", () => {
    expect(SETTINGS_TABS.map((t) => t.key)).toEqual([
      "general",
      "schedule",
      "taxes",
      "integrations",
      "subscription",
      "security",
      "audit",
      "notifications",
    ]);
  });

  it("cada una tiene nombre en español, y ninguno sobra", () => {
    expect(SETTINGS_TABS.map((t) => t.key).sort()).toEqual(Object.keys(es.settings.tabs).sort());
  });

  it("ninguna dirección se repite", () => {
    expect(new Set(SETTINGS_TABS.map((t) => t.slug)).size).toBe(SETTINGS_TABS.length);
  });

  it("RN-NOT-04 · Suscripción y Auditoría conservan SU ruta, no pasan a `?vista=`", () => {
    // Si alguien las convierte en pestañas normales, los avisos ya
    // emitidos dejan de abrir lo que dicen que abren.
    expect(settingsTabHref("demo", SETTINGS_TABS.find((t) => t.key === "subscription")!)).toBe(
      "/espacios/demo/ajustes/suscripcion",
    );
    expect(settingsTabHref("demo", SETTINGS_TABS.find((t) => t.key === "audit")!)).toBe(
      "/espacios/demo/ajustes/auditoria",
    );
  });

  it("las otras seis viajan en la dirección, para poder compartir el enlace", () => {
    expect(settingsTabHref("demo", SETTINGS_TABS.find((t) => t.key === "schedule")!)).toBe(
      "/espacios/demo/ajustes?vista=horarios",
    );
    expect(settingsTabHref("demo", SETTINGS_TABS.find((t) => t.key === "notifications")!)).toBe(
      "/espacios/demo/ajustes?vista=notificaciones",
    );
  });

  it("una vista desconocida enseña General, no un hueco", () => {
    expect(parseSettingsTab(undefined).key).toBe("general");
    expect(parseSettingsTab("inventada").key).toBe("general");
    expect(parseSettingsTab("horarios").key).toBe("schedule");
    expect(parseSettingsTab("impuestos").key).toBe("taxes");
  });

  it("todo lo que la página pinta cuelga de alguna pestaña", () => {
    // El falso-cerrado del refactor: la página era una columna larga y
    // cada bloque se envolvió a mano. Si alguien añade una Card nueva y se
    // olvida de la condición, queda visible en TODAS las pestañas — que es
    // exactamente el aspecto de "no se ha roto nada".
    const fuente = readFileSync(
      join(process.cwd(), "src/app/espacios/[slug]/ajustes/page.tsx"),
      "utf8",
    );
    const cuerpo = fuente.slice(fuente.indexOf("<nav aria-label={es.settings.title}"));
    const condiciones = [...cuerpo.matchAll(/vista\.key === "(\w+)"/g)].map((m) => m[1]);
    expect(condiciones.length, "la página no envuelve nada en pestañas").toBeGreaterThan(0);

    const claves = new Set(SETTINGS_TABS.filter((t) => t.route === null).map((t) => t.key));
    for (const condicion of condiciones) {
      expect(claves.has(condicion as never), `"${condicion}" no es una pestaña con vista`).toBe(true);
    }

    // Y cada pestaña sin ruta propia pinta algo: una pestaña vacía es peor
    // que no tenerla.
    for (const clave of claves) {
      expect(condiciones, `la pestaña "${clave}" no pinta nada`).toContain(clave);
    }
  });
});
