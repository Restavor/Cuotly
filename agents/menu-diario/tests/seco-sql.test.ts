import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { READ_RPCS, READ_TABLES } from "../src/services/read-only-gate.ts";

/**
 * La puerta de solo lectura (`src/services/read-only-gate.ts`) fija qué tablas se leen y qué función se llama.
 * El test SQL `supabase/tests/agente_menu_seco.sql` comprueba, del lado de la base, que esas lecturas no pueden escribir
 * (toda la cadena de funciones es STABLE). Sus dos listas son una copia de las de la puerta: si alguien añade una tabla o una
 * función a la puerta y no al SQL, la base dejaría de vigilarla sin que nada lo avisara. Este test lo avisa.
 */
const SQL_URL = new URL("../../../supabase/tests/agente_menu_seco.sql", import.meta.url);
const sql = readFileSync(SQL_URL, "utf8");

/** Los nombres entre comillas de `<nombre> constant text[] := array['a', 'b'];` en el SQL. */
function sqlList(name: string): string[] {
  const found = new RegExp(`\\b${name}\\s+constant\\s+text\\[\\]\\s*:=\\s*array\\[([^\\]]*)\\]`).exec(sql);
  const body = found?.[1];
  if (body === undefined) throw new Error(`No encuentro la lista ${name} en supabase/tests/agente_menu_seco.sql`);
  return [...body.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1] ?? "");
}

describe("seco · el test SQL de solo lectura vigila lo mismo que la puerta", () => {
  it("lee las dos listas del SQL y no están vacías (si no, este test pasaría sin mirar nada)", () => {
    expect(sqlList("c_tablas").length).toBeGreaterThanOrEqual(1);
    expect(sqlList("c_raices").length).toBeGreaterThanOrEqual(1);
  });

  it("las tablas del SQL son exactamente las que la puerta deja leer", () => {
    expect([...sqlList("c_tablas")].sort()).toEqual(Object.keys(READ_TABLES).sort());
  });

  it("toda función que la puerta deja llamar está entre las de partida del SQL", () => {
    const roots = new Set(sqlList("c_raices"));
    const missing = READ_RPCS.filter((rpc) => !roots.has(rpc));
    expect(missing, "la puerta deja llamar a una función que la base no vigila: añadirla a c_raices").toEqual([]);
  });

  it("el SQL no escribe nada fuera de su tabla temporal", () => {
    const code = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .replace(/on\s+commit\s+drop/gi, "");
    const writes = [...code.matchAll(/\b(insert\s+into|update|delete\s+from|truncate|alter|drop)\s+(\w+(?:\.\w+)?)/gi)].map(
      (m) => `${(m[1] ?? "").toLowerCase()} ${m[2] ?? ""}`.replace(/\s+/g, " "),
    );
    expect(writes).toEqual(["insert into cadena_seco"]);
  });
});
