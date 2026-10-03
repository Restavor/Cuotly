import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * RN-APP-08 · la tablet del local lee con la clave de servicio, que no mira de quién es cada fila. Lo único que acota sus
 * lecturas es que cada consulta lleve su filtro por restaurante. Esta prueba lo vigila en TODO lo que puede ejecutarse en
 * nombre de una tablet: si alguien añade una lectura sin filtro, falla aquí antes de que pueda leer otro restaurante.
 */
const SRC = join(process.cwd(), "src");

function ficheros(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) ficheros(ruta, acumulado);
    else if (/\.(ts|tsx)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) acumulado.push(ruta);
  }
  return acumulado;
}

/** Lo que puede correr con el cliente de una tablet: las pantallas y acciones de `/agents/[id]`, su contexto y sus pasarelas. */
const CANDIDATOS = [
  ...ficheros(join(SRC, "app", "agents", "[id]")),
  join(SRC, "app", "agents", "agents-context.ts"),
  join(SRC, "services", "reservations-gateway.ts"),
  join(SRC, "services", "agents", "team-gateway.ts"),
  // Fase E: la pasarela del plan y los pagos y el Excel de las reservas.
  join(SRC, "services", "agents", "billing-gateway.ts"),
  join(SRC, "services", "agents", "reservations-export.ts"),
];

const FILTRO = /\.eq\(\s*"(establishment_id|id)"\s*,\s*(establishmentId|input\.establishmentId|id)\s*\)/;

describe("RN-APP-08 · toda lectura que puede hacer una tablet va acotada a su restaurante", () => {
  it("RN-APP-08 · cada `.from(...)` lleva su filtro por restaurante en la misma consulta", () => {
    const sinFiltro: string[] = [];
    for (const ruta of CANDIDATOS) {
      const texto = readFileSync(ruta, "utf8");
      for (const m of texto.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g)) {
        const desde = m.index ?? 0;
        const fin = texto.indexOf(";", desde);
        const consulta = texto.slice(desde, fin === -1 ? desde + 600 : fin + 1);
        if (!FILTRO.test(consulta)) sinFiltro.push(`${relative(SRC, ruta)} · ${m[1]}`);
      }
    }
    expect(sinFiltro, "lecturas de tabla sin filtro por `establishment_id` (o por el `id` del restaurante)").toEqual([]);
  });

  it("RN-APP-08 · hay algo que vigilar (la prueba no es vacía)", () => {
    const total = CANDIDATOS.reduce((n, ruta) => n + [...readFileSync(ruta, "utf8").matchAll(/\.from\(\s*"[a-z_]+"\s*\)/g)].length, 0);
    expect(total).toBeGreaterThan(8);
  });

  it("RN-APP-08 · las pantallas y acciones no usan el cliente de la persona (`createClient`) para leer la agenda: pasan por `agentsDb`", () => {
    const usan: string[] = [];
    // Las excepciones tienen motivo: solo trabajan con la sesión de una persona con cuenta (invitar, «Mi PIN», quitar a un Encargado, soporte).
    // Fase E: contratar, pagar, darse de baja y descargar todo es del Propietario con su cuenta (PRD §3.2); la tablet
    // del local no entra (`guardAgentsPage` la deja fuera y cada acción lo repite).
    const SOLO_CUENTA = new Set([
      join("app", "agents", "[id]", "reservas", "ajustes", "equipo", "actions.ts"),
      join("app", "agents", "[id]", "condiciones", "page.tsx"),
      join("app", "agents", "[id]", "pendiente-de-pago", "page.tsx"),
      join("app", "agents", "[id]", "plan", "page.tsx"),
      join("app", "agents", "[id]", "plan", "actions.ts"),
      join("app", "agents", "[id]", "cuenta-cerrada", "page.tsx"),
      join("app", "agents", "[id]", "reservas", "exportar", "route.ts"),
      // Fase E2: el saldo lo ven el Propietario, el Encargado y Restavor con su cuenta; la tablet del local no lo ve (ni
      // `view_balance` ni `guardAgentsPage` la dejan) y recargar es solo del Propietario.
      join("app", "agents", "[id]", "saldo", "page.tsx"),
      join("app", "agents", "[id]", "saldo", "actions.ts"),
      join("app", "agents", "[id]", "saldo", "exportar", "route.ts"),
    ]);
    for (const ruta of CANDIDATOS) {
      const rel = relative(SRC, ruta);
      if (SOLO_CUENTA.has(rel)) continue;
      if (/@\/lib\/supabase\/server/.test(readFileSync(ruta, "utf8")) && !rel.endsWith("agents-context.ts")) usan.push(rel);
    }
    expect(usan, "pantallas que leen con la sesión de la persona en vez de `agentsDb()`").toEqual([]);
  });
});
