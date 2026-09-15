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
} from "./cuotly-subscription";
import { MANDATORY_EVENTS, NOTIFICATION_EVENTS } from "./notifications";
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

  it("los cuatro modos del espacio (RN-SUB-02) son los mismos en el CHECK y en `src/core`", () => {
    const columna = ultimaDefinicion("alter table public.spaces add column if not exists cuotly_status text", "));");
    const check = /cuotly_status in \(([^)]*)\)/.exec(columna);
    expect(check, "no está el CHECK de cuotly_status").not.toBeNull();
    expect(entrecomillados(check![1])).toEqual([...SPACE_CUOTLY_STATES]);
  });

  it("qué avisos no se pueden desactivar (RN-NOT-03) lo dicen igual los dos lados", () => {
    // `notification_event_is_mandatory()` la reescribió la 90 al añadir los
    // dos de la suscripción; se lee la última definición.
    const fn = ultimaDefinicion("create or replace function public.notification_event_is_mandatory", "$$;");
    const enSql = entrecomillados(fn.slice(fn.indexOf("select p_event_type in")));
    expect([...MANDATORY_EVENTS].sort()).toEqual([...enSql].sort());
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
});
