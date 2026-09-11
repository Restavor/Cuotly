import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NOTIFICATION_EVENTS } from "./notifications";

/**
 * Listas que están escritas a los dos lados de la frontera SQL/TypeScript.
 *
 * Hay reglas que no se pueden compartir importándolas: viven en una función
 * interna de PostgreSQL, sin `EXECUTE` para nadie, o en un CHECK de una
 * tabla, y la pantalla necesita la misma lista para decidir qué enseñar. La
 * copia es inevitable; lo que no es inevitable es que se separen en
 * silencio.
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
 *
 * **Y por qué se leen TODAS las migraciones, no una.** Una migración
 * posterior puede redefinir la función o ensanchar el CHECK —la 72 quitó
 * `in_progress` de los estados ordenables, la 71 añadió dos eventos de
 * aviso—, y un test clavado al archivo donde nació la regla compararía
 * contra una versión que ya no rige. Se busca la ÚLTIMA definición, que es
 * la que tiene la base de datos.
 */
const RAIZ = join(process.cwd(), "..", "..");
const MIGRACIONES = join(RAIZ, "supabase", "migrations");

/** Las migraciones en el orden en que se aplican, que es el de su nombre. */
function migracionesEnOrden(): readonly string[] {
  return readdirSync(MIGRACIONES)
    .filter((nombre) => nombre.endsWith(".sql"))
    .sort()
    .map((nombre) => readFileSync(join(MIGRACIONES, nombre), "utf8"));
}

/**
 * El último trozo de SQL que define lo que se busca. Devuelve el cuerpo
 * desde la definición hasta `fin` incluido, para no arrastrar lo que venga
 * detrás. El terminador entra en el trozo a propósito: en un CHECK, el
 * paréntesis que cierra la lista ES el terminador, y dejarlo fuera deja un
 * `in (` sin cerrar que no casa con nada.
 */
function ultimaDefinicion(inicio: string, fin: string): string {
  let encontrado: string | null = null;

  for (const sql of migracionesEnOrden()) {
    let desde = sql.indexOf(inicio);
    while (desde > -1) {
      const hasta = sql.indexOf(fin, desde);
      encontrado = sql.slice(desde, hasta > -1 ? hasta + fin.length : undefined);
      desde = sql.indexOf(inicio, desde + 1);
    }
  }

  expect(encontrado, `no se ha encontrado "${inicio}" en ninguna migración`).not.toBeNull();
  return encontrado!;
}

/** Los valores entrecomillados de un `in ('a', 'b', ...)`. */
function valoresDeLaLista(sql: string): readonly string[] {
  const lista = /in\s*\(([^)]*)\)/.exec(sql);
  expect(lista, "no se ha podido leer la lista").not.toBeNull();
  return [...lista![1].matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);
}

describe("las listas duplicadas a los dos lados no se separan en silencio", () => {
  it("los estados que se ordenan son los mismos en la pantalla y en la función", () => {
    // La pantalla necesita la lista porque `request_is_rankable()` es
    // interna: no tiene EXECUTE para nadie y no se puede preguntar por RPC.
    const enSql = valoresDeLaLista(
      ultimaDefinicion("create or replace function public.request_is_rankable", "$$;"),
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

    // Y lo que la decisión del 12/09/2026 dice en una línea: lo que ya se
    // está haciendo no se reordena. Comprobarlo aparte del conjunto es lo
    // que hace que quitar `in_progress` de los dos sitios a la vez —que
    // dejaría el test de arriba en verde— siga fallando aquí.
    expect(enSql).not.toContain("in_progress");
    expect(enSql).toContain("accepted");
  });

  it("el catálogo de avisos es el mismo en `src/core` y en el CHECK de la tabla", () => {
    // `notifications.ts` prometía este test desde el Hito 8 y no existía.
    // Sin él, añadir un evento en TypeScript y olvidarlo en el CHECK se ve
    // cuando el aviso falla al emitirse, dentro de la transacción de una
    // operación de negocio.
    const enSql = valoresDeLaLista(
      ultimaDefinicion("add constraint notifications_event_type_check", "));"),
    );

    expect([...NOTIFICATION_EVENTS].sort()).toEqual([...enSql].sort());
  });
});
