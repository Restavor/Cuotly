import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AUDIT_ACTIONS,
  AUDIT_FAMILY_CAPABILITY,
  AUDIT_ROW_VISIBLE_ENTITIES,
  auditChanges,
  auditCsv,
  auditDayWindow,
  auditEntityLink,
  auditFamily,
} from "./audit";
import { es } from "../i18n/es";

/**
 * Barrido en falso-cerrado sobre la auditoría (HU-36, §21.2).
 *
 * La pantalla de Ajustes tiene que poner en español lo que la base escribe
 * en `audit_log.action`, y decidir a quién enseñárselo. Las dos cosas son
 * listas, y una lista escrita a mano se separa de la realidad en cuanto
 * alguien añade una acción en una migración — que es exactamente lo que le
 * pasó tres veces a la lista de columnas con identidad y una cuarta a las
 * listas de estados de `naming.ts`.
 *
 * Así que aquí no se compara con otra lista escrita a mano: se leen las
 * migraciones, que es lo que la base va a escribir de verdad, y se
 * comparan con el catálogo, con el diccionario y con el reparto por
 * familias de la propia migración 49.
 */

const MIGRATIONS = join(__dirname, "../../../../supabase/migrations");

function sqlDeLasMigraciones(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf-8"))
    .join("\n");
}

/**
 * Las sentencias que escriben en el libro. Se recorta desde
 * `insert into public.audit_log` hasta el `;` que la cierra, para no
 * confundir un literal cualquiera del archivo con una acción.
 */
function sentenciasDeAuditoria(sql: string): readonly string[] {
  const trozos: string[] = [];
  const marca = "insert into public.audit_log";
  let desde = sql.indexOf(marca);
  while (desde !== -1) {
    const fin = sql.indexOf(";", desde);
    trozos.push(sql.slice(desde, fin === -1 ? sql.length : fin));
    desde = sql.indexOf(marca, desde + marca.length);
  }
  return trozos;
}

function accionesEnLasMigraciones(): ReadonlySet<string> {
  const encontradas = new Set<string>();
  for (const sentencia of sentenciasDeAuditoria(sqlDeLasMigraciones())) {
    for (const [, accion] of sentencia.matchAll(/'([a-z_]+\.[a-z_]+)'/g)) {
      encontradas.add(accion);
    }
  }
  return encontradas;
}

/**
 * Pares (acción, tipo de entidad) tal y como se escriben: el tipo va
 * siempre pegado detrás de la acción en la lista de valores.
 */
function entidadesEnLasMigraciones(): ReadonlySet<string> {
  const encontradas = new Set<string>();
  for (const sentencia of sentenciasDeAuditoria(sqlDeLasMigraciones())) {
    for (const [, , entidad] of sentencia.matchAll(/'([a-z_]+\.[a-z_]+)'\s*,\s*'([a-z_]+)'/g)) {
      encontradas.add(entidad);
    }
  }
  return encontradas;
}

describe("HU-36 · el catálogo de acciones de auditoría cubre lo que la base escribe", () => {
  it("no hay ninguna acción en las migraciones que falte en el catálogo", () => {
    const enLaBase = [...accionesEnLasMigraciones()].sort();
    const enElCatalogo = new Set<string>(AUDIT_ACTIONS);

    expect(
      enLaBase.filter((accion) => !enElCatalogo.has(accion)),
      "acciones que alguna migración escribe y que el catálogo de src/core/audit.ts no conoce",
    ).toEqual([]);
  });

  it("no hay ninguna acción en el catálogo que ya nadie escriba", () => {
    // El otro lado del falso-cerrado: una acción huérfana suele ser el
    // resto de algo renombrado a medias, y su nombre en español miente.
    const enLaBase = accionesEnLasMigraciones();

    expect(
      AUDIT_ACTIONS.filter((accion) => !enLaBase.has(accion)),
      "acciones del catálogo que ninguna migración escribe: bórralas o corrige el nombre",
    ).toEqual([]);
  });

  it("cada acción tiene nombre en español (CA-21)", () => {
    const sinNombre = AUDIT_ACTIONS.filter((accion) => !(accion in es.settings.auditActions));

    expect(sinNombre, "acciones sin nombre en es.settings.auditActions").toEqual([]);
  });

  it("el diccionario no nombra acciones que no existen", () => {
    const conocidas = new Set<string>(AUDIT_ACTIONS);
    const sobrantes = Object.keys(es.settings.auditActions).filter(
      (accion) => !conocidas.has(accion),
    );

    expect(sobrantes, "nombres en español de acciones que la base no escribe").toEqual([]);
  });

  it("cada familia está clasificada, por capacidad o por fila", () => {
    const sinClasificar = [...accionesEnLasMigraciones()]
      .map(auditFamily)
      .filter((familia) => !(familia in AUDIT_FAMILY_CAPABILITY));

    expect(
      [...new Set(sinClasificar)],
      "familias sin clasificar: di qué capacidad hace falta para verlas, o clasifícalas como decididas por la fila",
    ).toEqual([]);
  });

  it("los apuntes sin espacio solo los ven el propietario de la plataforma y quien los hizo", () => {
    // Es lo que sostiene la exención de `session` y `space_request` en el
    // test de abajo. Si alguien ensancha esta rama —por ejemplo quitando
    // el `actor_id = auth.uid()`—, los apuntes de plataforma pasarían a
    // verse desde fuera y este test lo dice.
    const sql = sqlDeLasMigraciones();
    const desde = sql.lastIndexOf("create policy audit_log_select");
    expect(desde, "no se encuentra la política audit_log_select").toBeGreaterThan(-1);
    const sinEspacios = sql.slice(desde, sql.indexOf(";", desde)).replace(/\s+/g, " ");
    expect(
      sinEspacios.includes("space_id is null and actor_id = auth.uid()"),
      "audit_log_select ya no restringe los apuntes sin espacio a su propio actor",
    ).toBe(true);
    expect(
      sinEspacios.includes("is_platform_owner()"),
      "audit_log_select ya no deja al propietario de la plataforma ver los apuntes sin espacio",
    ).toBe(true);
  });

  it("las familias decididas por la fila apuntan a una entidad que la base sabe resolver", () => {
    // Una familia con capacidad `null` cuya entidad no esté en
    // `audit_entity_is_visible()` no la ve nadie salvo el propietario y
    // quien la ejecutó — en silencio, que es lo peligroso.
    // `session` y `space_request` no las decide la fila: las decide la
    // rama de plataforma de `audit_log_select` —`space_id is null and
    // actor_id = auth.uid()`— más el propietario de la plataforma. El test
    // de abajo comprueba que esa rama existe de verdad, para que esta
    // exención no sea una promesa escrita en un comentario.
    const deLaPlataforma = new Set([
      "session",
      "space_request",
      "platform",
      // Hito 21 · festivos y estado de Cuotly: sin espacio, como `platform`.
      "platform_holiday",
      "platform_status",
      // Hito 22 · el teléfono con push: sin espacio, como `session`; lo ve
      // quien lo registró o lo perdió (RN-MOV-05).
      "push_device",
      // Paso 2 · la solicitud de acceso (migración 97): sin espacio, como
      // `space_request`. Tres de sus seis apuntes van con `actor_id` nulo
      // porque quien los provoca no tiene cuenta, así que ni siquiera la
      // rama del propio actor se los enseña: los ve Bosco y nadie más, que
      // es lo que RN-ACC-07 quiere.
      "access_request",
    ]);
    const porFila = Object.entries(AUDIT_FAMILY_CAPABILITY)
      .filter(([familia, capacidad]) => capacidad === null && !deLaPlataforma.has(familia))
      .map(([familia]) => familia);

    const resolubles = new Set<string>(AUDIT_ROW_VISIBLE_ENTITIES);

    expect(
      porFila.filter((familia) => !resolubles.has(familia)),
      "familias que dependen de la fila pero cuya entidad no resuelve audit_entity_is_visible()",
    ).toEqual([]);
  });

  it("los tipos de entidad que escriben las migraciones tienen nombre en español", () => {
    const sinNombre = [...entidadesEnLasMigraciones()].filter(
      (entidad) => !(entidad in es.settings.auditEntities),
    );

    expect(sinNombre, "tipos de entidad sin nombre en es.settings.auditEntities").toEqual([]);
  });
});

describe("HU-36 · el reparto por familias coincide con el de la migración", () => {
  /**
   * `audit_action_capability()` es quien manda de verdad: está dentro de
   * la política de RLS. Si este archivo dice otra cosa, la pantalla ofrece
   * filtros que no corresponden con lo que el servidor deja ver.
   */
  function repartoDeLaMigracion(): Readonly<Record<string, string | null>> {
    // La ÚLTIMA definición de la función, no la de la migración que la
    // creó: `audit_action_capability()` se reescribe con
    // `create or replace` cada vez que aparece una familia nueva (la 49 la
    // creó, la 58 le añadió `group`), y leer solo la primera dejaría esta
    // comprobación comparando contra un reparto viejo — que es justo el
    // desfase que existe para impedir.
    const cuerpos = readdirSync(MIGRATIONS)
      .filter((archivo) => archivo.endsWith(".sql"))
      .sort()
      .flatMap((archivo) => {
        const sql = readFileSync(join(MIGRATIONS, archivo), "utf-8");
        const desde = sql.indexOf("function public.audit_action_capability");
        if (desde === -1) return [];
        return [sql.slice(desde, sql.indexOf("$$;", desde))];
      });

    const cuerpo = cuerpos[cuerpos.length - 1] ?? "";

    const reparto: Record<string, string | null> = {};
    for (const [, familia, capacidad] of cuerpo.matchAll(
      /when '([a-z_]+)' then '([a-z_]+)'/g,
    )) {
      reparto[familia] = capacidad;
    }
    return reparto;
  }

  it("toda familia con capacidad en la migración tiene la misma aquí", () => {
    const enSql = repartoDeLaMigracion();

    // Que el parseo no sea vacuo: la migración reparte al menos diez
    // familias, y si el día de mañana cambia de forma y aquí se leen cero,
    // esta comprobación pasaría sin comparar nada.
    expect(Object.keys(enSql).length).toBeGreaterThanOrEqual(10);

    for (const [familia, capacidad] of Object.entries(enSql)) {
      expect(AUDIT_FAMILY_CAPABILITY[familia], `familia ${familia}`).toBe(capacidad);
    }
  });

  it("ninguna familia con capacidad aquí falta en la migración", () => {
    const enSql = repartoDeLaMigracion();
    const soloAqui = Object.entries(AUDIT_FAMILY_CAPABILITY)
      .filter(([familia, capacidad]) => capacidad !== null && !(familia in enSql))
      .map(([familia]) => familia);

    expect(
      soloAqui,
      "familias que aquí exigen una capacidad y en la migración no: la pantalla filtraría distinto de lo que hace RLS",
    ).toEqual([]);
  });
});

describe("HU-36 · P4 · el valor anterior no se pierde", () => {
  it("lista solo los campos que cambiaron", () => {
    const cambios = auditChanges(
      { state: "assigned", assignee: "eva" },
      { state: "in_progress", assignee: "eva" },
    );

    expect(cambios).toEqual([{ field: "state", before: "assigned", after: "in_progress" }]);
  });

  it("recorre los dos lados: un campo que aparece de nuevas también se cuenta", () => {
    const cambios = auditChanges({ name: "Antes" }, { name: "Antes", timezone: "Europe/Madrid" });

    expect(cambios).toEqual([{ field: "timezone", before: null, after: "Europe/Madrid" }]);
  });

  it("un alta sin valor anterior enseña solo el nuevo", () => {
    expect(auditChanges(null, { name: "Restavor" })).toEqual([
      { field: "name", before: null, after: "Restavor" },
    ]);
  });

  it("una acción que no guarda valores no inventa ninguno", () => {
    expect(auditChanges(null, null)).toEqual([]);
  });

  it("un valor compuesto se enseña entero, no como [object Object]", () => {
    const cambios = auditChanges(null, { plan: { name: "Impulso", priceCents: 39900 } });

    expect(cambios[0].after).toBe('{"name":"Impulso","priceCents":39900}');
  });
});

describe("HU-36 · el filtro por días se resuelve en la zona del espacio", () => {
  it("el día empieza a medianoche en la zona del espacio, no en UTC", () => {
    // Madrid en septiembre va en UTC+2: el 3 de septiembre empieza a las
    // 22:00Z del 2.
    expect(auditDayWindow("2026-09-03", null, "Europe/Madrid").from).toBe(
      "2026-09-02T22:00:00.000Z",
    );
  });

  it("el límite superior es exclusivo: el principio del día siguiente", () => {
    // Un `23:59:59` se dejaría fuera el último segundo del día, y ahí es
    // justo donde caen los barridos de medianoche.
    expect(auditDayWindow(null, "2026-09-03", "Europe/Madrid").to).toBe(
      "2026-09-03T22:00:00.000Z",
    );
  });

  it("una zona al oeste desplaza el día en el otro sentido", () => {
    expect(auditDayWindow("2026-09-03", null, "America/Mexico_City").from).toBe(
      "2026-09-03T06:00:00.000Z",
    );
  });

  it("cruza el fin de mes sin inventarse un 32 de agosto", () => {
    expect(auditDayWindow(null, "2026-08-31", "Europe/Madrid").to).toBe(
      "2026-08-31T22:00:00.000Z",
    );
  });

  it("un día que no existe no filtra nada, en vez de filtrar por otro", () => {
    expect(auditDayWindow("2026-02-31", null, "Europe/Madrid").from).toBeNull();
    expect(auditDayWindow("ayer", null, "Europe/Madrid").from).toBeNull();
  });

  it("sin filtro no hay límites", () => {
    expect(auditDayWindow(null, null, "Europe/Madrid")).toEqual({ from: null, to: null });
  });
});

describe("M62 · auditCsv", () => {
  it("escribe cabecera y filas, con BOM y comillas donde hacen falta", () => {
    const csv = auditCsv(["Fecha", "Motivo"], [["23/09/2026 10:00", 'Dijo "vale", y siguió']]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual(["Fecha,Motivo", '23/09/2026 10:00,"Dijo ""vale"", y siguió"']);
  });

  it("un texto que empieza como una fórmula no se ejecuta al abrirlo", () => {
    const csv = auditCsv(["Motivo"], [["=HYPERLINK(\"x\")"], ["+1"], ["-2"], ["@a"]]);
    const filas = csv.slice(1).split("\r\n").slice(1);
    expect(filas).toEqual(['"\'=HYPERLINK(""x"")"', "'+1", "'-2", "'@a"]);
  });
});

describe("M48 · auditEntityLink", () => {
  it("lleva a la pantalla de lo que tocó el apunte", () => {
    expect(auditEntityLink("demo", "request", "r-1")).toEqual({
      kind: "request",
      href: "/espacios/demo/solicitudes/r-1",
    });
    expect(auditEntityLink("demo", "job", "j-1")?.href).toBe("/espacios/demo/trabajos/j-1");
    expect(auditEntityLink("demo", "menu", "m-1")?.href).toBe("/espacios/demo/menu-diario/m-1");
    expect(auditEntityLink("demo", "quote", "q-1")?.href).toBe(
      "/espacios/demo/finanzas/presupuestos/q-1",
    );
    expect(auditEntityLink("demo", "charge", "c-1")?.href).toBe("/espacios/demo/finanzas/cobros/c-1");
    expect(auditEntityLink("demo", "report", "i-1")?.href).toBe("/espacios/demo/informes/i-1");
  });

  it("sin pantalla propia o sin identificador no hay enlace, en vez de uno roto", () => {
    expect(auditEntityLink("demo", "task", "t-1")).toBeNull();
    expect(auditEntityLink("demo", "file", "f-1")).toBeNull();
    expect(auditEntityLink("demo", "establishment", "e-1")).toBeNull();
    expect(auditEntityLink("demo", "request", null)).toBeNull();
  });
});
