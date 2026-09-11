import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Listas que están escritas a los dos lados de la frontera SQL/TypeScript.
 *
 * Hay reglas que no se pueden compartir importándolas: viven en una función
 * interna de PostgreSQL, sin `EXECUTE` para nadie, y la pantalla necesita
 * la misma lista para decidir qué enseñar. La copia es inevitable; lo que
 * no es inevitable es que se separen en silencio.
 *
 * **Por qué este archivo existe.** La pantalla de prioridad llevaba
 * escrito: "que las dos listas coincidan lo comprueba
 * `prioridad_del_restaurante.sql` al exigir que la lista venga entera". Es
 * falso, y se vio al repasarlo: esa suite comprueba que la FUNCIÓN es
 * coherente consigo misma, y no mira el TypeScript. Si alguien añadiera un
 * estado ordenable a `request_is_rankable()` sin tocar la pantalla, la
 * pantalla mandaría una lista incompleta y la función la rechazaría — el
 * fallo lo vería un restaurante intentando ordenar sus cambios, no un
 * test. Que es exactamente lo que el comentario prometía evitar.
 */
const RAIZ = join(process.cwd(), "..", "..");

function migracion(nombre: string): string {
  return readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8");
}

/**
 * Saca los estados de una función SQL escrita como
 * `select p_state in ('a', 'b', ...)`.
 */
function estadosDeFuncion(sql: string, funcion: string): readonly string[] {
  const desde = sql.indexOf(`function public.${funcion}`);
  expect(desde, `no está ${funcion} en la migración`).toBeGreaterThan(-1);

  const cuerpo = sql.slice(desde, sql.indexOf("$$;", desde));
  const lista = /in\s*\(([^)]*)\)/.exec(cuerpo);
  expect(lista, `no se ha podido leer la lista de ${funcion}`).not.toBeNull();

  return [...lista![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe("las listas duplicadas a los dos lados no se separan en silencio", () => {
  it("los estados que se ordenan son los mismos en la pantalla y en la función", () => {
    // La pantalla necesita la lista porque `request_is_rankable()` es
    // interna: no tiene EXECUTE para nadie y no se puede preguntar por RPC.
    const enSql = estadosDeFuncion(
      migracion("20260910000062_prioridad_del_restaurante.sql"),
      "request_is_rankable",
    );

    const pantalla = readFileSync(
      join(
        process.cwd(),
        "src",
        "app",
        "espacios",
        "[slug]",
        "restaurantes",
        "[id]",
        "prioridad",
        "page.tsx",
      ),
      "utf8",
    );
    const bloque = /const PENDIENTES = \[([^\]]*)\]/.exec(pantalla);
    expect(bloque, "no está la lista PENDIENTES en la pantalla").not.toBeNull();
    const enPantalla = [...bloque![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);

    // Se comparan ordenadas: lo que importa es el CONJUNTO, no en qué orden
    // los escribió cada uno.
    expect([...enPantalla].sort()).toEqual([...enSql].sort());
  });
});
