import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { STATE_CATALOGUE, type StatefulEntity } from "./naming";

/**
 * Barrido en falso-cerrado sobre CA-21: **cada estado que el catálogo dice
 * que existe tiene que ser uno de los que la columna admite en la base, y
 * al revés**.
 *
 * Por qué hace falta, dicho con lo que pasó. La cabecera de `naming.ts`
 * afirmaba desde el Hito 8 que este barrido lo hacía
 * `hito8_inicio_busqueda_notificaciones.sql`. No lo hacía: no existía en
 * ningún archivo del repositorio. Mientras tanto `naming.ts` redeclaraba a
 * mano tres listas que ya tenían dueño en `src/core/`, y las tres se
 * habían quedado atrás:
 *
 *   · a las solicitudes les faltaba `correction_requested`;
 *   · a los trabajos, `reassignment_requested`, y sus dos cancelados
 *     (RN-JOB-04) estaban colapsados en un `cancelled` que el CHECK de la
 *     tabla **no admite**, así que `jobTone()` lo comparaba con un valor
 *     imposible y un trabajo cancelado salía en gris;
 *   · una tarea `completed` se llamaba aquí `done`, y `blocked` no
 *     figuraba.
 *
 * Ninguna pantalla lo destapó porque hasta HU-21 ninguna pintaba el estado
 * de una tarea, y `naming.test.ts` comparaba el diccionario con la lista
 * equivocada: los dos lados estaban mal a la vez, así que coincidían.
 *
 * Este test no compara con otra lista escrita a mano: lee los CHECK de las
 * migraciones, que es lo que la base va a admitir de verdad.
 */

const MIGRATIONS = join(__dirname, "../../../../supabase/migrations");

/**
 * Dónde vive el estado de cada entidad del catálogo. Una entidad que no
 * esté aquí hace fallar el test: o se dice en qué columna vive, o se dice
 * por qué no vive en ninguna (`DERIVADOS`). Añadir una entidad al
 * catálogo y olvidarse de las dos cosas es justo lo que este barrido
 * impide.
 */
const COLUMNA: Readonly<Record<string, { tabla: string; columna: string }>> = {
  request: { tabla: "requests", columna: "state" },
  job: { tabla: "jobs", columna: "state" },
  task: { tabla: "tasks", columna: "state" },
  establishment: { tabla: "establishments", columna: "status" },
  absence: { tabla: "absences", columna: "state" },
};

/**
 * Entidades cuyo estado **no** es una columna: lo deriva el servidor de
 * otra cosa. Cada una con su motivo, porque un hueco sin explicar aquí es
 * indistinguible de un olvido.
 */
const DERIVADOS: Readonly<Record<string, string>> = {
  charge: "RN-FIN-02: el estado de un cobro lo deriva el servidor del libro de apuntes (charge_outstanding_cents y su fecha de vencimiento), no hay columna `state` en `charges`.",
};

/** El SQL de todas las migraciones, en el orden en que se aplican. */
function migracionesEnOrden(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf-8"))
    .join("\n");
}

/**
 * Los valores del último `check (<columna> in (...))` que las migraciones
 * escriben para esa columna. El **último** y no el primero: una migración
 * posterior puede sustituir el CHECK, y lo que manda es el estado final
 * del esquema.
 *
 * Se ancla al nombre de la columna, no al de la tabla, porque el CHECK se
 * escribe en la línea de la columna dentro del `create table`. Para que
 * eso no confunda la columna `state` de dos tablas distintas, se recorta
 * antes el trozo de SQL que va de `create table <tabla>` al siguiente
 * `create table`.
 */
function valoresDelCheck(sql: string, tabla: string, columna: string): readonly string[] | null {
  const inicio = sql.search(new RegExp(`create table (?:if not exists )?public\\.${tabla}\\b`));
  if (inicio === -1) return null;

  const resto = sql.slice(inicio + 1);
  const siguiente = resto.search(/create table /);
  const cuerpo = siguiente === -1 ? resto : resto.slice(0, siguiente);

  const check = new RegExp(`\\b${columna}\\b[^,]*?check\\s*\\(\\s*${columna}\\s+in\\s*\\(([^)]*)\\)`, "s");
  const encontrado = cuerpo.match(check);
  if (!encontrado) return null;

  return [...encontrado[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("CA-21 · el catálogo de estados dice lo mismo que la base", () => {
  const sql = migracionesEnOrden();

  it("toda entidad del catálogo tiene columna conocida o motivo para no tenerla", () => {
    for (const entidad of Object.keys(STATE_CATALOGUE)) {
      const clasificada = entidad in COLUMNA || entidad in DERIVADOS;
      expect(
        clasificada,
        `"${entidad}" no dice en qué columna vive su estado ni por qué no vive en ninguna. ` +
          `Añádela a COLUMNA, o a DERIVADOS con su motivo.`,
      ).toBe(true);
    }
  });

  for (const [entidad, { tabla, columna }] of Object.entries(COLUMNA)) {
    it(`los estados de "${entidad}" son exactamente los que admite ${tabla}.${columna}`, () => {
      const enLaBase = valoresDelCheck(sql, tabla, columna);

      expect(
        enLaBase,
        `no se encontró el CHECK de ${tabla}.${columna} en las migraciones. ` +
          `Si la columna dejó de tener CHECK, este barrido deja de proteger "${entidad}" y hay que decirlo.`,
      ).not.toBeNull();

      const catalogo = [...STATE_CATALOGUE[entidad as StatefulEntity]].sort();
      expect([...(enLaBase ?? [])].sort(), `el catálogo de "${entidad}" no coincide con la base`).toEqual(
        catalogo,
      );
    });
  }
});
