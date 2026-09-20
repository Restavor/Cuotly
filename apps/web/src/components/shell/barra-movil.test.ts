import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BAR_KEYS, DESTINATION_ICONS } from "./navigation";

/**
 * §20.3 (decisión 47) · la barra inferior de móvil:
 *
 *     Inicio · Restaurantes · Crear (+) · Mensajes · Más
 *
 * Lo que se comprueba aquí no es cómo se ve —eso se mira— sino las dos
 * cosas que se rompieron de verdad y que un cambio despistado vuelve a
 * romper sin que falle nada más.
 */
const SHELL = readFileSync(join(process.cwd(), "src/components/shell/AppShell.tsx"), "utf8");

describe("§20.3 · la barra de móvil", () => {
  /*
   * "Más" pedía prestado el icono de Crear (`plus`). En la barra los dos
   * salen uno al lado del otro, así que eran dos `+` seguidos con
   * significados distintos: uno crea algo y el otro abre una lista.
   */
  it("§20.3: 'Más' no comparte icono con la acción Crear", () => {
    expect(DESTINATION_ICONS.more).not.toBe("plus");
  });

  it("§20.3: todos los destinos de la barra tienen icono propio", () => {
    const iconos = BAR_KEYS.map((key) => DESTINATION_ICONS[key]);

    expect(iconos.filter((icono) => icono === undefined)).toEqual([]);
    expect(new Set(iconos).size, "dos destinos de la barra con el mismo icono").toBe(
      BAR_KEYS.length,
    );
  });

  /*
   * §20.5 llama "global" al botón Crear, y el diseño lo pone en el centro
   * de esta barra. Estuvo solo en la cabecera, donde a 390 px competía por
   * el sitio con otros tres controles y dejaba la miga de pan en "Arm…".
   *
   * Que esté en los DOS sitios a la vez tampoco vale: es la misma acción
   * ofrecida dos veces en la misma pantalla. Por eso el de la cabecera se
   * esconde por debajo de `lg`.
   */
  it("§20.3: Crear está en la barra inferior y la cabecera no lo repite en móvil", () => {
    expect(SHELL).toContain('data-testid="mobile-create-menu"');

    const cabecera = SHELL.slice(SHELL.indexOf('data-testid="create-menu"'));
    const etiqueta = cabecera.slice(0, cabecera.indexOf(">"));
    expect(etiqueta, "el Crear de la cabecera debe esconderse en móvil").toContain("hidden lg:block");
  });

  /*
   * La barra es del diseño: verde oscuro, no una fila de texto sobre
   * blanco. Se comprueba el fondo porque es lo que la distinguía de un
   * pie de página cualquiera.
   */
  it("§20.3: la barra va sobre el verde oscuro del menú", () => {
    const barra = SHELL.slice(SHELL.indexOf('data-testid="mobile-nav"'));
    expect(barra.slice(0, barra.indexOf(">"))).toContain("bg-primary-dark");
  });
});
