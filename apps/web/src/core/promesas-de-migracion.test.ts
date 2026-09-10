import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Que una migración no prometa una comprobación que no existe.
 *
 * Este archivo existe porque el fallo ha ocurrido **siete veces** en el
 * proyecto, y la séptima la iba a commitear yo. El patrón es siempre el
 * mismo: la cabecera de una migración termina con "Se comprueba con
 * `supabase/tests/X.sql`", el archivo nunca se escribe, y nadie se entera
 * porque un comentario no falla.
 *
 * No es cosmético. La suite que faltaba de la migración 55 se escribió el
 * 10/09/2026 y su PRIMERA comprobación salió en rojo:
 * `establishment_client_users()` no filtraba `revoked_at`, así que la
 * pestaña Usuarios de la ficha llevaba un día enseñando a gente cuyo
 * acceso se había retirado (RN-EST-05). El comentario decía que estaba
 * comprobado; no lo estaba, y por eso el fallo vivía.
 *
 * Dos comprobaciones, y las dos hacen falta:
 *
 *   1. Todo archivo que una migración nombra, existe.
 *   2. Todo archivo que existe, CI lo ejecuta. Una suite que nadie corre
 *      es lo mismo que una que no está escrita, solo que además engaña.
 */
const RAIZ = join(process.cwd(), "..", "..");
const MIGRACIONES = join(RAIZ, "supabase", "migrations");
const TESTS = join(RAIZ, "supabase", "tests");
const CI = join(RAIZ, ".github", "workflows", "ci.yml");

/** El bootstrap no es una suite: es lo que hay que correr ANTES de ellas. */
const NO_ES_SUITE = ["bootstrap-postgres-local.sql"];

describe("las migraciones no prometen comprobaciones que no existen", () => {
  it("todo archivo de supabase/tests que nombra una migración está escrito", () => {
    const prometidos = new Map<string, string[]>();

    for (const archivo of readdirSync(MIGRACIONES).filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(join(MIGRACIONES, archivo), "utf8");
      for (const [, ruta] of sql.matchAll(/supabase\/tests\/([a-z0-9_]+\.sql)/g)) {
        prometidos.set(ruta, [...(prometidos.get(ruta) ?? []), archivo]);
      }
    }

    // Que el barrido no sea vacuo: si dejara de leer, pasaría siempre.
    expect(prometidos.size).toBeGreaterThanOrEqual(5);

    const rotas = [...prometidos.entries()]
      .filter(([ruta]) => !existsSync(join(TESTS, ruta)))
      .map(([ruta, migraciones]) => `${ruta} (prometido por ${migraciones.join(", ")})`);

    expect(
      rotas,
      "una migración dice «se comprueba con» un archivo que no existe: o se escribe la suite, o se quita la promesa",
    ).toEqual([]);
  });

  it("CI ejecuta todas las suites que hay escritas", () => {
    const ci = readFileSync(CI, "utf8");
    const suites = readdirSync(TESTS)
      .filter((f) => f.endsWith(".sql") && !NO_ES_SUITE.includes(f));

    expect(suites.length).toBeGreaterThanOrEqual(10);

    const sinCorrer = suites.filter((suite) => !ci.includes(suite));

    expect(
      sinCorrer,
      "hay suites escritas que CI no ejecuta: una comprobación que nadie corre engaña más que no tenerla",
    ).toEqual([]);
  });
});
