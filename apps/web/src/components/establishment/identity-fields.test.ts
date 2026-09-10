import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  IDENTITY_FIELDS,
  MULTILINE_IDENTITY_FIELDS,
  identityIsEmpty,
  type EstablishmentIdentity,
} from "@/core/establishments";
import { es } from "@/i18n/es";

/**
 * §15.2 · que la ficha de datos no pierda un campo por el camino.
 *
 * El fallo que este archivo existe para impedir no es teórico: es el que
 * se cuela solo. Se añade una columna a la migración, se añade al
 * formulario, y nadie se acuerda de la vista de lectura ni de la etiqueta
 * en español — y entonces la ficha enseña once campos de doce, o uno con
 * su nombre en inglés, sin que falle ningún tipo ni ningún test.
 *
 * Así que se comprueban las cuatro copias de la lista contra
 * `IDENTITY_FIELDS`, que es la única fuente: los tipos, las etiquetas, el
 * formulario y la migración.
 */

const RAIZ = join(process.cwd(), "src");

function fuente(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), "utf8");
}

/** El nombre de la columna y del parámetro: `phonePrimary` → `phone_primary`. */
function aSerpiente(campo: string): string {
  return campo.replace(/[A-Z]/g, (letra) => `_${letra.toLowerCase()}`);
}

const VACIA: EstablishmentIdentity = Object.fromEntries(
  IDENTITY_FIELDS.map((campo) => [campo, null]),
) as EstablishmentIdentity;

describe("§15.2 · los campos de la ficha del restaurante", () => {
  it("cada campo tiene etiqueta en español, y ninguna etiqueta sobra", () => {
    expect([...IDENTITY_FIELDS].sort()).toEqual(
      Object.keys(es.establishmentSheet.identityFields).sort(),
    );
  });

  it("los campos multilínea son campos de la ficha", () => {
    for (const campo of MULTILINE_IDENTITY_FIELDS) {
      expect(IDENTITY_FIELDS).toContain(campo);
    }
  });

  it("el formulario pide todos los campos, con el nombre con el que se guardan", () => {
    const formulario = fuente("components/establishment/DataForm.tsx");
    for (const campo of IDENTITY_FIELDS) {
      expect(formulario, `el formulario no pide ${campo}`).toContain(`name="${campo}"`);
    }
    // Y el nombre comercial, que no es un campo de la ficha —es
    // `establishments.name`— pero sí del formulario.
    expect(formulario).toContain('name="name"');
  });

  it("la acción manda todos los campos a la función del servidor", () => {
    // `set_establishment_data()` recibe la ficha COMPLETA: un campo que la
    // acción no mandara se guardaría como nulo en el siguiente guardado,
    // borrando en silencio lo que había.
    const accion = fuente("app/espacios/[slug]/restaurantes/[id]/datos/actions.ts");
    for (const campo of IDENTITY_FIELDS) {
      expect(accion, `la acción no manda ${campo}`).toContain(`p_${aSerpiente(campo)}:`);
    }
  });

  it("RN-EST-11 · las migraciones guardan exactamente estos campos, ni uno más", () => {
    // Al revés que las anteriores: aquí lo que se busca es una columna que
    // la base guarde y ninguna pantalla enseñe. Se leen las listas de
    // `add column` de las migraciones que amplían `establishments`: la 57
    // trajo los trece de §15.2 y la 58 los tres de la maqueta 02.
    //
    // No es una lista escrita a mano: se recorre el directorio entero, así
    // que una migración futura que añada una columna a esta tabla entra
    // aquí sola y hace fallar el test hasta que la pantalla la enseñe.
    const directorio = join(process.cwd(), "..", "..", "supabase", "migrations");
    const columnas = readdirSync(directorio)
      .filter((archivo) => archivo.endsWith(".sql"))
      .sort()
      .flatMap((archivo) => {
        const sql = readFileSync(join(directorio, archivo), "utf8");
        // Solo los `alter table public.establishments`, y solo hasta el
        // punto y coma que los cierra: otras tablas de la misma migración
        // no cuentan.
        return [...sql.matchAll(/alter table public\.establishments\b([^;]*);/g)].flatMap(
          (bloque) =>
            [...bloque[1].matchAll(/add column if not exists (\w+) text/g)].map(
              (coincidencia) => coincidencia[1],
            ),
        );
      });

    // `idempotency_key` no es un campo de la ficha: no se enseña, no se
    // edita y no lo escribe nadie: lo pone `create_establishment_with_data()`
    // para que un doble clic no cree dos restaurantes (migración 58).
    const deLaFicha = columnas.filter((columna) => columna !== "idempotency_key");

    expect(deLaFicha.sort()).toEqual(IDENTITY_FIELDS.map(aSerpiente).sort());
  });
});

describe("§15.2 · una ficha sin rellenar se distingue de una a medias", () => {
  it("vacía cuando no hay ni un dato", () => {
    expect(identityIsEmpty(VACIA)).toBe(true);
  });

  it("no vacía en cuanto hay uno, aunque sea el último", () => {
    for (const campo of IDENTITY_FIELDS) {
      expect(identityIsEmpty({ ...VACIA, [campo]: "algo" }), `${campo} no cuenta`).toBe(false);
    }
  });
});
