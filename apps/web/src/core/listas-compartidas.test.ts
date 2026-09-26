import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  INTEGRATION_PROVIDERS,
  INTEGRATION_STATES,
  integrationAuthKind,
  integrationSyncFrequency,
  retryDelayHours,
} from "./integrations";
import {
  CUOTLY_CONSTANTS,
  CUOTLY_PAYMENT_REMINDERS,
  CUOTLY_PLAN_TERMS,
  SPACE_CUOTLY_STATES,
  isSpaceReadOnly,
} from "./cuotly-subscription";
import {
  EXPORT_SCOPES,
  ONBOARDING_STEPS,
  SPACE_LIFECYCLE_OPERATIONS,
} from "./space-lifecycle";
import { MANDATORY_EVENTS, NOTIFICATION_EVENTS } from "./notifications";
import {
  HELP_TOPICS,
  INCIDENT_CATEGORIES,
  INCIDENT_IMPACTS,
  INCIDENT_SIDES,
  INCIDENT_STATES,
  STATUS_COMPONENTS,
  STATUS_SEVERITIES,
  incidentNeedsReason,
  incidentPriorityFor,
  incidentTransitionAllowed,
} from "./support";
import { SUPPORT_ACCESS_LEVELS, SUPPORT_SESSION_MINUTES } from "./platform-admin";
import {
  JUDGEMENT_SECTIONS,
  REPORT_CATEGORIES,
  REPORT_SECTION_KEYS,
  REPORT_STATES,
  defaultIncluded,
  reportIsVisibleToClient,
  reportTransitionAllowed,
} from "./reports";
import {
  SPACE_REQUEST_ACTORS,
  SPACE_REQUEST_STATES,
  spaceRequestTransitionAllowed,
} from "./space-requests";
import {
  ACCESS_REQUEST_ACTORS,
  ACCESS_REQUEST_STATES,
  PLATFORM_EMAIL_KINDS,
  accessRequestTransitionAllowed,
} from "./access-requests";
import { CLIENT_ATTENTION_KINDS } from "./global-home";
import {
  OPPORTUNITY_RULES,
  OPPORTUNITY_STATES,
  RULE_CATEGORY,
  RULE_EFFORT,
  RULE_PROVIDERS,
  canTransition,
  ruleScope,
  visibleToClient,
} from "./opportunities";

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

/** Los valores entrecomillados de un trozo de SQL, en su orden. */
function entrecomillados(sql: string): string[] {
  return [...sql.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);
}

/** La rama `when '<clave>' then ...` de un CASE, hasta el salto de línea. */
function casoDe(sql: string, clave: string): string | null {
  const desde = sql.indexOf(`when '${clave}' then`);
  if (desde < 0) return null;
  const hasta = sql.indexOf("\n", desde);
  return sql.slice(desde + `when '${clave}'`.length, hasta < 0 ? undefined : hasta);
}

/**
 * Los valores entrecomillados de una lista cerrada, en cualquiera de las
 * **dos formas** en que se escriben en este repositorio:
 *
 *   · `in ('a', 'b', ...)`, que es como se escriben a mano;
 *   · `= any (array['a', 'b', ...])`, que es como las devuelve
 *     `pg_get_constraintdef()` y por tanto como acaban escritas cuando una
 *     migración copia la definición viva en vez de reescribirla de memoria.
 *
 * Entender solo la primera dejó este barrido ciego ante la migración 117,
 * que usó la segunda. Un barrido que no sabe leer lo último que se
 * escribió no protege de nada, y peor aún: **falla por no poder leer**,
 * que se parece mucho a fallar por haber encontrado algo.
 */
function valoresDeLaLista(sql: string): readonly string[] {
  const lista = /in\s*\(([^)]*)\)/.exec(sql) ?? /any\s*\(\s*array\[([^\]]*)\]/i.exec(sql);
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

  /*
   * Migración 81 (Fase 3, Hito 13). `src/core/integrations.ts` dice de sí
   * mismo que es "la misma cuenta" que cuatro cosas de SQL, y que este
   * archivo vigila que no se separen. Aquí está la vigilancia, una por
   * cosa: las cinco fuentes (CHECK de `integrations.provider`), los siete
   * estados (CHECK de `integrations.status`), cómo se conecta cada fuente
   * (`integration_auth_kind()`), cada cuánto (`integration_sync_frequency()`)
   * y cuánto espera un reintento (`integration_retry_delay()`).
   */
  it("las cinco fuentes de RN-INT-01 son las mismas en el CHECK y en `src/core`", () => {
    const tabla = ultimaDefinicion("create table public.integrations (", "unique (establishment_id, provider)");
    const check = /provider text not null\s*check \(provider in \(([^)]*)\)\)/.exec(tabla);
    expect(check, "no está el CHECK de provider").not.toBeNull();
    const enSql = [...check![1].matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);

    expect([...INTEGRATION_PROVIDERS].sort()).toEqual([...enSql].sort());
  });

  it("los siete estados de RN-INT-03 son los mismos en el CHECK y en `src/core`", () => {
    const tabla = ultimaDefinicion("create table public.integrations (", "unique (establishment_id, provider)");
    const check = /status text not null default '[a-z_]+'\s*check \(status in \(([^)]*)\)\)/.exec(tabla);
    expect(check, "no está el CHECK de status").not.toBeNull();
    const enSql = [...check![1].matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]);

    // Aquí el ORDEN también importa: es el de §117 y el de la pantalla.
    expect([...INTEGRATION_STATES]).toEqual(enSql);
  });

  it("cómo se conecta cada fuente (RN-INT-02) lo dicen igual SQL y `src/core`", () => {
    const fn = ultimaDefinicion("create or replace function public.integration_auth_kind", "$$;");
    for (const provider of INTEGRATION_PROVIDERS) {
      const fila = new RegExp(`when '${provider}' then '([a-z_]+)'`).exec(fn);
      expect(fila, `${provider} no está en integration_auth_kind()`).not.toBeNull();
      expect(fila![1], provider).toBe(integrationAuthKind(provider));
    }
  });

  it("cada cuánto se sincroniza cada fuente (RN-INT-04) lo dicen igual SQL y `src/core`", () => {
    const fn = ultimaDefinicion("create or replace function public.integration_sync_frequency", "$$;");
    const equivalencia = { daily: "1 day", weekly: "7 days" } as const;
    for (const provider of INTEGRATION_PROVIDERS) {
      const fila = new RegExp(`when '${provider}' then interval '([0-9]+ days?)'`).exec(fn);
      expect(fila, `${provider} no está en integration_sync_frequency()`).not.toBeNull();
      expect(fila![1], provider).toBe(equivalencia[integrationSyncFrequency(provider)]);
    }
  });

  it("la espera entre reintentos (RN-INT-04) es la misma cuenta en SQL y en `src/core`", () => {
    // SQL: least(24, power(4, greatest(n, 1) - 1)). Se lee la fórmula y se
    // evalúa para los mismos N que el TypeScript, en vez de fiarse de que
    // "4" y "24" sigan siendo los mismos números en los dos sitios.
    const fn = ultimaDefinicion("create or replace function public.integration_retry_delay", "$$;");
    const formula = /least\((\d+), power\((\d+), greatest\(coalesce\(p_consecutive_failures, 1\), 1\) - 1\)\)/.exec(fn);
    expect(formula, "la fórmula de integration_retry_delay() ha cambiado de forma").not.toBeNull();
    const techo = Number(formula![1]);
    const base = Number(formula![2]);

    for (const n of [0, 1, 2, 3, 4, 5, 10]) {
      const enSql = Math.min(techo, base ** (Math.max(n, 1) - 1));
      expect(retryDelayHours(n), `con ${n} fallos`).toBe(enSql);
    }
  });

  /*
   * Migración 84 (Fase 3, Hito 15). El catálogo de las nueve reglas está
   * a los dos lados porque de él dependen cosas distintas en cada uno: en
   * SQL, lo que se guarda al detectar y qué ve cada plan; en TypeScript,
   * los umbrales y lo que la pantalla enseña. Una regla que cambiara de
   * fuentes en un solo lado cambiaría de alcance en un solo lado — y con
   * él, quién la ve.
   */
  it("las fuentes de cada regla (§96) las dicen igual SQL y `src/core`", () => {
    const fn = ultimaDefinicion("create or replace function public.opportunity_rule_providers", "$$;");
    for (const rule of OPPORTUNITY_RULES) {
      const fila = casoDe(fn, rule);
      expect(fila, `${rule} no está en opportunity_rule_providers()`).not.toBeNull();
      expect([...entrecomillados(fila!)].sort(), rule).toEqual([...RULE_PROVIDERS[rule]].sort());
    }
    // Y ninguna de más: el CHECK de la tabla es la otra mitad de la lista.
    const tabla = ultimaDefinicion("create table public.opportunities (", "constraint opportunities_shape");
    const check = /rule_key text check \(rule_key is null or rule_key in \(([^)]*)\)\)/.exec(tabla);
    expect(check, "no está el CHECK de rule_key").not.toBeNull();
    expect(entrecomillados(check![1]).slice().sort()).toEqual([...OPPORTUNITY_RULES].sort());
  });

  it("la categoría y el esfuerzo propuesto de cada regla los dicen igual SQL y `src/core`", () => {
    const categorias = ultimaDefinicion("create or replace function public.opportunity_rule_category", "$$;");
    const esfuerzos = ultimaDefinicion("create or replace function public.opportunity_rule_effort", "$$;");
    for (const rule of OPPORTUNITY_RULES) {
      expect(entrecomillados(casoDe(categorias, rule) ?? ""), rule).toEqual([RULE_CATEGORY[rule]]);
      expect(entrecomillados(casoDe(esfuerzos, rule) ?? ""), rule).toEqual([RULE_EFFORT[rule]]);
    }
  });

  it("básica o avanzada (§101) sale de contar fuentes, y sale igual en los dos lados", () => {
    // La función de SQL no enumera alcances: cuenta el array de fuentes,
    // igual que `ruleScope()`. Lo que se comprueba es que la forma de la
    // cuenta siga siendo esa, porque una lista escrita a mano se
    // desincronizaría en silencio.
    const fn = ultimaDefinicion("create or replace function public.opportunity_rule_scope", "$$;");
    expect(fn).toContain("array_length(public.opportunity_rule_providers(p_rule), 1) > 1");
    expect(fn).toContain("'advanced'");
    for (const rule of OPPORTUNITY_RULES) {
      expect(ruleScope(rule), rule).toBe(RULE_PROVIDERS[rule].length > 1 ? "advanced" : "basic");
    }
  });

  it("los ocho estados de §98 son los mismos en el CHECK y en `src/core`", () => {
    const tabla = ultimaDefinicion("create table public.opportunities (", "constraint opportunities_shape");
    const check = /status text not null default '[a-z_]+' check \(status in \(([^)]*)\)\)/.exec(tabla);
    expect(check, "no está el CHECK de status").not.toBeNull();

    // El orden también: es el de §98 y el de la pantalla.
    expect(entrecomillados(check![1])).toEqual([...OPPORTUNITY_STATES]);
  });

  it("quién ve qué estado (RN-OPP-07) lo dicen igual los dos lados", () => {
    const visibles = ultimaDefinicion("create or replace function public.opportunity_is_visible_to_client", "$$;");
    const enSql = entrecomillados(visibles.slice(visibles.indexOf("select p_status in")));
    expect([...OPPORTUNITY_STATES].filter(visibleToClient).sort()).toEqual([...enSql].sort());
  });

  it("quién mueve cada transición (§97, §98) lo dicen igual los dos lados", () => {
    const fn = ultimaDefinicion("create or replace function public.opportunity_transition_allowed", "$$;");

    /*
     * Cada rama de la función tiene la forma `when p_from = 'x' and p_to
     * in ('a','b') then p_actor in ('worker','approver')`, así que se
     * parte por `when ` y de cada trozo se leen los entrecomillados: el
     * primero es el origen, los de antes de `then` los destinos y los de
     * después los actores. Comparar así —y no rama a rama escrita a
     * mano— es lo que hace que una transición añadida en un solo lado
     * ponga esto en rojo.
     */
    const permitidasEnSql = new Set<string>();
    for (const rama of fn.split("when ").slice(1)) {
      const corte = rama.indexOf(" then ");
      if (corte < 0) continue;
      const izquierda = entrecomillados(rama.slice(0, corte));
      const derecha = entrecomillados(rama.slice(corte));
      if (izquierda.length < 2 || derecha.length === 0) continue;
      const [origen, ...destinos] = izquierda;
      for (const destino of destinos) {
        for (const actor of derecha) permitidasEnSql.add(`${origen}->${destino}:${actor}`);
      }
    }
    expect(permitidasEnSql.size).toBeGreaterThan(0);

    for (const from of OPPORTUNITY_STATES) {
      for (const to of OPPORTUNITY_STATES) {
        for (const actor of ["worker", "approver"] as const) {
          expect(canTransition(from, to, actor), `${from} -> ${to} como ${actor}`).toBe(
            permitidasEnSql.has(`${from}->${to}:${actor}`),
          );
        }
      }
    }
  });

  /*
   * Migración 85 (Fase 3, Hito 16). El catálogo de los informes está a los
   * dos lados por lo mismo: en SQL vive lo que se puede guardar y quién
   * puede moverlo; en TypeScript, lo que la pantalla ofrece. Una sección
   * que dejara de requerir criterio en un solo lado haría que un informe
   * se pudiera programar sin aprobar en la pantalla y no en el servidor —
   * o al revés, que es peor: un botón que siempre falla.
   */
  it("las tres familias de §89 son las mismas en el CHECK y en `src/core`", () => {
    const tabla = ultimaDefinicion("create table public.reports (", "constraint reports_period");
    const check = /category text not null check \(category in \(([^)]*)\)\)/.exec(tabla);
    expect(check, "no está el CHECK de category").not.toBeNull();
    expect(entrecomillados(check![1])).toEqual([...REPORT_CATEGORIES]);
  });

  it("los seis estados de §95 son los mismos en el CHECK y en `src/core`", () => {
    const tabla = ultimaDefinicion("create table public.reports (", "constraint reports_period");
    const check = /status text not null default '[a-z_]+' check \(status in \(([^)]*)\)\)/.exec(tabla);
    expect(check, "no está el CHECK de status").not.toBeNull();
    // El orden también: es el de §95 y el de la pantalla.
    expect(entrecomillados(check![1])).toEqual([...REPORT_STATES]);
  });

  it("qué secciones requieren criterio (§95.3) lo dicen igual los dos lados", () => {
    const fn = ultimaDefinicion(
      "create or replace function public.report_section_requires_judgement",
      "$$;",
    );
    const enSql = entrecomillados(fn.slice(fn.indexOf("select p_section in")));
    expect([...enSql].sort()).toEqual([...JUDGEMENT_SECTIONS].sort());
  });

  it("las secciones son las mismas, en el mismo orden, y entran marcadas igual", () => {
    const catalogo = ultimaDefinicion("create or replace function public.report_sections_catalogue", "$$;");
    // El orden importa: es el de la maqueta 10.04 y el del índice del PDF.
    const desde = catalogo.indexOf("array[");
    expect(desde >= 0, "no está el array del catálogo de secciones").toBe(true);
    expect(entrecomillados(catalogo.slice(desde, catalogo.indexOf("]", desde)))).toEqual([
      ...REPORT_SECTION_KEYS,
    ]);

    const porOmision = ultimaDefinicion("create or replace function public.report_section_default_included", "$$;");
    for (const category of REPORT_CATEGORIES) {
      for (const key of REPORT_SECTION_KEYS) {
        const rama = new RegExp(`when p_category = '${category}' and p_section = '${key}' then (true|false)`).exec(
          porOmision,
        );
        expect(rama, `${category}/${key} no está en report_section_default_included()`).not.toBeNull();
        expect(rama![1] === "true", `${category}/${key}`).toBe(defaultIncluded(category, key));
      }
    }
  });

  it("qué estados ve el restaurante (RN-REP-13) lo dicen igual los dos lados", () => {
    const fn = ultimaDefinicion("create or replace function public.report_is_visible_to_client", "$$;");
    const enSql = entrecomillados(fn.slice(fn.indexOf("select p_status in")));
    expect([...REPORT_STATES].filter(reportIsVisibleToClient).sort()).toEqual([...enSql].sort());
  });

  /*
   * Migración 97 (paso 2, decisión 41). La solicitud de acceso es la
   * puerta por la que se entra en Cuotly, y su tabla de transiciones está
   * a los dos lados por la misma razón que la de la solicitud de espacio:
   * en SQL decide y en TypeScript la pantalla dibuja. Separadas, la
   * pantalla ofrecería un botón que el servidor rechaza.
   */
  it("quién mueve cada transición de una solicitud de acceso (RN-ACC-05) lo dicen igual los dos lados", () => {
    const fn = ultimaDefinicion("create or replace function public.access_request_transition_allowed", "$$;");

    const permitidasEnSql = new Set<string>();
    for (const rama of fn.split("when ").slice(1)) {
      const corte = rama.indexOf(" then ");
      if (corte < 0) continue;
      const izquierda = entrecomillados(rama.slice(0, corte));
      const derecha = entrecomillados(rama.slice(corte));
      if (izquierda.length < 2 || derecha.length === 0) continue;
      const [origen, ...destinos] = izquierda;
      for (const destino of destinos) {
        for (const actor of derecha) permitidasEnSql.add(`${origen}->${destino}:${actor}`);
      }
    }
    // En falso-cerrado, igual que arriba.
    expect(permitidasEnSql.size).toBeGreaterThan(0);

    for (const from of ACCESS_REQUEST_STATES) {
      for (const to of ACCESS_REQUEST_STATES) {
        for (const actor of ACCESS_REQUEST_ACTORS) {
          expect(
            accessRequestTransitionAllowed(from, to, actor),
            `${from} -> ${to} como ${actor}`,
          ).toBe(permitidasEnSql.has(`${from}->${to}:${actor}`));
        }
      }
    }
  });

  /*
   * Migración 98 (paso 2, §36). Los motivos por los que una fila entra en
   * "Necesita tu atención" por el lado del restaurante los produce
   * `my_client_attention()` y los pinta la pantalla desde `src/core`. Un
   * motivo nuevo en SQL que la pantalla no conozca se pintaría sin nombre;
   * uno retirado en SQL dejaría un nombre que no sale nunca.
   */
  it("los seis motivos del restaurante (RN-GLO-02) son los mismos en SQL y en `src/core`", () => {
    const fn = ultimaDefinicion("create or replace function public.my_client_attention", "$$;");

    // El motivo es SIEMPRE la primera columna proyectada de cada rama del
    // UNION, así que se lee por la forma y no por una lista escrita a mano:
    // una rama nueva aparece aquí sola.
    const enSql = new Set<string>([
      ...[...fn.matchAll(/^\s*select '([a-z_]+)',$/gm)].map((m) => m[1]),
      ...[...fn.matchAll(/^\s*(?:when '[a-z_]+' )?then '([a-z_]+)'$/gm)].map((m) => m[1]),
      ...[...fn.matchAll(/^\s*else '([a-z_]+)'$/gm)].map((m) => m[1]),
    ]);

    // En falso-cerrado: si la expresión deja de reconocer la forma de la
    // función, esto se queda a cero en vez de comparar "nada" con "nada".
    expect(enSql.size).toBeGreaterThan(0);
    expect([...enSql].sort()).toEqual([...CLIENT_ATTENTION_KINDS].sort());
  });

  it("los correos de la plataforma (RN-ACC-04, RN-ADM-21) son los mismos en SQL y en `src/core`", () => {
    // La 97 los escribió dentro del `create table`; la 141 ensanchó el
    // CHECK con el de la cuenta eliminada. Se lee la última de las dos.
    const ampliado = migracionesEnOrden().some((sql) =>
      sql.includes("add constraint platform_emails_kind_check"),
    );
    const enSql = ampliado
      ? entrecomillados(ultimaDefinicion("add constraint platform_emails_kind_check", "));"))
      : (() => {
          const tabla = ultimaDefinicion("create table public.platform_emails", ");");
          const check = tabla.slice(tabla.indexOf("kind text not null check"));
          return entrecomillados(check.slice(0, check.indexOf("))") + 2));
        })();
    expect(enSql.length).toBeGreaterThan(0);
    expect([...enSql].sort()).toEqual([...PLATFORM_EMAIL_KINDS].sort());
  });

  it("quién mueve cada transición de una solicitud de espacio (RN-PLA-03) lo dicen igual los dos lados", () => {
    const fn = ultimaDefinicion("create or replace function public.space_request_transition_allowed", "$$;");

    const permitidasEnSql = new Set<string>();
    for (const rama of fn.split("when ").slice(1)) {
      const corte = rama.indexOf(" then ");
      if (corte < 0) continue;
      const izquierda = entrecomillados(rama.slice(0, corte));
      const derecha = entrecomillados(rama.slice(corte));
      if (izquierda.length < 2 || derecha.length === 0) continue;
      const [origen, ...destinos] = izquierda;
      for (const destino of destinos) {
        for (const actor of derecha) permitidasEnSql.add(`${origen}->${destino}:${actor}`);
      }
    }
    // En falso-cerrado: si la expresión deja de reconocer la forma de la
    // función, esto se queda a cero y el bucle de abajo pasaría en verde
    // comparando "nada" con "nada".
    expect(permitidasEnSql.size).toBeGreaterThan(0);

    for (const from of SPACE_REQUEST_STATES) {
      for (const to of SPACE_REQUEST_STATES) {
        for (const actor of SPACE_REQUEST_ACTORS) {
          expect(spaceRequestTransitionAllowed(from, to, actor), `${from} -> ${to} como ${actor}`).toBe(
            permitidasEnSql.has(`${from}->${to}:${actor}`),
          );
        }
      }
    }
  });

  /*
   * Migración 90 (Fase 4, Hito 18). El catálogo de los dos planes de
   * Cuotly, las constantes del apartado y los cinco avisos están a los dos
   * lados: en SQL cobran, limitan y cortan; en TypeScript la pantalla
   * enseña lo que va a pasar. Un precio cambiado en un solo lado cobraría
   * una cosa y enseñaría otra.
   */
  it("los dos planes de Cuotly (RN-SUB-01) son los mismos en SQL y en `src/core`", () => {
    const fn = ultimaDefinicion("create or replace function public.cuotly_plan_terms", "$$;");
    for (const plan of ["pro", "agency"] as const) {
      const fila = new RegExp(`\\('${plan}', ([^)]*)\\)`).exec(fn);
      expect(fila, `${plan} no está en cuotly_plan_terms()`).not.toBeNull();
      const valores = fila![1].split(",").map((v) => {
        const limpio = v.trim();
        return limpio.startsWith("null") ? null : Number(limpio);
      });
      const t = CUOTLY_PLAN_TERMS[plan];
      expect(valores, plan).toEqual([
        t.priceCents,
        t.includedEstablishments,
        t.includedUsers,
        t.storageGb,
        t.extraEstablishmentCents,
        t.extraUserCents,
      ]);
    }
  });

  it("las constantes del apartado (RN-SUB) son las mismas en SQL y en `src/core`", () => {
    const fn = ultimaDefinicion("create or replace function public.cuotly_constant", "$$;");
    for (const [nombre, valor] of Object.entries(CUOTLY_CONSTANTS)) {
      const fila = new RegExp(`when '${nombre}' then (\\d+)`).exec(fn);
      expect(fila, `${nombre} no está en cuotly_constant()`).not.toBeNull();
      expect(Number(fila![1]), nombre).toBe(valor);
    }
    // Y ninguna de más en SQL.
    expect(entrecomillados(fn.slice(fn.indexOf("select case"))).sort()).toEqual(
      Object.keys(CUOTLY_CONSTANTS).sort(),
    );
  });

  it("los cinco avisos de §4.5 (RN-SUB-07) tienen las mismas horas en SQL y en `src/core`", () => {
    const fn = ultimaDefinicion("create or replace function public.cuotly_reminder_offset_hours", "$$;");
    for (const recordatorio of CUOTLY_PAYMENT_REMINDERS) {
      const fila = new RegExp(`when '${recordatorio.event}' then (-?\\d+)`).exec(fn);
      expect(fila, `${recordatorio.event} no está en cuotly_reminder_offset_hours()`).not.toBeNull();
      expect(Number(fila![1]), recordatorio.event).toBe(recordatorio.offsetHours);
    }
    expect(entrecomillados(fn.slice(fn.indexOf("select case")))).toEqual(
      CUOTLY_PAYMENT_REMINDERS.map((r) => r.event),
    );
  });

  it("los seis modos del espacio (RN-SUB-02, RN-CIC-07, RN-ADM-16) son los mismos en el CHECK y en `src/core`", () => {
    // La 90 lo escribió pegado al `add column`; la 92 lo sacó a una
    // restricción con nombre para poder ensancharlo con el quinto modo.
    // Se busca la última, que es la que tiene la base.
    const restriccion = ultimaDefinicion(
      "add constraint spaces_cuotly_status_check",
      "));",
    );
    const check = /cuotly_status in \(([^)]*)\)/.exec(restriccion);
    expect(check, "no está el CHECK de cuotly_status").not.toBeNull();
    expect(entrecomillados(check![1])).toEqual([...SPACE_CUOTLY_STATES]);
  });

  it("los cuatro modos archivados son los mismos en `space_status_is_archived` y en `src/core`", () => {
    // RN-SUB-08 + RN-CIC-07. `isSpaceReadOnly()` decide qué botones pinta
    // la pantalla y la función SQL decide qué escrituras rechaza el
    // servidor: si se separan, la pantalla ofrece lo que la base rechaza.
    const fn = ultimaDefinicion(
      "create or replace function public.space_status_is_archived",
      "$$;",
    );
    const enSql = entrecomillados(fn.slice(fn.indexOf("select p_status in")));

    expect(enSql.sort()).toEqual(
      SPACE_CUOTLY_STATES.filter((estado) => isSpaceReadOnly(estado)).slice().sort(),
    );
  });

  it("qué avisos no se pueden desactivar (RN-NOT-03) lo dicen igual los dos lados", () => {
    // `notification_event_is_mandatory()` la reescribió la 90 al añadir los
    // dos de la suscripción; se lee la última definición.
    const fn = ultimaDefinicion("create or replace function public.notification_event_is_mandatory", "$$;");
    const enSql = entrecomillados(fn.slice(fn.indexOf("select p_event_type in")));
    expect([...MANDATORY_EVENTS].sort()).toEqual([...enSql].sort());
  });

  /*
   * Migración 91 (Fase 4, Hito 19). Los tres niveles de Modo soporte y la
   * duración que admite una sesión están a los dos lados: en SQL abren la
   * puerta y rechazan lo que no cabe; en TypeScript el formulario ofrece
   * lo que el servidor va a aceptar. Un nivel que existiera en un solo
   * lado sería un botón que devuelve un error, o un privilegio que nadie
   * puede pedir.
   */
  it("los tres niveles de Modo soporte (RN-ADM-06) son los mismos en el CHECK y en `src/core`", () => {
    const tabla = ultimaDefinicion("create table public.support_sessions (", "constraint support_sessions_window");
    const check = /access_level text not null check \(access_level in \(([^)]*)\)\)/.exec(tabla);
    expect(check, "no está el CHECK de access_level").not.toBeNull();
    // El ORDEN también importa: es del menor al mayor privilegio (§129).
    expect(entrecomillados(check![1])).toEqual([...SUPPORT_ACCESS_LEVELS]);
  });

  it("la duración de una sesión de Modo soporte (RN-ADM-06) es la misma cuenta en SQL y en `src/core`", () => {
    const fn = ultimaDefinicion("create or replace function public.start_support_session", "$$;");
    const porDefecto = /p_minutes integer default (\d+)/.exec(fn);
    const limites = /p_minutes < (\d+) or p_minutes > (\d+)/.exec(fn);
    expect(porDefecto, "no está el valor por defecto de p_minutes").not.toBeNull();
    expect(limites, "no están los límites de p_minutes").not.toBeNull();
    expect(Number(porDefecto![1])).toBe(SUPPORT_SESSION_MINUTES.default);
    expect(Number(limites![1])).toBe(SUPPORT_SESSION_MINUTES.min);
    expect(Number(limites![2])).toBe(SUPPORT_SESSION_MINUTES.max);
  });

  /*
   * Migración 92 (Fase 4, Hito 20). Los diez pasos de §9, los tres
   * alcances de una exportación y las tres operaciones del libro del
   * ciclo de vida están a los dos lados: en SQL deciden qué acepta el
   * servidor, en TypeScript qué pinta la pantalla. Un paso que existiera
   * en un solo lado sería una casilla que nadie puede marcar, o un
   * asistente que nunca termina.
   */
  it("los diez pasos de §9 (RN-CIC-01) son los mismos en `onboarding_steps` y en `src/core`", () => {
    const fn = ultimaDefinicion("create or replace function public.onboarding_steps", "$$;");
    const enSql = entrecomillados(fn.slice(fn.indexOf("select * from (values")));

    // El ORDEN importa: §9 los enumera del 1 al 10 y el asistente los
    // enseña en ese orden.
    expect(enSql).toEqual(ONBOARDING_STEPS.map((paso) => paso.step));
  });

  it("qué paso se deriva de un dato (RN-CIC-02) lo dicen igual los dos lados", () => {
    // Es la diferencia entre "hecho" y "confirmado por el propietario", y
    // si los dos lados no coinciden la pantalla pediría una confirmación
    // que el servidor ya da por hecha, o al revés.
    const fn = ultimaDefinicion("create or replace function public.onboarding_steps", "$$;");
    const cuerpo = fn.slice(fn.indexOf("select * from (values"));

    for (const paso of ONBOARDING_STEPS) {
      const fila = new RegExp(`'${paso.step}'\\s*,\\s*(true|false)`).exec(cuerpo);
      expect(fila, `${paso.step} no está en onboarding_steps()`).not.toBeNull();
      expect(fila![1] === "true", paso.step).toBe(paso.derivable);
    }
  });

  it("los pasos del CHECK son los mismos diez de `onboarding_steps`", () => {
    // El CHECK de la tabla va literal porque una restricción no admite
    // subconsultas; esta es la comprobación que lo sostiene.
    const tabla = ultimaDefinicion(
      "create table public.space_onboarding_confirmations (",
      "confirmed_by",
    );
    const check = /step text not null check \(step in \(([^)]*)\)\)/.exec(tabla);
    expect(check, "no está el CHECK de step").not.toBeNull();
    expect(entrecomillados(check![1]).slice().sort()).toEqual(
      ONBOARDING_STEPS.map((paso) => paso.step).slice().sort(),
    );
  });

  it("los tres alcances de una exportación (§141) son los mismos en el CHECK y en `src/core`", () => {
    const tabla = ultimaDefinicion("create table public.space_exports (", "requested_by");
    const check = /scope text not null check \(scope in \(([^)]*)\)\)/.exec(tabla);
    expect(check, "no está el CHECK de scope").not.toBeNull();
    expect(entrecomillados(check![1])).toEqual([...EXPORT_SCOPES]);
  });

  it("las tres operaciones del ciclo de vida (RN-CIC-14) son las mismas en el CHECK y en `src/core`", () => {
    const tabla = ultimaDefinicion("create table public.space_lifecycle_operations (", "actor_id");
    const check = /kind text not null check \(kind in \(([^)]*)\)\)/.exec(tabla);
    expect(check, "no está el CHECK de kind").not.toBeNull();
    expect(entrecomillados(check![1])).toEqual([...SPACE_LIFECYCLE_OPERATIONS]);
  });

  it("quién mueve cada transición de un informe (§95) lo dicen igual los dos lados", () => {
    const fn = ultimaDefinicion("create or replace function public.report_transition_allowed", "$$;");

    const permitidasEnSql = new Set<string>();
    for (const rama of fn.split("when ").slice(1)) {
      const corte = rama.indexOf(" then ");
      if (corte < 0) continue;
      const izquierda = entrecomillados(rama.slice(0, corte));
      const derecha = entrecomillados(rama.slice(corte));
      if (izquierda.length < 2 || derecha.length === 0) continue;
      const [origen, ...destinos] = izquierda;
      for (const destino of destinos) {
        for (const actor of derecha) permitidasEnSql.add(`${origen}->${destino}:${actor}`);
      }
    }
    expect(permitidasEnSql.size).toBeGreaterThan(0);

    for (const from of REPORT_STATES) {
      for (const to of REPORT_STATES) {
        for (const actor of ["editor", "approver"] as const) {
          expect(reportTransitionAllowed(from, to, actor), `${from} -> ${to} como ${actor}`).toBe(
            permitidasEnSql.has(`${from}->${to}:${actor}`),
          );
        }
      }
    }
  });

  /*
   * Migración 93 (Fase 4, Hito 21). Los catálogos de una incidencia, los
   * ocho temas del centro de ayuda, los cinco componentes de la página de
   * estado y la tabla de transiciones están a los dos lados: en SQL
   * deciden qué acepta el servidor, en TypeScript qué pinta la pantalla.
   */
  it("los seis estados de una incidencia (RN-SOP-04) son los mismos en el CHECK y en `src/core`", () => {
    const tabla = ultimaDefinicion("create table public.incidents (", "constraint incidents_impact_shape");
    const check = /status text not null default 'open' check \(status in \(([^)]*)\)\)/.exec(tabla);
    expect(check, "no está el CHECK de status").not.toBeNull();
    expect(entrecomillados(check![1])).toEqual([...INCIDENT_STATES]);
  });

  it("las categorías de una incidencia (RN-SOP-03) y los temas de ayuda (§133) son los mismos a los dos lados", () => {
    const incidentes = ultimaDefinicion("create table public.incidents (", "constraint incidents_impact_shape");
    const cat = /category text not null check \(category in \(([^)]*)\)\)/.exec(incidentes);
    expect(cat, "no está el CHECK de category").not.toBeNull();
    expect(entrecomillados(cat![1])).toEqual([...INCIDENT_CATEGORIES]);

    const guias = ultimaDefinicion("create table public.help_articles (", "search tsvector");
    const topic = /topic text not null check \(topic in \(([^)]*)\)\)/.exec(guias);
    expect(topic, "no está el CHECK de topic").not.toBeNull();
    expect(entrecomillados(topic![1])).toEqual([...HELP_TOPICS]);

    const impact = /impact text check \(impact is null or impact in \(([^)]*)\)\)/.exec(incidentes);
    expect(impact, "no está el CHECK de impact").not.toBeNull();
    expect(entrecomillados(impact![1])).toEqual([...INCIDENT_IMPACTS]);
  });

  it("quién mueve cada transición de una incidencia (RN-SOP-04) lo dicen igual los dos lados", () => {
    const fn = ultimaDefinicion("create or replace function public.incident_transition_allowed", "$$;");

    // La función tiene una rama por actor; dentro, cada `p_from in (...)
    // and p_to in (...)` o `p_from = 'x' and p_to in (...)` es un bloque
    // de transiciones permitidas.
    const permitidasEnSql = new Set<string>();
    for (const actor of INCIDENT_SIDES) {
      const desde = fn.indexOf(`when p_actor = '${actor}' then`);
      expect(desde, `no está la rama de ${actor}`).toBeGreaterThan(-1);
      const hastaCandidatos = [fn.indexOf("when p_actor", desde + 1), fn.indexOf("else false", desde)].filter(
        (i) => i > -1,
      );
      const rama = fn.slice(desde, Math.min(...hastaCandidatos));
      for (const bloque of rama.split("or (").slice(0)) {
        const origenes = /p_from (?:in \(([^)]*)\)|= '([a-z_]+)')/.exec(bloque);
        const destinos = /p_to (?:in \(([^)]*)\)|= '([a-z_]+)')/.exec(bloque);
        if (!origenes || !destinos) continue;
        const from = origenes[1] ? entrecomillados(origenes[1]) : [origenes[2]!];
        for (const f of from) {
          const tos = destinos[1] ? entrecomillados(destinos[1]) : [destinos[2]!];
          for (const t of tos) permitidasEnSql.add(`${f}->${t}:${actor}`);
        }
      }
    }
    expect(permitidasEnSql.size).toBeGreaterThan(0);

    for (const from of INCIDENT_STATES) {
      for (const to of INCIDENT_STATES) {
        for (const actor of INCIDENT_SIDES) {
          // La función descarta `p_from = p_to` antes de mirar la tabla.
          const enSql = from !== to && permitidasEnSql.has(`${from}->${to}:${actor}`);
          expect(incidentTransitionAllowed(from, to, actor), `${from} -> ${to} como ${actor}`).toBe(enSql);
        }
      }
    }
  });

  it("qué transiciones exigen motivo (RN-SOP-04) y cómo se deriva la prioridad (RN-SOP-05) lo dicen igual los dos lados", () => {
    const motivo = ultimaDefinicion("create or replace function public.incident_needs_reason", "$$;");
    expect(motivo).toContain("p_to = 'needs_information' or (p_to = 'closed' and p_from <> 'resolved')");
    expect(incidentNeedsReason("open", "needs_information")).toBe(true);
    expect(incidentNeedsReason("in_review", "closed")).toBe(true);
    expect(incidentNeedsReason("resolved", "closed")).toBe(false);

    const prioridad = ultimaDefinicion("create or replace function public.incident_priority_for", "$$;");
    expect(prioridad).toContain("when p_impact = 'critical' then 'critical'");
    expect(prioridad).toContain("when p_plan = 'agency' then 'high'");
    expect(prioridad).toContain("else 'standard'");
    expect(incidentPriorityFor("error", "critical", "agency")).toBe("critical");
    expect(incidentPriorityFor("error", "low", "agency")).toBe("high");
    expect(incidentPriorityFor("error", "low", "pro")).toBe("standard");
    expect(incidentPriorityFor("suggestion", null, "agency")).toBeNull();
  });

  it("decisión 47 · la lista de los catorce alérgenos ya no está a ningún lado", () => {
    // Entre el 17 y el 19/09/2026 esta lista estaba escrita dos veces —en
    // `allergen_codes()` y en `src/core/allergens.ts`— y este test las
    // comparaba, orden incluido. La decisión 47 la retiró de los dos
    // sitios: los alérgenos son ahora una nota de texto libre (§39).
    //
    // El test se da la vuelta en vez de borrarse, y eso es el falso-cerrado:
    // si alguien vuelve a traer la lista a SQL sin reescribir §39, esto se
    // pone rojo y hay que venir a explicarlo.
    //
    // Se mira el ESTADO FINAL, no si la palabra aparece: la migración 101
    // crea `allergen_codes()` y no se edita (CLAUDE.md), la 102 la borra.
    // Lo que tiene que valer es que la última palabra sea el `drop`.
    for (const nombre of [
      "allergen_codes",
      "allergen_label",
      "validate_dish_allergens",
      "validate_menu_allergens",
    ]) {
      const mencionan = migracionesEnOrden().filter((sql) =>
        sql.includes(`public.${nombre}(`),
      );
      expect(mencionan.length, `nadie nombra ya \`${nombre}()\``).toBeGreaterThan(0);
      const ultima = mencionan[mencionan.length - 1];
      const trozos = ultima.split(`public.${nombre}(`);
      const antesDelUltimo = trozos[trozos.length - 2] ?? "";
      expect(
        /drop function\s+(if exists\s+)?$/i.test(antesDelUltimo.trimEnd() + " "),
        `lo último que las migraciones hacen con \`${nombre}()\` no es borrarla: ` +
          "si volvió a propósito, reescribe §39 y este test",
      ).toBe(true);
    }
  });

  it("los cinco componentes y las tres gravedades de la página de estado (RN-SOP-12/13) son los mismos a los dos lados", () => {
    const tabla = ultimaDefinicion("create table public.platform_status_events (", "constraint platform_status_events_window");
    const comp = /component text not null check \(component in \(([^)]*)\)\)/.exec(tabla);
    const sev = /severity text not null check \(severity in \(([^)]*)\)\)/.exec(tabla);
    expect(comp, "no está el CHECK de component").not.toBeNull();
    expect(sev, "no está el CHECK de severity").not.toBeNull();
    expect(entrecomillados(comp![1])).toEqual([...STATUS_COMPONENTS]);
    expect(entrecomillados(sev![1])).toEqual([...STATUS_SEVERITIES]);
  });
});
