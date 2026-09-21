import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import { EstablishmentSheet } from "./Sheet";
import { sheetFixture } from "./sheet-fixture";
import { MANAGEMENT_BLOCKS, SHEET_TABS } from "./tabs";
import type { SheetData } from "./Sheet";

/**
 * Página 27 · "Contacto del propietario", en Gestión · Datos.
 *
 * Lo que vigila:
 *
 *   · Que el correo y el teléfono sean **enlaces de verdad**. En un
 *     teléfono esto no se lee, se pulsa: un `mailto:` abre el correo y un
 *     `tel:` la llamada. Escritos como texto obligan a copiarlos a mano.
 *   · Que un dato que **falta se diga**, cada uno con su frase: "sin
 *     correo" y "sin teléfono" son cosas distintas, y un hueco no es
 *     ninguna de las dos (P6).
 *   · Que el teléfono se marque **sin espacios**: "+34 600 123 456" con
 *     espacios dentro de un `tel:` no marca en todos los teléfonos.
 *   · Que NO se invente la cara que dibuja el diseño.
 */
const t = es.establishmentSheet;
const GESTION = SHEET_TABS.find((tab) => tab.key === "management")!;
const DATOS = MANAGEMENT_BLOCKS.find((block) => block.key === "establishmentData")!;

function pintar(identity: Partial<SheetData["header"]["identity"]> = {}) {
  const base = sheetFixture();
  return render(
    <EstablishmentSheet
      base="/espacios/demo/restaurantes/est-1"
      slug="demo"
      tab={GESTION}
      block={DATOS}
      data={{
        ...base,
        header: {
          ...base.header,
          identity: {
            ...base.header.identity,
            contactName: "Diego López",
            contactEmail: "diego@magarinos.es",
            phonePrimary: "+34 600 123 456",
            ...identity,
          },
        },
      }}
    />,
  );
}

afterEach(cleanup);

describe("página 27 · Contacto del propietario", () => {
  /**
   * La tarjeta, buscada por su titular. El nombre y el teléfono salen
   * **también** en la ficha de datos de arriba, como en el diseño: uno se
   * edita y el otro se pulsa. No pueden discrepar —leen el mismo campo—,
   * pero sí obligan a decir de cuál de los dos se habla.
   */
  function tarjeta() {
    return within(
      screen.getByText(t.ownerContactTitle).closest("[class*='rounded-']") as HTMLElement,
    );
  }

  it("enseña el nombre de quien firma", () => {
    pintar();
    expect(tarjeta().getByText("Diego López")).toBeInTheDocument();
  });

  it("el correo es un enlace que abre el correo", () => {
    pintar();
    expect(tarjeta().getByRole("link", { name: /diego@magarinos\.es/ })).toHaveAttribute(
      "href",
      "mailto:diego@magarinos.es",
    );
  });

  it("el teléfono marca, y marca SIN espacios", () => {
    pintar();
    // "+34 600 123 456" dentro de un `tel:` no marca en todos los
    // teléfonos; el número que se enseña sí lleva sus espacios.
    const enlace = tarjeta().getByRole("link", { name: /\+34 600 123 456/ });
    expect(enlace).toHaveAttribute("href", "tel:+34600123456");
  });

  it("sin correo y sin teléfono lo dice, cada uno con su frase", () => {
    pintar({ contactEmail: null, phonePrimary: null });

    expect(tarjeta().getByText(t.ownerContactNoEmail)).toBeInTheDocument();
    expect(tarjeta().getByText(t.ownerContactNoPhone)).toBeInTheDocument();
  });

  it("sin nombre lo dice, en vez de dejar el hueco", () => {
    pintar({ contactName: null });
    expect(tarjeta().getByText(t.ownerContactNoName)).toBeInTheDocument();
  });

  it("NO inventa la cara del contacto que dibuja el diseño", () => {
    const { container } = pintar();
    expect(container.querySelector("img")).toBeNull();
  });

  it("lleva a los mensajes del restaurante, sin abrir ninguna conversación", () => {
    // Crear una conversación al pintar una pantalla sería un efecto por
    // mirar: se va a donde ya está la suya.
    pintar();
    expect(tarjeta().getByRole("link", { name: t.ownerContactMessages })).toHaveAttribute(
      "href",
      "/espacios/demo/mensajes",
    );
  });
});
